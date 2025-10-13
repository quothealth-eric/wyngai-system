import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth } from '@/lib/admin/auth'
// JSZip import temporarily removed for build compatibility
// import JSZip from 'jszip'

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

    // Create comprehensive case summary (ZIP functionality will be added later)
    const caseSummary = {
      case_id: caseData.case_id,
      created_at: caseData.created_at,
      status: caseData.status,
      submit_email: caseData.submit_email,
      user_ip: caseData.user_ip,
      description: caseData.case_profile?.[0]?.description || null,
      insurance: caseData.case_profile?.[0]?.insurance || null,
      files: files.map(f => ({
        id: f.id,
        filename: f.filename,
        size_bytes: f.size_bytes,
        mime: f.mime,
        storage_path: f.storage_path,
        uploaded_at: f.uploaded_at,
        download_url: `/api/admin/files/${f.id}/download`
      })),
      case_info: {
        total_files: files.length,
        total_size_mb: Math.round(files.reduce((sum, f) => sum + f.size_bytes, 0) / 1024 / 1024 * 100) / 100,
        file_types: [...new Set(files.map(f => f.mime))],
        created_date: new Date(caseData.created_at).toLocaleString(),
        admin_notes: 'Download individual files using the download_url for each file'
      }
    }

    console.log(`✅ Admin: Case summary created - ${files.length} files`)

    return new NextResponse(JSON.stringify(caseSummary, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="case-${params.caseId}-summary.json"`,
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