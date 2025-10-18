/**
 * Comprehensive PDF Report Generator
 * Produces analyst-grade reports with all required sections
 * Optimized for Vercel serverless environment with jsPDF
 */

import { jsPDF } from 'jspdf';
import { PricedSummary, Detection, EOBSummary, InsurancePlan } from '@/lib/types/ocr';
import { SavingsComputationResult } from '@/lib/rules/savings-enhanced';
import { EnhancedLineMatch } from '@/lib/matching/enhanced-line-matcher';

export interface ComprehensiveReportData {
  caseId: string;
  pricedSummary: PricedSummary;
  detections: Detection[];
  savingsResult: SavingsComputationResult;
  eobSummary?: EOBSummary;
  insurancePlan?: InsurancePlan;
  appealLetter?: string;
  phoneScript?: string;
  checklist?: string[];
  originalImages?: Buffer[];
}

/**
 * Generate comprehensive PDF report with all required sections
 */
export async function generateComprehensivePDF(data: ComprehensiveReportData): Promise<Buffer> {
  console.log(`📄 Generating comprehensive PDF report for case ${data.caseId}...`);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter'
  });

  // Section 1: Cover Page
  generateCoverPage(doc, data);
  doc.addPage();

  // Section 2: Executive Summary
  generateExecutiveSummary(doc, data);
  doc.addPage();

  // Section 3: Itemized Table
  generateItemizedTable(doc, data);
  doc.addPage();

  // Section 4: Rule-by-Rule Analysis
  generateRuleAnalysis(doc, data);
  doc.addPage();

  // Section 5: Appeal Package
  generateAppealPackage(doc, data);

  // Section 6: Original Images (if available)
  if (data.originalImages && data.originalImages.length > 0) {
    generateOriginalImages(doc, data.originalImages);
  }

  // Convert to buffer
  const pdfOutput = doc.output('arraybuffer');
  const pdfBuffer = Buffer.from(pdfOutput);

  console.log(`✅ PDF generated successfully: ${pdfBuffer.length} bytes`);
  return pdfBuffer;
}

/**
 * Generate cover page
 */
function generateCoverPage(doc: jsPDF, data: ComprehensiveReportData) {
  // Header
  doc.setFontSize(24);
  doc.text('Medical Bill Analysis Report', 72, 120);

  // Case information
  doc.setFontSize(14);
  doc.text(`Case ID: ${data.caseId}`, 72, 180);

  if (data.pricedSummary.header.serviceDates) {
    const { start, end } = data.pricedSummary.header.serviceDates;
    const dateRange = start === end ? start : `${start} to ${end}`;
    doc.text(`Service Dates: ${dateRange || 'Not specified'}`, 72, 200);
  }

  if (data.pricedSummary.header.providerName) {
    doc.text(`Provider: ${data.pricedSummary.header.providerName}`, 72, 220);
  }

  if (data.pricedSummary.header.payer) {
    doc.text(`Payer: ${data.pricedSummary.header.payer}`, 72, 240);
  }

  // Financial summary with EOB context
  if (data.pricedSummary.totals.billed) {
    doc.setFontSize(16);
    doc.text(`Total Billed: $${(data.pricedSummary.totals.billed / 100).toFixed(2)}`, 72, 280);
  }

  // Show EOB totals if available
  if (data.eobSummary?.header.totalAllowed) {
    doc.setFontSize(14);
    doc.text(`EOB Allowed: $${(data.eobSummary.header.totalAllowed / 100).toFixed(2)}`, 72, 300);

    if (data.eobSummary.header.totalPatientResp) {
      doc.text(`Patient Responsibility: $${(data.eobSummary.header.totalPatientResp / 100).toFixed(2)}`, 72, 320);
    }
  }

  if (data.savingsResult.savingsTotalCents > 0) {
    doc.setFontSize(18);
    doc.setTextColor(255, 0, 0); // Red
    doc.text(`Potential Member Savings: $${(data.savingsResult.savingsTotalCents / 100).toFixed(2)}`, 72, 350);
  }

  // Summary stats with enhanced matching info
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0); // Black
  let yPos = 390;

  doc.text(`Analysis Basis: ${data.savingsResult.basis.charAt(0).toUpperCase() + data.savingsResult.basis.slice(1)}`, 72, yPos);
  yPos += 20;

  doc.text(`Issues Identified: ${data.detections.length}`, 72, yPos);
  yPos += 20;

  doc.text(`Line Items Analyzed: ${data.pricedSummary.lines.length}`, 72, yPos);
  yPos += 20;

  if (data.eobSummary && data.savingsResult.lineMatches) {
    const enhancedMatches = data.savingsResult.lineMatches as EnhancedLineMatch[];
    const matchedCount = enhancedMatches.filter(m => m.matchType !== 'unmatched').length;
    const matchRate = data.pricedSummary.lines.length > 0 ? (matchedCount / data.pricedSummary.lines.length * 100).toFixed(1) : '0';

    doc.text(`EOB Match Rate: ${matchRate}% (${matchedCount}/${data.pricedSummary.lines.length} lines)`, 72, yPos);
    yPos += 20;
  }

  // EOB references if available
  if (data.savingsResult.eobRefs && data.savingsResult.eobRefs.length > 0) {
    doc.setFontSize(10);
    doc.setTextColor(128, 128, 128); // Gray
    doc.text(`EOB References: ${data.savingsResult.eobRefs.join(', ')}`, 72, yPos);
  }

  // Footer
  doc.setFontSize(10);
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, 72, 720);
  doc.text('Confidential Medical Bill Analysis', 72, 735);
}

/**
 * Generate executive summary
 */
function generateExecutiveSummary(doc: jsPDF, data: ComprehensiveReportData) {
  doc.setFontSize(18);
  doc.text('Executive Summary', 72, 120);

  // Key findings
  const highSeverityIssues = data.detections.filter(d => d.severity === 'high').length;
  const mediumSeverityIssues = data.detections.filter(d => d.severity === 'warn').length;
  const infoIssues = data.detections.filter(d => d.severity === 'info').length;

  let yPos = 160;

  doc.setFontSize(14);
  doc.text('Key Findings:', 72, yPos);

  yPos += 30;

  if (highSeverityIssues > 0) {
    doc.setFontSize(12);
    doc.setTextColor(255, 0, 0); // Red
    doc.text(`• ${highSeverityIssues} High Priority Issues`, 92, yPos);
    yPos += 20;
  }

  if (mediumSeverityIssues > 0) {
    doc.setTextColor(255, 165, 0); // Orange
    doc.text(`• ${mediumSeverityIssues} Medium Priority Issues`, 92, yPos);
    yPos += 20;
  }

  if (infoIssues > 0) {
    doc.setTextColor(0, 0, 255); // Blue
    doc.text(`• ${infoIssues} Informational Items`, 92, yPos);
    yPos += 20;
  }

  // Savings summary
  yPos += 20;
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0); // Black
  doc.text('Financial Impact:', 72, yPos);

  yPos += 30;

  if (data.savingsResult.savingsTotalCents > 0) {
    doc.setFontSize(16);
    doc.setTextColor(0, 128, 0); // Green
    doc.text(`Total Potential Savings: $${(data.savingsResult.savingsTotalCents / 100).toFixed(2)}`, 92, yPos);
    yPos += 25;

    // Basis note
    let basisNote = '';
    switch (data.savingsResult.basis) {
      case 'allowed':
        basisNote = `Savings calculated using EOB allowed amounts for ${data.savingsResult.lineMatches.filter(m => m.eobLine).length} matched line items.`;
        break;
      case 'plan':
        basisNote = 'Savings estimated using plan benefit calculations based on deductible and coinsurance rates.';
        break;
      case 'charge':
        basisNote = 'Savings estimated using charge amounts. Final savings will be recomputed on allowed amounts once EOB is provided.';
        break;
    }

    doc.setFontSize(10);
    doc.setTextColor(128, 128, 128); // Gray
    const lines = doc.splitTextToSize(basisNote, 400);
    doc.text(lines, 92, yPos);
    yPos += lines.length * 12 + 10;
  }

  // Top issues
  yPos += 20;
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0); // Black
  doc.text('Top Issues:', 72, yPos);

  yPos += 30;

  const topIssues = data.detections
    .filter(d => d.savingsCents && d.savingsCents > 0)
    .sort((a, b) => (b.savingsCents || 0) - (a.savingsCents || 0))
    .slice(0, 3);

  for (const issue of topIssues) {
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0); // Black
    const issueLines = doc.splitTextToSize(`• ${issue.explanation}`, 400);
    doc.text(issueLines, 92, yPos);
    yPos += issueLines.length * 12;

    if (issue.savingsCents) {
      doc.setTextColor(0, 128, 0); // Green
      doc.text(`  Savings: $${(issue.savingsCents / 100).toFixed(2)}`, 112, yPos);
      yPos += 15;
    }

    yPos += 20;
  }

  // Next steps
  yPos += 20;
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0); // Black
  doc.text('Recommended Actions:', 72, yPos);

  yPos += 30;

  const actions = [
    'Review itemized bill for billing errors and overcharges',
    'File formal appeal with insurance company using provided letter',
    'Contact provider billing department using phone script',
    'Request detailed documentation for questioned charges',
    'Follow up on appeal status within 30 days'
  ];

  for (const action of actions) {
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0); // Black
    const actionLines = doc.splitTextToSize(`• ${action}`, 400);
    doc.text(actionLines, 92, yPos);
    yPos += actionLines.length * 12;
  }
}

/**
 * Generate itemized table
 */
function generateItemizedTable(doc: jsPDF, data: ComprehensiveReportData) {
  doc.setFontSize(18);
  doc.text('Itemized Line Analysis', 72, 120);

  // Table setup
  const tableTop = 160;

  // Column definitions
  const columns = [
    { header: 'Code', width: 60 },
    { header: 'Description', width: 120 },
    { header: 'DOS', width: 70 },
    { header: 'Units', width: 40 },
    { header: 'Charge', width: 60 },
    { header: 'Allowed', width: 60 },
    { header: 'Plan Paid', width: 65 },
    { header: 'Patient Resp', width: 70 },
    { header: 'Flags', width: 50 }
  ];

  let yPos = tableTop;

  // Table header
  doc.setFontSize(10);

  let xPos = 72;
  for (const col of columns) {
    doc.text(col.header, xPos, yPos);
    xPos += col.width;
  }

  // Header line
  yPos += 20;
  doc.line(72, yPos, 72 + 595, yPos);

  yPos += 10;

  // Table rows
  doc.setFontSize(9);

  for (const line of data.pricedSummary.lines) {
    if (yPos > 700) {
      doc.addPage();
      yPos = 120;
    }

    // Find matching EOB data using enhanced matching
    const enhancedMatches = data.savingsResult.lineMatches as EnhancedLineMatch[];
    const match = enhancedMatches.find(m => m.billLine.lineId === line.lineId);

    xPos = 72;

    // Code
    doc.text(line.code || '', xPos, yPos);
    xPos += columns[0].width;

    // Description
    const desc = line.description ? line.description.substring(0, 25) + (line.description.length > 25 ? '...' : '') : '';
    doc.text(desc, xPos, yPos);
    xPos += columns[1].width;

    // DOS
    doc.text(line.dos || '', xPos, yPos);
    xPos += columns[2].width;

    // Units
    doc.text(line.units?.toString() || '', xPos, yPos);
    xPos += columns[3].width;

    // Charge
    doc.text(line.charge ? `$${(line.charge / 100).toFixed(2)}` : '', xPos, yPos);
    xPos += columns[4].width;

    // Allowed (from EOB enhanced matching or line data)
    const allowed = match?.eobLine?.allowed || match?.savingsData.allowedCents || line.allowed;
    doc.text(allowed ? `$${(allowed / 100).toFixed(2)}` : '', xPos, yPos);
    xPos += columns[5].width;

    // Plan Paid
    const planPaid = match?.eobLine?.planPaid || match?.savingsData.planPaidCents || line.planPaid;
    doc.text(planPaid ? `$${(planPaid / 100).toFixed(2)}` : '', xPos, yPos);
    xPos += columns[6].width;

    // Patient Resp
    const patientResp = match?.eobLine?.patientResp || match?.savingsData.patientRespCents || line.patientResp;
    doc.text(patientResp ? `$${(patientResp / 100).toFixed(2)}` : '', xPos, yPos);
    xPos += columns[7].width;

    // Enhanced Flags
    const flags: string[] = [];
    if (line.lowConf) flags.push('LC'); // Low confidence OCR
    if (match?.matchType === 'fuzzy') flags.push('FM'); // Fuzzy EOB match
    if (match?.matchType === 'exact') flags.push('EM'); // Exact EOB match
    if (data.savingsResult.impactedLines.has(line.lineId)) flags.push('IS'); // Impacted by savings
    if (match?.savingsData.memberSavingsCents && match.savingsData.memberSavingsCents > 0) flags.push('MS'); // Member savings

    doc.text(flags.join(','), xPos, yPos);

    yPos += 15;
  }

  // Table footer with totals
  yPos += 10;
  doc.line(72, yPos, 72 + 595, yPos);

  yPos += 15;

  xPos = 72 + columns[0].width + columns[1].width + columns[2].width + columns[3].width;

  // Total Charge
  const totalCharge = data.pricedSummary.totals.billed || 0;
  doc.text(`$${(totalCharge / 100).toFixed(2)}`, xPos, yPos);
  xPos += columns[4].width;

  // Total Allowed
  const totalAllowed = data.pricedSummary.totals.allowed || 0;
  doc.text(totalAllowed ? `$${(totalAllowed / 100).toFixed(2)}` : '', xPos, yPos);
  xPos += columns[5].width;

  // Total Plan Paid
  const totalPlanPaid = data.pricedSummary.totals.planPaid || 0;
  doc.text(totalPlanPaid ? `$${(totalPlanPaid / 100).toFixed(2)}` : '', xPos, yPos);
  xPos += columns[6].width;

  // Total Patient Resp
  const totalPatientResp = data.pricedSummary.totals.patientResp || 0;
  doc.text(totalPatientResp ? `$${(totalPatientResp / 100).toFixed(2)}` : '', xPos, yPos);

  // Enhanced Legend
  yPos += 40;
  doc.setFontSize(9);
  doc.text('Flags: LC = Low Confidence, EM = Exact EOB Match, FM = Fuzzy EOB Match,', 72, yPos);
  yPos += 12;
  doc.text('       IS = Impacted by Savings, MS = Member Savings Available', 72, yPos);
}

/**
 * Generate rule-by-rule analysis
 */
function generateRuleAnalysis(doc: jsPDF, data: ComprehensiveReportData) {
  doc.setFontSize(18);
  doc.text('Rule-by-Rule Analysis', 72, 120);

  let yPos = 160;

  for (const detection of data.detections) {
    if (yPos > 600) {
      doc.addPage();
      yPos = 120;
    }

    // Rule title and severity
    doc.setFontSize(14);

    const severityColor = detection.severity === 'high' ? [255, 0, 0] as [number, number, number] :
                         detection.severity === 'warn' ? [255, 165, 0] as [number, number, number] : [0, 0, 255] as [number, number, number];

    doc.setTextColor(severityColor[0], severityColor[1], severityColor[2]);
    doc.text(`${detection.ruleKey.replace(/_/g, ' ').toUpperCase()}`, 72, yPos);

    yPos += 20;

    // Severity badge (simplified for jsPDF)
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0); // Black
    doc.text(`[${detection.severity.toUpperCase()}]`, 72, yPos);

    // Savings amount with basis indication
    if (detection.savingsCents && detection.savingsCents > 0) {
      doc.setTextColor(0, 128, 0); // Green
      const savingsText = `[MEMBER SAVINGS: $${(detection.savingsCents / 100).toFixed(2)} (${data.savingsResult.basis}-basis)]`;
      doc.text(savingsText, 140, yPos);

      // Add member impact note for EOB-based savings
      if (data.savingsResult.basis === 'allowed' && data.eobSummary?.header.totalPatientResp === 0) {
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128); // Gray
        doc.text('[OOP max met - savings result in member refund]', 400, yPos);
      }
    }

    yPos += 30;

    // Explanation
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0); // Black
    const explanationLines = doc.splitTextToSize(detection.explanation, 450);
    doc.text(explanationLines, 72, yPos);
    yPos += explanationLines.length * 12;

    yPos += 20;

    // Citations
    if (detection.citations && detection.citations.length > 0) {
      doc.setFontSize(10);
      doc.text('Citations:', 72, yPos);

      yPos += 15;

      for (const citation of detection.citations) {
        const citationText = `• ${citation.title} (${citation.authority}): ${citation.citation}`;
        const citationLines = doc.splitTextToSize(citationText, 430);
        doc.text(citationLines, 92, yPos);
        yPos += citationLines.length * 12;
      }
    }

    yPos += 20;
  }
}

/**
 * Generate appeal package
 */
function generateAppealPackage(doc: jsPDF, data: ComprehensiveReportData) {
  doc.setFontSize(18);
  doc.text('Appeal Package', 72, 120);

  let yPos = 160;

  // Appeal Letter
  if (data.appealLetter) {
    doc.setFontSize(14);
    doc.text('Appeal Letter Template', 72, yPos);

    yPos += 30;

    doc.setFontSize(11);
    const letterLines = doc.splitTextToSize(data.appealLetter, 450);
    doc.text(letterLines, 72, yPos);
    yPos += letterLines.length * 12 + 30;
  }

  // Phone Script
  if (data.phoneScript) {
    if (yPos > 600) {
      doc.addPage();
      yPos = 120;
    }

    doc.setFontSize(14);
    doc.text('Phone Script for Provider Billing Office', 72, yPos);

    yPos += 30;

    doc.setFontSize(11);
    const scriptLines = doc.splitTextToSize(data.phoneScript, 450);
    doc.text(scriptLines, 72, yPos);
    yPos += scriptLines.length * 12 + 30;
  }

  // Checklist
  if (data.checklist && data.checklist.length > 0) {
    if (yPos > 600) {
      doc.addPage();
      yPos = 120;
    }

    doc.setFontSize(14);
    doc.text('Appeal Documentation Checklist', 72, yPos);

    yPos += 30;

    for (const item of data.checklist) {
      doc.setFontSize(11);
      const itemLines = doc.splitTextToSize(`☐ ${item}`, 450);
      doc.text(itemLines, 72, yPos);
      yPos += itemLines.length * 12;
    }
  }
}

/**
 * Generate original images section
 */
function generateOriginalImages(doc: jsPDF, images: Buffer[]) {
  doc.addPage();

  doc.setFontSize(18);
  doc.text('Original Documents', 72, 120);

  let yPos = 160;

  for (let i = 0; i < images.length; i++) {
    if (yPos > 200) {
      doc.addPage();
      yPos = 120;
    }

    try {
      // Convert buffer to base64 for jsPDF
      const base64 = images[i].toString('base64');
      const dataUrl = `data:image/jpeg;base64,${base64}`;

      // Add image to PDF
      doc.addImage(dataUrl, 'JPEG', 72, yPos, 450, 300);

      yPos += 320;

      doc.setFontSize(10);
      doc.text(`Page ${i + 1}`, 72, yPos);

      yPos += 40;
    } catch (error) {
      console.warn(`Failed to add image ${i + 1} to PDF:`, error);
      doc.setFontSize(10);
      doc.text(`[Image ${i + 1} could not be displayed]`, 72, yPos);
      yPos += 20;
    }
  }
}