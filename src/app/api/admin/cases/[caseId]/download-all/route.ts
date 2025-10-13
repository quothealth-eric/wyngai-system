import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth } from '@/lib/admin/auth'
import JSZip from 'jszip'

export async function GET(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  // Require admin authentication
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    console.log(`📦 Admin: Creating case packet for ${params.caseId}`)

    // Get case details with profile
    const { data: caseData, error: caseError } = await supabaseAdmin
      .from('cases')
      .select(`
        *,
        case_profile (*)
      `)
      .eq('case_id', params.caseId)
      .single()

    if (caseError || !caseData) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    // Get all files for the case
    const { data: files, error: filesError } = await supabaseAdmin
      .from('case_files')
      .select('*')
      .eq('case_id', params.caseId)
      .order('uploaded_at', { ascending: true })

    if (filesError) {
      return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 })
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files found for this case' }, { status: 404 })
    }

    // Create ZIP file
    const zip = new JSZip()

    // Add case summary file
    const caseSummary = {
      case_id: caseData.case_id,
      created_at: caseData.created_at,
      status: caseData.status,
      submit_email: caseData.submit_email,
      description: caseData.case_profile?.[0]?.description || null,
      insurance: caseData.case_profile?.[0]?.insurance || null,
      files: files.map(f => ({
        filename: f.filename,
        size: f.size_bytes,
        type: f.mime,
        uploaded_at: f.uploaded_at
      }))
    }

    zip.file('case-summary.json', JSON.stringify(caseSummary, null, 2))

    // Add readable case info
    let caseInfoText = `WYNG CASE ANALYSIS PACKET\\n`
    caseInfoText += `================================\\n\\n`
    caseInfoText += `Case ID: ${caseData.case_id}\\n`
    caseInfoText += `Created: ${new Date(caseData.created_at).toLocaleString()}\\n`
    caseInfoText += `Status: ${caseData.status}\\n`
    caseInfoText += `Email: ${caseData.submit_email || 'Not provided'}\\n\\n`

    if (caseData.case_profile?.[0]?.description) {
      caseInfoText += `PROBLEM DESCRIPTION:\\n`
      caseInfoText += `${caseData.case_profile[0].description}\\n\\n`
    }

    if (caseData.case_profile?.[0]?.insurance) {
      caseInfoText += `INSURANCE INFORMATION:\\n`
      const insurance = caseData.case_profile[0].insurance
      Object.entries(insurance).forEach(([key, value]) => {
        if (value) {
          caseInfoText += `${key.replace(/([A-Z])/g, ' $1').trim()}: ${value}\\n`
        }
      })
      caseInfoText += `\\n`
    }

    caseInfoText += `UPLOADED FILES (${files.length}):\\n`
    files.forEach((file, index) => {
      caseInfoText += `${index + 1}. ${file.filename} (${Math.round(file.size_bytes / 1024)}KB)\\n`
    })

    zip.file('CASE-INFO.txt', caseInfoText)

    // Download and add all files
    const downloadPromises = files.map(async (file, index) => {
      try {
        const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
          .from('wyng_cases')
          .download(file.storage_path)

        if (downloadError) {
          console.error(`Failed to download ${file.filename}:`, downloadError)
          return null
        }

        const buffer = await fileBlob.arrayBuffer()
        const paddedIndex = (index + 1).toString().padStart(2, '0')
        const filename = `${paddedIndex}-${file.filename}`

        zip.file(`files/${filename}`, buffer)
        return filename
      } catch (error) {
        console.error(`Error processing ${file.filename}:`, error)
        return null
      }
    })

    await Promise.all(downloadPromises)

    // Generate ZIP
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })

    console.log(`✅ Admin: Case packet created - ${files.length} files`)

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="case-${params.caseId}-packet.zip"`,
        'Content-Length': zipBuffer.byteLength.toString(),
        'Cache-Control': 'no-cache'
      }
    })

  } catch (error) {
    console.error('❌ Admin case packet API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}