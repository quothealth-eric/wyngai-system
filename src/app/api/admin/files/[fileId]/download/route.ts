import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export const runtime = 'nodejs';

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
  { params }: { params: { fileId: string } }
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

    const { fileId } = params;

    // Get file metadata
    const { data: fileData, error: fileError } = await supabaseAdmin
      .from('case_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError || !fileData) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Download file from storage
    const { data: file, error: downloadError } = await supabaseAdmin.storage
      .from('wyng_cases')
      .download(fileData.storage_path);

    if (downloadError || !file) {
      return NextResponse.json({ error: 'File download failed' }, { status: 500 });
    }

    // Return file
    const buffer = await file.arrayBuffer();
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': fileData.mime,
        'Content-Disposition': `attachment; filename="${fileData.filename}"`,
        'Content-Length': buffer.byteLength.toString(),
      },
    });

  } catch (error) {
    console.error('❌ File download failed:', error);
    return NextResponse.json(
      { error: 'Download failed' },
      { status: 500 }
    );
  }
}
