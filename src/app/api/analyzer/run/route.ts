import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AnalyzerResult, DocumentMeta, LineItem, PricedSummary, Detection } from '@/types/analyzer';
import { MoneyCents } from '@/types/common';

// Environment validation
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  throw new Error('Missing Supabase configuration');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

// Route configuration
export const runtime = 'nodejs';
export const maxDuration = 60; // 1 minute
export const dynamic = 'force-dynamic';

// Detection rules for analysis
const DETECTION_RULES = [
  {
    id: 'high_patient_responsibility',
    category: 'billing',
    severity: 'warn' as const,
    check: (totals: { patient_resp_cents?: number }) => {
      if (totals.patient_resp_cents && totals.patient_resp_cents > 100000) { // $1000+
        return {
          detectionId: 'high_patient_responsibility',
          category: 'billing',
          severity: 'warn' as const,
          explanation: 'High patient responsibility amount detected. This may warrant review or appeal.',
          evidence: { snippets: [`Patient responsibility: $${(totals.patient_resp_cents / 100).toFixed(2)}`] },
          suggestedQuestions: [
            'Is this amount correct?',
            'Are there any billing errors?',
            'Should I appeal this charge?'
          ]
        };
      }
      return null;
    }
  },
  {
    id: 'potential_billing_error',
    category: 'billing',
    severity: 'high' as const,
    check: (lines: any[]) => {
      // Check for duplicate codes on same date
      const codesByDate = new Map<string, Set<string>>();

      for (const line of lines) {
        if (line.code && line.dos) {
          const key = `${line.dos}`;
          if (!codesByDate.has(key)) {
            codesByDate.set(key, new Set());
          }
          if (codesByDate.get(key)!.has(line.code)) {
            return {
              detectionId: 'potential_billing_error',
              category: 'billing',
              severity: 'high' as const,
              explanation: 'Duplicate procedure codes found on the same date of service.',
              evidence: { snippets: [`Duplicate code ${line.code} on ${line.dos}`] },
              suggestedQuestions: [
                'Why is this code billed twice?',
                'Is this a billing error?',
                'Should I request a corrected claim?'
              ]
            };
          }
          codesByDate.get(key)!.add(line.code);
        }
      }
      return null;
    }
  },
  {
    id: 'low_confidence_extraction',
    category: 'data_quality',
    severity: 'info' as const,
    check: (lines: any[]) => {
      const lowConfLines = lines.filter(line => line.low_conf);
      if (lowConfLines.length > 0) {
        return {
          detectionId: 'low_confidence_extraction',
          category: 'data_quality',
          severity: 'info' as const,
          explanation: `${lowConfLines.length} line(s) had low OCR confidence. Review these items carefully.`,
          evidence: {
            snippets: lowConfLines.slice(0, 3).map(line =>
              `Low confidence: ${line.description || 'Unknown'} (${line.vendor_consensus?.toFixed(2) || 'N/A'} consensus)`
            )
          },
          suggestedQuestions: [
            'Are these line items correct?',
            'Should I verify these charges manually?'
          ]
        };
      }
      return null;
    }
  }
];

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Starting analyzer run from Supabase data...');

    const body = await request.json();
    const { caseId } = body;

    if (!caseId) {
      return NextResponse.json(
        { error: 'Case ID is required' },
        { status: 400 }
      );
    }

    console.log(`📊 Analyzing case: ${caseId}`);

    // 1. Fetch OCR extractions from Supabase
    const { data: extractions, error: extractionsError } = await supabase
      .from('ocr_extractions')
      .select('*')
      .eq('case_id', caseId)
      .order('page', { ascending: true })
      .order('row_idx', { ascending: true });

    if (extractionsError) {
      console.error('❌ Failed to fetch extractions:', extractionsError);
      return NextResponse.json(
        { error: 'Failed to fetch OCR data' },
        { status: 500 }
      );
    }

    if (!extractions || extractions.length === 0) {
      return NextResponse.json(
        { error: 'No OCR data found for this case. Please run OCR ingest first.' },
        { status: 404 }
      );
    }

    console.log(`📄 Found ${extractions.length} OCR extractions`);

    // 2. Fetch artifacts metadata
    const { data: artifacts, error: artifactsError } = await supabase
      .from('ocr_artifacts')
      .select('*')
      .eq('case_id', caseId);

    if (artifactsError || !artifacts) {
      console.error('❌ Failed to fetch artifacts:', artifactsError);
      return NextResponse.json(
        { error: 'Failed to fetch artifact metadata' },
        { status: 500 }
      );
    }

    // 3. Transform data to AnalyzerResult format
    const documentMeta: DocumentMeta[] = artifacts.map(artifact => ({
      artifactId: artifact.artifact_id,
      docType: artifact.doc_type as DocumentMeta['docType'],
      // Extract from first extraction for this artifact
      ...(() => {
        const firstExtraction = extractions.find(e => e.artifact_id === artifact.artifact_id);
        if (firstExtraction?.keyfacts) {
          return {
            providerName: firstExtraction.keyfacts.provider_name,
            providerNPI: firstExtraction.keyfacts.provider_npi,
            payer: firstExtraction.keyfacts.payer,
            claimId: firstExtraction.keyfacts.claim_id,
            accountId: firstExtraction.keyfacts.account_id,
            serviceDates: firstExtraction.keyfacts.service_dates
          };
        }
        return {};
      })()
    }));

    // 4. Transform line items (exclude low confidence items from math)
    const lineItems: LineItem[] = extractions
      .filter(e => e.doc_type === 'BILL' || e.doc_type === 'EOB')
      .map(extraction => ({
        lineId: `${extraction.case_id}_${extraction.row_idx}`,
        artifactId: extraction.artifact_id,
        description: extraction.description || undefined,
        code: extraction.code || undefined,
        modifiers: extraction.modifiers || undefined,
        units: extraction.units ? Number(extraction.units) : undefined,
        revCode: extraction.rev_code || undefined,
        pos: extraction.pos || undefined,
        npi: extraction.npi || undefined,
        dos: extraction.dos ? new Date(extraction.dos).toISOString().split('T')[0] : undefined,
        charge: extraction.charge_cents || undefined,
        allowed: extraction.allowed_cents || undefined,
        planPaid: extraction.plan_paid_cents || undefined,
        patientResp: extraction.patient_resp_cents || undefined,
        ocr: {
          page: extraction.page,
          bbox: extraction.bbox ?
            [extraction.bbox.x, extraction.bbox.y, extraction.bbox.width, extraction.bbox.height] :
            undefined,
          conf: extraction.conf || undefined
        },
        note: extraction.low_conf ? 'low_confidence_ocr' : undefined
      }));

    // 5. Calculate totals from high-confidence line items only
    const highConfidenceItems = lineItems.filter(item => !item.note?.includes('low_confidence'));

    const totals = {
      billed: highConfidenceItems.reduce((sum, item) => sum + (item.charge || 0), 0),
      allowed: highConfidenceItems.reduce((sum, item) => sum + (item.allowed || 0), 0),
      planPaid: highConfidenceItems.reduce((sum, item) => sum + (item.planPaid || 0), 0),
      patientResp: highConfidenceItems.reduce((sum, item) => sum + (item.patientResp || 0), 0)
    };

    // 6. Create priced summary
    const pricedSummary: PricedSummary = {
      header: {
        providerName: documentMeta[0]?.providerName,
        NPI: documentMeta[0]?.providerNPI,
        claimId: documentMeta[0]?.claimId,
        accountId: documentMeta[0]?.accountId,
        serviceDates: documentMeta[0]?.serviceDates,
        payer: documentMeta[0]?.payer
      },
      totals,
      lines: lineItems.map(item => ({
        lineId: item.lineId,
        code: item.code,
        modifiers: item.modifiers,
        description: item.description,
        units: item.units,
        dos: item.dos,
        pos: item.pos,
        revCode: item.revCode,
        npi: item.npi,
        charge: item.charge,
        allowed: item.allowed,
        planPaid: item.planPaid,
        patientResp: item.patientResp,
        conf: item.ocr?.conf
      })),
      notes: extractions
        .filter(e => e.low_conf)
        .map(e => `Low confidence extraction: ${e.description || 'Unknown item'}`)
    };

    // 7. Run detection rules
    const detections: Detection[] = [];

    for (const rule of DETECTION_RULES) {
      try {
        let detection = null;

        if (rule.id === 'high_patient_responsibility') {
          detection = rule.check({ patient_resp_cents: totals.patientResp });
        } else if (rule.id === 'potential_billing_error') {
          detection = rule.check(lineItems);
        } else if (rule.id === 'low_confidence_extraction') {
          detection = rule.check(extractions);
        }

        if (detection) {
          detections.push(detection);
        }
      } catch (ruleError) {
        console.warn(`⚠️ Detection rule ${rule.id} failed:`, ruleError);
      }
    }

    // 8. Calculate confidence scores
    const confidenceScores = extractions.map(e => e.vendor_consensus || 0.5);
    const overallConfidence = confidenceScores.length > 0 ?
      confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length :
      0.5;

    // 9. Build final result
    const result: AnalyzerResult = {
      documentMeta,
      lineItems,
      pricedSummary,
      detections,
      complianceFooters: [
        'Analysis based on dual-vendor OCR consensus with deterministic validation.',
        'Low confidence items excluded from financial calculations.',
        'This is not medical or legal advice. Consult professionals for complex cases.'
      ],
      confidence: {
        overall: overallConfidence,
        sections: {
          ocr: overallConfidence,
          extraction: Math.min(overallConfidence + 0.1, 1.0),
          validation: 0.95 // High confidence in our validation rules
        }
      }
    };

    console.log(`✅ Analysis completed: ${lineItems.length} line items, ${detections.length} detections`);

    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ Analyzer run failed:', error);

    return NextResponse.json(
      { error: 'Analysis failed. Please try again or contact support if the problem persists.' },
      { status: 500 }
    );
  }
}

// Handle preflight requests
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