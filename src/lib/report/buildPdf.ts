/**
 * PDF Report Generation Module
 * Creates comprehensive medical billing analysis reports
 */

import { PDFDocument, rgb, PageSizes } from 'pdf-lib';
import { AnalysisResult, EnhancedAnalysisResult, FileRef, ReportDraft, EOBSummary, LineMatch, InsurancePlan } from '@/lib/types/ocr';
import { getMatchingStats } from '@/lib/matching/line-matcher';

interface ReportOptions {
  includeCoverPage?: boolean;
  includeOriginalImages?: boolean;
  customBranding?: {
    logoUrl?: string;
    companyName?: string;
    contactInfo?: string;
  };
}

/**
 * Build comprehensive PDF report
 */
export async function buildAnalysisReport(
  analysis: EnhancedAnalysisResult,
  fileRefs: FileRef[],
  narrative: ReportDraft,
  options: ReportOptions = {}
): Promise<Buffer> {
  console.log('📄 Starting PDF report generation...');

  const pdfDoc = await PDFDocument.create();
  const { pricedSummary, detections, savingsTotalCents, eobSummary, lineMatches, allowedBasisSavingsCents, insurancePlan } = analysis;

  // Add cover page
  if (options.includeCoverPage !== false) {
    await addCoverPage(pdfDoc, analysis, options.customBranding);
  }

  // Add executive summary
  await addExecutiveSummary(pdfDoc, analysis, narrative);

  // Add itemized findings table
  await addItemizedFindings(pdfDoc, pricedSummary);

  // Add EOB analysis if available
  if (eobSummary && lineMatches) {
    await addEOBAnalysis(pdfDoc, eobSummary, lineMatches, allowedBasisSavingsCents || 0);
  }

  // Add insurance plan summary if available
  if (insurancePlan) {
    await addInsurancePlanSummary(pdfDoc, insurancePlan);
  }

  // Add rule-by-rule analysis
  await addRuleAnalysis(pdfDoc, detections);

  // Add appeal package
  await addAppealPackage(pdfDoc, narrative);

  // Add checklist
  await addChecklist(pdfDoc, narrative);

  // Add original images if requested
  if (options.includeOriginalImages !== false) {
    await addOriginalImages(pdfDoc, fileRefs);
  }

  // Generate PDF buffer
  const pdfBytes = await pdfDoc.save();
  console.log(`✅ PDF generated: ${pdfBytes.length} bytes`);

  return Buffer.from(pdfBytes);
}

/**
 * Add cover page
 */
async function addCoverPage(
  pdfDoc: PDFDocument,
  analysis: EnhancedAnalysisResult,
  branding?: ReportOptions['customBranding']
) {
  const page = pdfDoc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();

  // Header with branding
  page.drawText(branding?.companyName || 'Wyng Health Analytics', {
    x: 50,
    y: height - 80,
    size: 24,
    color: rgb(0.2, 0.4, 0.8)
  });

  // Title
  page.drawText('Medical Billing Analysis Report', {
    x: 50,
    y: height - 140,
    size: 20,
    color: rgb(0.1, 0.1, 0.1)
  });

  // Case information
  const caseInfo = [
    `Case ID: ${analysis.caseId}`,
    `Generated: ${new Date().toLocaleDateString()}`,
    `Provider: ${analysis.pricedSummary.header.providerName || 'Not specified'}`,
    `Claim ID: ${analysis.pricedSummary.header.claimId || 'Not specified'}`,
    '',
    `Charge-Basis Savings: $${(analysis.savingsTotalCents / 100).toFixed(2)}`,
    ...(analysis.allowedBasisSavingsCents ? [`Allowed-Basis Savings: $${(analysis.allowedBasisSavingsCents / 100).toFixed(2)}`] : []),
    `Total Issues Identified: ${analysis.detections.length}`,
    `High Priority Issues: ${analysis.detections.filter(d => d.severity === 'high').length}`,
    ...(analysis.eobSummary ? [`EOB Analysis: Available`] : [`EOB Analysis: Not Available`]),
    ...(analysis.insurancePlan ? [`Insurance Plan: ${analysis.insurancePlan.carrierName || 'Specified'}`] : [])
  ];

  let yPosition = height - 200;
  for (const info of caseInfo) {
    page.drawText(info, {
      x: 50,
      y: yPosition,
      size: 12,
      color: rgb(0.2, 0.2, 0.2)
    });
    yPosition -= 20;
  }

  // Footer disclaimer
  page.drawText('This report is for informational purposes only and does not constitute medical or legal advice.', {
    x: 50,
    y: 50,
    size: 10,
    color: rgb(0.5, 0.5, 0.5)
  });
}

/**
 * Add executive summary page
 */
async function addExecutiveSummary(
  pdfDoc: PDFDocument,
  analysis: EnhancedAnalysisResult,
  narrative: ReportDraft
) {
  const page = pdfDoc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();

  // Title
  page.drawText('Executive Summary', {
    x: 50,
    y: height - 60,
    size: 18,
    color: rgb(0.1, 0.1, 0.1)
  });

  // Summary content
  const summaryText = narrative.summary || 'Analysis summary not available.';
  addWrappedText(page, summaryText, 50, height - 100, width - 100, 12);

  // Key findings box
  const findingsY = height - 250;
  page.drawRectangle({
    x: 50,
    y: findingsY - 20,
    width: width - 100,
    height: 120,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 1
  });

  page.drawText('Key Findings:', {
    x: 60,
    y: findingsY + 80,
    size: 14,
    color: rgb(0.1, 0.1, 0.1)
  });

  const topDetections = analysis.detections
    .filter(d => d.severity === 'high')
    .slice(0, 3);

  let bulletY = findingsY + 55;
  for (const detection of topDetections) {
    const savingsText = detection.savingsCents
      ? ` ($${(detection.savingsCents / 100).toFixed(2)} potential savings)`
      : '';
    const bulletText = `• ${detection.ruleKey.replace(/_/g, ' ')}${savingsText}`;

    page.drawText(bulletText, {
      x: 60,
      y: bulletY,
      size: 10,
      color: rgb(0.2, 0.2, 0.2)
    });
    bulletY -= 20;
  }
}

/**
 * Add itemized findings table
 */
async function addItemizedFindings(
  pdfDoc: PDFDocument,
  pricedSummary: import('@/lib/types/ocr').PricedSummary
) {
  const page = pdfDoc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();

  // Title
  page.drawText('Itemized Findings', {
    x: 50,
    y: height - 60,
    size: 18,
    color: rgb(0.1, 0.1, 0.1)
  });

  // Table headers
  const headers = ['Code', 'Description', 'DOS', 'Units', 'Charge', 'Allowed', 'Plan Paid', 'Patient'];
  const colWidths = [60, 180, 70, 40, 60, 60, 60, 60];
  let xPos = 50;

  // Draw header row
  for (let i = 0; i < headers.length; i++) {
    page.drawText(headers[i], {
      x: xPos,
      y: height - 100,
      size: 10,
      color: rgb(0.1, 0.1, 0.1)
    });
    xPos += colWidths[i];
  }

  // Draw header line
  page.drawLine({
    start: { x: 50, y: height - 110 },
    end: { x: width - 50, y: height - 110 },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5)
  });

  // Add data rows
  let yPos = height - 130;
  const maxRows = 30; // Fit about 30 rows per page

  for (let i = 0; i < Math.min(pricedSummary.lines.length, maxRows); i++) {
    const line = pricedSummary.lines[i];
    xPos = 50;

    const rowData = [
      line.code || '',
      (line.description || '').substring(0, 25), // Truncate long descriptions
      line.dos || '',
      line.units?.toString() || '',
      line.charge ? `$${(line.charge / 100).toFixed(2)}` : '',
      line.allowed ? `$${(line.allowed / 100).toFixed(2)}` : '',
      line.planPaid ? `$${(line.planPaid / 100).toFixed(2)}` : '',
      line.patientResp ? `$${(line.patientResp / 100).toFixed(2)}` : ''
    ];

    for (let j = 0; j < rowData.length; j++) {
      page.drawText(rowData[j], {
        x: xPos,
        y: yPos,
        size: 9,
        color: rgb(0.2, 0.2, 0.2)
      });
      xPos += colWidths[j];
    }

    yPos -= 15;

    // Add new page if needed (simplified for this implementation)
    if (yPos < 100 && i < pricedSummary.lines.length - 1) {
      break; // Would add new page in full implementation
    }
  }

  // Add legend for flags
  if (pricedSummary.lines.some(line => line.lowConf)) {
    page.drawText('* Low confidence OCR data', {
      x: 50,
      y: yPos - 20,
      size: 8,
      color: rgb(0.6, 0.6, 0.6)
    });
  }
}

/**
 * Add rule-by-rule analysis
 */
async function addRuleAnalysis(
  pdfDoc: PDFDocument,
  detections: import('@/lib/types/ocr').Detection[]
) {
  const page = pdfDoc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();

  // Title
  page.drawText('Detailed Analysis', {
    x: 50,
    y: height - 60,
    size: 18,
    color: rgb(0.1, 0.1, 0.1)
  });

  let yPos = height - 100;
  const pageMargin = 50;

  for (const detection of detections.slice(0, 6)) { // Show top 6 issues
    // Rule title with severity indicator
    const severityColor = getSeverityColor(detection.severity);
    page.drawText(`${detection.ruleKey.replace(/_/g, ' ').toUpperCase()} (${detection.severity.toUpperCase()})`, {
      x: pageMargin,
      y: yPos,
      size: 12,
      color: severityColor
    });
    yPos -= 20;

    // Explanation
    const explanationText = detection.explanation;
    yPos = addWrappedText(page, explanationText, pageMargin, yPos, width - 100, 10);
    yPos -= 10;

    // Savings
    if (detection.savingsCents) {
      page.drawText(`Potential Savings: $${(detection.savingsCents / 100).toFixed(2)}`, {
        x: pageMargin,
        y: yPos,
        size: 10,
        color: rgb(0.0, 0.6, 0.0)
      });
      yPos -= 15;
    }

    // Citations
    if (detection.citations && detection.citations.length > 0) {
      page.drawText('Citations:', {
        x: pageMargin,
        y: yPos,
        size: 9,
        color: rgb(0.4, 0.4, 0.4)
      });
      yPos -= 12;

      for (const citation of detection.citations) {
        const citationText = `• ${citation.title} (${citation.authority})`;
        page.drawText(citationText, {
          x: pageMargin + 10,
          y: yPos,
          size: 8,
          color: rgb(0.5, 0.5, 0.5)
        });
        yPos -= 12;
      }
    }

    yPos -= 20; // Space between detections

    // Check if we need a new page
    if (yPos < 150) {
      break; // Would add new page in full implementation
    }
  }
}

/**
 * Add appeal package section
 */
async function addAppealPackage(
  pdfDoc: PDFDocument,
  narrative: ReportDraft
) {
  const page = pdfDoc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();

  // Title
  page.drawText('Appeal Package', {
    x: 50,
    y: height - 60,
    size: 18,
    color: rgb(0.1, 0.1, 0.1)
  });

  let yPos = height - 100;

  // Appeal Letter section
  page.drawText('Appeal Letter Template:', {
    x: 50,
    y: yPos,
    size: 14,
    color: rgb(0.2, 0.2, 0.2)
  });
  yPos -= 30;

  const appealText = narrative.appealLetter || 'Appeal letter template not available.';
  yPos = addWrappedText(page, appealText, 50, yPos, width - 100, 10);
  yPos -= 30;

  // Phone Script section
  page.drawText('Phone Script:', {
    x: 50,
    y: yPos,
    size: 14,
    color: rgb(0.2, 0.2, 0.2)
  });
  yPos -= 30;

  const phoneText = narrative.phoneScript || 'Phone script not available.';
  yPos = addWrappedText(page, phoneText, 50, yPos, width - 100, 10);
}

/**
 * Add checklist section
 */
async function addChecklist(
  pdfDoc: PDFDocument,
  narrative: ReportDraft
) {
  const page = pdfDoc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();

  // Title
  page.drawText('Document Checklist', {
    x: 50,
    y: height - 60,
    size: 18,
    color: rgb(0.1, 0.1, 0.1)
  });

  let yPos = height - 100;

  const checklist = narrative.checklist || [
    'Itemized bill from provider',
    'Explanation of Benefits (EOB)',
    'Medical records for service date',
    'Insurance card copy',
    'Prior authorization (if applicable)'
  ];

  for (const item of checklist) {
    // Checkbox
    page.drawRectangle({
      x: 50,
      y: yPos - 2,
      width: 12,
      height: 12,
      borderColor: rgb(0.5, 0.5, 0.5),
      borderWidth: 1
    });

    // Item text
    page.drawText(item, {
      x: 75,
      y: yPos,
      size: 11,
      color: rgb(0.2, 0.2, 0.2)
    });

    yPos -= 25;
  }
}

/**
 * Add original images (placeholder implementation)
 */
async function addOriginalImages(
  pdfDoc: PDFDocument,
  fileRefs: FileRef[]
) {
  // This would download and embed the original images
  // For now, just add a placeholder page
  const page = pdfDoc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();

  page.drawText('Original Documents', {
    x: 50,
    y: height - 60,
    size: 18,
    color: rgb(0.1, 0.1, 0.1)
  });

  page.drawText(`${fileRefs.length} original files would be embedded here in the full implementation.`, {
    x: 50,
    y: height - 100,
    size: 12,
    color: rgb(0.5, 0.5, 0.5)
  });

  // List file names
  let yPos = height - 130;
  for (const fileRef of fileRefs.slice(0, 10)) {
    page.drawText(`• ${fileRef.storagePath.split('/').pop()}`, {
      x: 60,
      y: yPos,
      size: 10,
      color: rgb(0.4, 0.4, 0.4)
    });
    yPos -= 15;
  }
}

/**
 * Helper function to add wrapped text
 */
function addWrappedText(
  page: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number
): number {
  const words = text.split(' ');
  let currentLine = '';
  let currentY = y;

  for (const word of words) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;

    // Simplified width calculation (would use actual text measurement in production)
    if (testLine.length * fontSize * 0.6 > maxWidth && currentLine) {
      // Draw current line
      page.drawText(currentLine, {
        x,
        y: currentY,
        size: fontSize,
        color: rgb(0.2, 0.2, 0.2)
      });

      currentLine = word;
      currentY -= fontSize + 2;
    } else {
      currentLine = testLine;
    }
  }

  // Draw final line
  if (currentLine) {
    page.drawText(currentLine, {
      x,
      y: currentY,
      size: fontSize,
      color: rgb(0.2, 0.2, 0.2)
    });
    currentY -= fontSize + 2;
  }

  return currentY;
}

/**
 * Add EOB analysis section
 */
async function addEOBAnalysis(
  pdfDoc: PDFDocument,
  eobSummary: EOBSummary,
  lineMatches: LineMatch[],
  allowedBasisSavingsCents: number
) {
  const page = pdfDoc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();

  // Title
  page.drawText('EOB Analysis', {
    x: 50,
    y: height - 60,
    size: 18,
    color: rgb(0.1, 0.1, 0.1)
  });

  let yPos = height - 100;

  // EOB Summary
  page.drawText('EOB Summary:', {
    x: 50,
    y: yPos,
    size: 14,
    color: rgb(0.2, 0.2, 0.2)
  });
  yPos -= 25;

  const eobInfo = [
    `Member: ${eobSummary.header.memberName || 'Not specified'}`,
    `Member ID: ${eobSummary.header.memberId || 'Not specified'}`,
    `Claim: ${eobSummary.header.claimNumber || 'Not specified'}`,
    `Total Billed: $${((eobSummary.header.totalBilled || 0) / 100).toFixed(2)}`,
    `Total Allowed: $${((eobSummary.header.totalAllowed || 0) / 100).toFixed(2)}`,
    `Plan Paid: $${((eobSummary.header.totalPlanPaid || 0) / 100).toFixed(2)}`,
    `Patient Responsibility: $${((eobSummary.header.totalPatientResp || 0) / 100).toFixed(2)}`
  ];

  for (const info of eobInfo) {
    page.drawText(info, {
      x: 60,
      y: yPos,
      size: 11,
      color: rgb(0.3, 0.3, 0.3)
    });
    yPos -= 18;
  }

  yPos -= 10;

  // Line Matching Results
  page.drawText('Line Matching Results:', {
    x: 50,
    y: yPos,
    size: 14,
    color: rgb(0.2, 0.2, 0.2)
  });
  yPos -= 25;

  const stats = getMatchingStats(lineMatches);
  const matchingInfo = [
    `Total Bill Lines: ${stats.totalLines}`,
    `Exact Matches: ${stats.exactMatches}`,
    `Fuzzy Matches: ${stats.fuzzyMatches}`,
    `Unmatched Lines: ${stats.unmatchedLines}`,
    `Match Rate: ${(stats.matchRate * 100).toFixed(1)}%`
  ];

  for (const info of matchingInfo) {
    page.drawText(info, {
      x: 60,
      y: yPos,
      size: 11,
      color: rgb(0.3, 0.3, 0.3)
    });
    yPos -= 18;
  }

  yPos -= 20;

  // Allowed-Basis Savings
  page.drawRectangle({
    x: 50,
    y: yPos - 20,
    width: width - 100,
    height: 60,
    borderColor: rgb(0.1, 0.6, 0.1),
    borderWidth: 2
  });

  page.drawText('Allowed-Basis Savings Analysis:', {
    x: 60,
    y: yPos + 20,
    size: 14,
    color: rgb(0.1, 0.6, 0.1)
  });

  page.drawText(`Total Savings: $${(allowedBasisSavingsCents / 100).toFixed(2)}`, {
    x: 60,
    y: yPos - 5,
    size: 12,
    color: rgb(0.0, 0.6, 0.0)
  });

  page.drawText('This represents amounts billed above EOB allowed rates', {
    x: 60,
    y: yPos - 25,
    size: 10,
    color: rgb(0.4, 0.4, 0.4)
  });
}

/**
 * Add insurance plan summary section
 */
async function addInsurancePlanSummary(
  pdfDoc: PDFDocument,
  insurancePlan: InsurancePlan
) {
  const page = pdfDoc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();

  // Title
  page.drawText('Insurance Plan Details', {
    x: 50,
    y: height - 60,
    size: 18,
    color: rgb(0.1, 0.1, 0.1)
  });

  let yPos = height - 100;

  // Basic Plan Information
  page.drawText('Plan Information:', {
    x: 50,
    y: yPos,
    size: 14,
    color: rgb(0.2, 0.2, 0.2)
  });
  yPos -= 25;

  const planInfo = [
    `Carrier: ${insurancePlan.carrierName || 'Not specified'}`,
    `Plan Name: ${insurancePlan.planName || 'Not specified'}`,
    `Plan Type: ${insurancePlan.planType || 'Not specified'}`,
    `Member ID: ${insurancePlan.memberId || 'Not specified'}`,
    `Group Number: ${insurancePlan.groupNumber || 'Not specified'}`,
    `Effective Date: ${insurancePlan.effectiveDate || 'Not specified'}`
  ];

  for (const info of planInfo) {
    page.drawText(info, {
      x: 60,
      y: yPos,
      size: 11,
      color: rgb(0.3, 0.3, 0.3)
    });
    yPos -= 18;
  }

  yPos -= 20;

  // Benefits Summary
  page.drawText('Benefits Summary:', {
    x: 50,
    y: yPos,
    size: 14,
    color: rgb(0.2, 0.2, 0.2)
  });
  yPos -= 25;

  const benefitsInfo = [
    `In-Network Deductible: ${insurancePlan.inNetworkDeductible ? `$${(insurancePlan.inNetworkDeductible / 100).toFixed(2)}` : 'Not specified'}`,
    `Out-of-Network Deductible: ${insurancePlan.outOfNetworkDeductible ? `$${(insurancePlan.outOfNetworkDeductible / 100).toFixed(2)}` : 'Not specified'}`,
    `In-Network Coinsurance: ${insurancePlan.inNetworkCoinsurance ? `${insurancePlan.inNetworkCoinsurance}%` : 'Not specified'}`,
    `Out-of-Network Coinsurance: ${insurancePlan.outOfNetworkCoinsurance ? `${insurancePlan.outOfNetworkCoinsurance}%` : 'Not specified'}`,
    `Primary Care Copay: ${insurancePlan.copayPrimary ? `$${(insurancePlan.copayPrimary / 100).toFixed(2)}` : 'Not specified'}`,
    `Specialist Copay: ${insurancePlan.copaySpecialist ? `$${(insurancePlan.copaySpecialist / 100).toFixed(2)}` : 'Not specified'}`,
    `Urgent Care Copay: ${insurancePlan.copayUrgentCare ? `$${(insurancePlan.copayUrgentCare / 100).toFixed(2)}` : 'Not specified'}`,
    `Emergency Room Copay: ${insurancePlan.copayER ? `$${(insurancePlan.copayER / 100).toFixed(2)}` : 'Not specified'}`,
    `Out-of-Pocket Maximum: ${insurancePlan.outOfPocketMax ? `$${(insurancePlan.outOfPocketMax / 100).toFixed(2)}` : 'Not specified'}`
  ];

  for (const info of benefitsInfo) {
    page.drawText(info, {
      x: 60,
      y: yPos,
      size: 11,
      color: rgb(0.3, 0.3, 0.3)
    });
    yPos -= 18;
  }
}

/**
 * Get color for severity level
 */
function getSeverityColor(severity: string) {
  switch (severity) {
    case 'high':
      return rgb(0.8, 0.1, 0.1); // Red
    case 'warn':
      return rgb(0.8, 0.6, 0.1); // Orange
    case 'info':
      return rgb(0.1, 0.1, 0.8); // Blue
    default:
      return rgb(0.2, 0.2, 0.2); // Gray
  }
}