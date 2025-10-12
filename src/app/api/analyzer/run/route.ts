import { NextRequest, NextResponse } from 'next/server';
import { runDetections } from '@/lib/analyzer/runDetections';
import type { PricedSummary } from '@/lib/ocr/parseBill';


// Route configuration
export const runtime = 'nodejs';
export const maxDuration = 60; // 1 minute
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Running analyzer on stored OCR data...');

    const body = await request.json();
    const { pricedSummary } = body;

    if (!pricedSummary) {
      return NextResponse.json(
        { error: 'pricedSummary is required in request body' },
        { status: 400 }
      );
    }

    // Validate pricedSummary structure
    if (!pricedSummary.lines || !Array.isArray(pricedSummary.lines)) {
      return NextResponse.json(
        { error: 'pricedSummary must contain a lines array' },
        { status: 400 }
      );
    }

    console.log(`📊 Analyzing priced summary with ${pricedSummary.lines.length} line items`);

    // Run the 18-rule detection engine
    const detections = await runDetections(pricedSummary as PricedSummary);

    console.log(`✅ Analysis complete: ${detections.length} detections found`);

    return NextResponse.json({
      detections,
      summary: {
        totalRules: 18, // We have 18 detection rules
        triggeredRules: detections.length,
        highSeverityCount: detections.filter(d => d.severity === 'high').length,
        mediumSeverityCount: detections.filter(d => d.severity === 'warn').length,
        lowSeverityCount: detections.filter(d => d.severity === 'info').length
      }
    });

  } catch (error) {
    console.error('❌ Analyzer run failed:', error);

    return NextResponse.json(
      {
        error: 'Analysis failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

// Handle preflight requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}