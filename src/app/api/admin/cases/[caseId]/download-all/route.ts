import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = 'nodejs';
export const maxDuration = 60;

// Basic Auth check
function checkAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const [username, password] = credentials.split(':');
  
  return username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  try {
    // Check authentication
    if (!checkAuth(request)) {
      return new NextResponse('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Admin Panel"',
        },
      });
    }

    const { caseId } = params;
    console.log(`📦 Creating download package for case: ${caseId}`);

    // Get case data
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select(`
        *,
        case_profile (*),
        case_files (*)
      `)
      .eq('case_id', caseId)
      .single();

    if (caseError || !caseData) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // Create ZIP file
    const zip = new JSZip();

    // Add case summary
    const caseSummary = {
      case_id: caseData.case_id,
      created_at: caseData.created_at,
      status: caseData.status,
      submit_email: caseData.submit_email,
      user_ip: caseData.user_ip,
      description: caseData.case_profile?.description,
      insurance: caseData.case_profile?.insurance,
      files: caseData.case_files.map((file: any) => ({
        filename: file.filename,
        size: file.size_bytes,
        type: file.mime,
        uploaded_at: file.uploaded_at
      }))
    };

    zip.file('case-summary.json', JSON.stringify(caseSummary, null, 2));

    // Add files
    for (const file of caseData.case_files) {
      try {
        const { data: fileData } = await supabase.storage
          .from('wyng_cases')
          .download(file.storage_path);

        if (fileData) {
          const buffer = await fileData.arrayBuffer();
          zip.file(file.filename, buffer);
        }
      } catch (error) {
        console.error(`Failed to download file ${file.filename}:`, error);
      }
    }

    // Generate ZIP
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="case-${caseId}-packet.zip"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('❌ Download failed:', error);
    return NextResponse.json(
      { error: 'Download failed' },
      { status: 500 }
    );
  }
}
