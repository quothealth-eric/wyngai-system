import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if RAG service is available
    const ragEndpoint = process.env.RAG_ENDPOINT || 'http://localhost:8000';

    const response = await fetch(`${ragEndpoint}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    }).catch(() => null);

    if (response && response.ok) {
      const health = await response.json();
      return NextResponse.json({
        status: 'healthy',
        rag_available: true,
        ...health
      });
    }

    // RAG not available but system still functional
    return NextResponse.json({
      status: 'degraded',
      rag_available: false,
      message: 'Enhanced RAG service unavailable, using fallback responses'
    });

  } catch (error) {
    console.error('RAG health check error:', error);
    return NextResponse.json({
      status: 'error',
      rag_available: false,
      error: 'Health check failed'
    }, { status: 503 });
  }
}