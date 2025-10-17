/**
 * LLM prompts for generating narrative content in reports
 */

import { AnalysisResult } from '@/lib/types/ocr';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * System prompt for healthcare billing expert
 */
const SYSTEM_PROMPT = `You are a healthcare billing expert. You will write plain-English artifacts (appeal letters, phone scripts, next-step checklists) using ONLY the structured facts provided.

CRITICAL RULES:
- Do not invent codes, amounts, dates, or policies
- Keep content factual, neutral, and helpful
- Output short, readable paragraphs and bullet lists
- Include citation labels when provided
- Use professional but accessible language
- Focus on actionable next steps
- Always reference specific amounts and codes from the provided data`;

/**
 * Generate comprehensive narrative content for a case
 */
export async function generateNarrativeContent(analysis: AnalysisResult): Promise<{
  summary: string;
  issues: string;
  nextSteps: string;
  appealLetter: string;
  phoneScript: string;
  checklist: string[];
}> {
  console.log('🔍 Generating narrative for caseId:', analysis.caseId);
  console.log('🔍 Analysis data type check:', typeof analysis);
  console.log('🔍 Analysis keys:', Object.keys(analysis));

  const factsJson = formatAnalysisForLLM(analysis);
  console.log('🔍 Formatted facts for LLM:', JSON.stringify(factsJson).slice(0, 300));

  const userPrompt = `
Facts JSON:
${JSON.stringify(factsJson, null, 2)}

Generate the following content using ONLY the facts provided above:

1. **Executive Summary** (150-200 words): Concise overview of findings and total potential savings

2. **Key Issues** (200-250 words): Detailed explanation of the most significant billing problems found

3. **Next Steps** (5-8 bullet points): Prioritized action items for the patient/member

4. **Appeal Letter** (250-300 words): Professional letter to the insurance company requesting reprocessing/review

5. **Phone Script** (150-200 words): Conversational script for calling provider billing office

6. **Document Checklist** (8-12 items): List of documents and information to gather

Format your response as JSON with keys: summary, issues, nextSteps, appealLetter, phoneScript, checklist

Only use fields present in the Facts JSON. Do not invent any medical codes, dollar amounts, dates, or policy references.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3, // Low temperature for consistent, factual output
      max_tokens: 2000
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content generated from LLM');
    }

    console.log('🤖 OpenAI response length:', content.length);
    console.log('🤖 OpenAI response preview:', content.slice(0, 200));

    // Check if content looks like PDF data
    if (content.trim().startsWith('%PDF')) {
      console.error('❌ OpenAI returned PDF data instead of JSON');
      throw new Error('OpenAI returned PDF data instead of JSON response');
    }

    // Parse JSON response
    let narrative;
    try {
      narrative = JSON.parse(content);
    } catch (parseError) {
      console.error('❌ Failed to parse OpenAI response as JSON:', parseError);
      console.error('❌ Content that failed to parse:', content.slice(0, 500));
      throw new Error(`Failed to parse OpenAI response as JSON: ${parseError instanceof Error ? parseError.message : parseError}`);
    }

    // Validate required fields
    const requiredFields = ['summary', 'issues', 'nextSteps', 'appealLetter', 'phoneScript', 'checklist'];
    for (const field of requiredFields) {
      if (!narrative[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    return narrative;

  } catch (error) {
    console.error('LLM narrative generation failed:', error);

    // Return fallback content based on analysis data
    return generateFallbackNarrative(analysis);
  }
}

/**
 * Format analysis result for LLM consumption
 */
function formatAnalysisForLLM(analysis: AnalysisResult) {
  const { pricedSummary, detections, savingsTotalCents } = analysis;

  // Extract top issues by severity and savings
  const topIssues = detections
    .filter(d => d.severity === 'high')
    .sort((a, b) => (b.savingsCents || 0) - (a.savingsCents || 0))
    .slice(0, 5)
    .map(d => d.ruleKey);

  // Calculate summary statistics
  const totalBilled = pricedSummary.totals.billed || 0;
  const totalAllowed = pricedSummary.totals.allowed || 0;
  const patientResp = pricedSummary.totals.patientResp || 0;

  return {
    summary: {
      savingsTotalCents,
      savingsDollars: (savingsTotalCents / 100).toFixed(2),
      topIssues,
      totalDetections: detections.length,
      highSeverityCount: detections.filter(d => d.severity === 'high').length,
      totalBilledDollars: (totalBilled / 100).toFixed(2),
      totalAllowedDollars: (totalAllowed / 100).toFixed(2),
      patientRespDollars: (patientResp / 100).toFixed(2)
    },
    provider: {
      name: pricedSummary.header.providerName,
      npi: pricedSummary.header.NPI,
      claimId: pricedSummary.header.claimId,
      accountId: pricedSummary.header.accountId,
      serviceDates: pricedSummary.header.serviceDates,
      payer: pricedSummary.header.payer
    },
    detections: detections.map(d => ({
      ruleKey: d.ruleKey,
      severity: d.severity,
      explanation: d.explanation,
      savingsCents: d.savingsCents,
      savingsDollars: d.savingsCents ? (d.savingsCents / 100).toFixed(2) : null,
      citations: d.citations?.map(c => ({
        title: c.title,
        authority: c.authority,
        citation: c.citation
      }))
    })),
    topCharges: pricedSummary.lines
      .filter(line => line.charge && line.charge > 0)
      .sort((a, b) => (b.charge || 0) - (a.charge || 0))
      .slice(0, 10)
      .map(line => ({
        code: line.code,
        description: line.description,
        chargeDollars: line.charge ? (line.charge / 100).toFixed(2) : null,
        dos: line.dos,
        units: line.units
      }))
  };
}

/**
 * Generate fallback narrative content when LLM fails
 */
function generateFallbackNarrative(analysis: AnalysisResult): {
  summary: string;
  issues: string;
  nextSteps: string;
  appealLetter: string;
  phoneScript: string;
  checklist: string[];
} {
  const { savingsTotalCents, detections, pricedSummary } = analysis;
  const savingsDollars = (savingsTotalCents / 100).toFixed(2);

  const summary = `Our analysis identified ${detections.length} potential billing issues with total estimated savings of $${savingsDollars}. ${detections.filter(d => d.severity === 'high').length} high-priority issues require immediate attention.`;

  const issues = detections.slice(0, 3).map(d =>
    `• ${d.ruleKey.replace(/_/g, ' ').toUpperCase()}: ${d.explanation}${d.savingsCents ? ` (Potential savings: $${(d.savingsCents / 100).toFixed(2)})` : ''}`
  ).join('\n');

  const nextSteps = `• Contact ${pricedSummary.header.providerName || 'your healthcare provider'} billing department
• Request itemized bill if not already provided
• File formal appeal with insurance company
• Gather supporting documentation
• Consider requesting payment plan if needed`;

  const appealLetter = `Dear Claims Review Department,

I am writing to formally appeal billing errors identified in claim ${pricedSummary.header.claimId || '[CLAIM ID]'} for services provided by ${pricedSummary.header.providerName || '[PROVIDER NAME]'}.

Our analysis identified several billing discrepancies totaling $${savingsDollars} in potential overcharges. I request a comprehensive review and reprocessing of this claim.

Please contact me at your earliest convenience to discuss this matter.

Sincerely,
[Your Name]`;

  const phoneScript = `Hi, I'm calling about billing questions for claim ${pricedSummary.header.claimId || '[CLAIM ID]'}. I've identified potential billing errors totaling $${savingsDollars} and would like to discuss these with someone who can help resolve them. Can you please connect me with a billing specialist?`;

  const checklist = [
    'Itemized bill from provider',
    'Explanation of Benefits (EOB) from insurance',
    'Medical records for date of service',
    'Copy of insurance card',
    'Prior authorization documentation (if applicable)',
    'Written appeal letter',
    'Documentation of billing errors',
    'Provider contract or fee schedule (if available)'
  ];

  return {
    summary,
    issues,
    nextSteps,
    appealLetter,
    phoneScript,
    checklist
  };
}