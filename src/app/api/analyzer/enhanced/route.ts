import { NextRequest, NextResponse } from 'next/server';
import { enhancedBillAnalyzer, BillAnalysisContext } from '@/lib/enhanced-bill-analyzer';

// Route configuration
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for complex analysis
export const dynamic = 'force-dynamic';

// Helper function to convert file to base64
async function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return {
    data: base64,
    mimeType: file.type
  };
}

export async function POST(request: NextRequest) {
  try {
    // Check if analyzer is available
    const availability = enhancedBillAnalyzer.isAvailable();
    if (!availability.anthropic && !availability.openai) {
      return NextResponse.json(
        {
          error: 'No AI providers available. Please configure ANTHROPIC_API_KEY or OPENAI_API_KEY environment variables.'
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();

    // Extract context JSON if provided
    let context: BillAnalysisContext = {};
    const contextStr = formData.get('context');
    if (contextStr && typeof contextStr === 'string') {
      try {
        context = JSON.parse(contextStr);
      } catch (error) {
        console.warn('Failed to parse context JSON:', error);
      }
    }

    // Extract provider preference
    const provider = (formData.get('provider') as 'anthropic' | 'openai' | 'both') || 'both';

    // Extract images
    const images: Array<{ data: string; mimeType: string }> = [];
    const imageFiles: File[] = [];

    // Get all files from formData
    const entries = Array.from(formData.entries());
    for (const [key, value] of entries) {
      if (value instanceof File && value.type.startsWith('image/')) {
        imageFiles.push(value);
      }
    }

    if (imageFiles.length === 0) {
      return NextResponse.json(
        { error: 'No image files provided. Please upload at least one bill image.' },
        { status: 400 }
      );
    }

    // Convert files to base64
    for (const file of imageFiles) {
      const imageData = await fileToBase64(file);
      images.push(imageData);
    }

    console.log(`Analyzing ${images.length} images with context:`, context);
    console.log('Available providers:', availability);
    console.log('Requested provider:', provider);

    // Perform analysis
    const startTime = Date.now();
    const results = await enhancedBillAnalyzer.analyze(images, context, provider);
    const analysisTime = Date.now() - startTime;

    // Return results with metadata
    return NextResponse.json({
      success: true,
      metadata: {
        analysisTime,
        imageCount: images.length,
        providersUsed: Object.keys(results),
        availability,
        timestamp: new Date().toISOString()
      },
      results
    });

  } catch (error) {
    console.error('Enhanced bill analyzer error:', error);

    return NextResponse.json(
      {
        error: 'Analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Health check endpoint
  const availability = enhancedBillAnalyzer.isAvailable();

  return NextResponse.json({
    status: 'healthy',
    availability,
    models: {
      anthropic: process.env.MODEL_ANTHROPIC || 'claude-3-5-sonnet-20241022',
      openai: process.env.MODEL_OPENAI || 'gpt-4o'
    },
    limits: {
      maxTokens: process.env.MAX_TOKENS || '8000',
      temperature: process.env.TEMPERATURE || '0.1',
      maxDuration: '300s'
    }
  });
}