/**
 * Comprehensive PDF Report Generator
 * Produces analyst-grade reports with all required sections
 */

import PDFDocument from 'pdfkit';
import { PricedSummary, Detection, EOBSummary, InsurancePlan } from '@/lib/types/ocr';
import { SavingsComputationResult } from '@/lib/rules/savings-enhanced';

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

  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 72, bottom: 72, left: 72, right: 72 }
  });

  const buffers: Buffer[] = [];
  doc.on('data', buffers.push.bind(buffers));

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

  doc.end();

  return new Promise((resolve) => {
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      console.log(`✅ PDF generated successfully: ${pdfBuffer.length} bytes`);
      resolve(pdfBuffer);
    });
  });
}

/**
 * Generate cover page
 */
function generateCoverPage(doc: PDFKit.PDFDocument, data: ComprehensiveReportData) {
  const pageWidth = doc.page.width - 144; // Account for margins

  // Header
  doc.fontSize(24)
     .font('Helvetica-Bold')
     .text('Medical Bill Analysis Report', 72, 120, { align: 'center' });

  // Case information
  doc.fontSize(14)
     .font('Helvetica')
     .text(`Case ID: ${data.caseId}`, 72, 180);

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

  // Outstanding balance
  if (data.pricedSummary.totals.billed) {
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text(`Total Billed: $${(data.pricedSummary.totals.billed / 100).toFixed(2)}`, 72, 280);
  }

  if (data.savingsResult.savingsTotalCents > 0) {
    doc.fontSize(18)
       .fillColor('red')
       .text(`Potential Savings: $${(data.savingsResult.savingsTotalCents / 100).toFixed(2)}`, 72, 320);
  }

  // Summary stats
  doc.fontSize(12)
     .fillColor('black')
     .font('Helvetica')
     .text(`Analysis Basis: ${data.savingsResult.basis.charAt(0).toUpperCase() + data.savingsResult.basis.slice(1)}`, 72, 380)
     .text(`Issues Identified: ${data.detections.length}`, 72, 400)
     .text(`Line Items Analyzed: ${data.pricedSummary.lines.length}`, 72, 420);

  if (data.eobSummary) {
    doc.text(`EOB Lines Matched: ${data.savingsResult.lineMatches.filter(m => m.matchType !== 'unmatched').length}`, 72, 440);
  }

  // Footer
  doc.fontSize(10)
     .text(`Generated on ${new Date().toLocaleDateString()}`, 72, 720)
     .text('Confidential Medical Bill Analysis', 72, 735);
}

/**
 * Generate executive summary
 */
function generateExecutiveSummary(doc: PDFKit.PDFDocument, data: ComprehensiveReportData) {
  doc.fontSize(18)
     .font('Helvetica-Bold')
     .text('Executive Summary', 72, 120);

  // Key findings
  const highSeverityIssues = data.detections.filter(d => d.severity === 'high').length;
  const mediumSeverityIssues = data.detections.filter(d => d.severity === 'warn').length;
  const infoIssues = data.detections.filter(d => d.severity === 'info').length;

  let yPos = 160;

  doc.fontSize(14)
     .font('Helvetica-Bold')
     .text('Key Findings:', 72, yPos);

  yPos += 30;

  if (highSeverityIssues > 0) {
    doc.fontSize(12)
       .font('Helvetica')
       .fillColor('red')
       .text(`• ${highSeverityIssues} High Priority Issues`, 92, yPos);
    yPos += 20;
  }

  if (mediumSeverityIssues > 0) {
    doc.fillColor('orange')
       .text(`• ${mediumSeverityIssues} Medium Priority Issues`, 92, yPos);
    yPos += 20;
  }

  if (infoIssues > 0) {
    doc.fillColor('blue')
       .text(`• ${infoIssues} Informational Items`, 92, yPos);
    yPos += 20;
  }

  // Savings summary
  yPos += 20;
  doc.fontSize(14)
     .font('Helvetica-Bold')
     .fillColor('black')
     .text('Financial Impact:', 72, yPos);

  yPos += 30;

  if (data.savingsResult.savingsTotalCents > 0) {
    doc.fontSize(16)
       .fillColor('green')
       .text(`Total Potential Savings: $${(data.savingsResult.savingsTotalCents / 100).toFixed(2)}`, 92, yPos);
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

    doc.fontSize(10)
       .fillColor('gray')
       .text(basisNote, 92, yPos, { width: 400 });
    yPos += 40;
  }

  // Top issues
  yPos += 20;
  doc.fontSize(14)
     .font('Helvetica-Bold')
     .fillColor('black')
     .text('Top Issues:', 72, yPos);

  yPos += 30;

  const topIssues = data.detections
    .filter(d => d.savingsCents && d.savingsCents > 0)
    .sort((a, b) => (b.savingsCents || 0) - (a.savingsCents || 0))
    .slice(0, 3);

  for (const issue of topIssues) {
    doc.fontSize(11)
       .font('Helvetica')
       .fillColor('black')
       .text(`• ${issue.explanation}`, 92, yPos, { width: 400 });

    if (issue.savingsCents) {
      doc.font('Helvetica-Bold')
         .fillColor('green')
         .text(`  Savings: $${(issue.savingsCents / 100).toFixed(2)}`, 112, yPos + 15);
    }

    yPos += 45;
  }

  // Next steps
  yPos += 20;
  doc.fontSize(14)
     .font('Helvetica-Bold')
     .fillColor('black')
     .text('Recommended Actions:', 72, yPos);

  yPos += 30;

  const actions = [
    'Review itemized bill for billing errors and overcharges',
    'File formal appeal with insurance company using provided letter',
    'Contact provider billing department using phone script',
    'Request detailed documentation for questioned charges',
    'Follow up on appeal status within 30 days'
  ];

  for (const action of actions) {
    doc.fontSize(11)
       .font('Helvetica')
       .fillColor('black')
       .text(`• ${action}`, 92, yPos, { width: 400 });
    yPos += 20;
  }
}

/**
 * Generate itemized table
 */
function generateItemizedTable(doc: PDFKit.PDFDocument, data: ComprehensiveReportData) {
  doc.fontSize(18)
     .font('Helvetica-Bold')
     .text('Itemized Line Analysis', 72, 120);

  // Table setup
  const tableTop = 160;
  const tableWidth = doc.page.width - 144;

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
  doc.fontSize(10)
     .font('Helvetica-Bold');

  let xPos = 72;
  for (const col of columns) {
    doc.text(col.header, xPos, yPos, { width: col.width, align: 'center' });
    xPos += col.width;
  }

  // Header line
  yPos += 20;
  doc.moveTo(72, yPos)
     .lineTo(72 + tableWidth, yPos)
     .stroke();

  yPos += 10;

  // Table rows
  doc.font('Helvetica')
     .fontSize(9);

  for (const line of data.pricedSummary.lines) {
    if (yPos > 700) {
      doc.addPage();
      yPos = 120;
    }

    // Find matching EOB data
    const match = data.savingsResult.lineMatches.find(m => m.billLine.lineId === line.lineId);

    xPos = 72;

    // Code
    doc.text(line.code || '', xPos, yPos, { width: columns[0].width, align: 'center' });
    xPos += columns[0].width;

    // Description
    const desc = line.description ? line.description.substring(0, 25) + (line.description.length > 25 ? '...' : '') : '';
    doc.text(desc, xPos, yPos, { width: columns[1].width });
    xPos += columns[1].width;

    // DOS
    doc.text(line.dos || '', xPos, yPos, { width: columns[2].width, align: 'center' });
    xPos += columns[2].width;

    // Units
    doc.text(line.units?.toString() || '', xPos, yPos, { width: columns[3].width, align: 'center' });
    xPos += columns[3].width;

    // Charge
    doc.text(line.charge ? `$${(line.charge / 100).toFixed(2)}` : '', xPos, yPos, { width: columns[4].width, align: 'right' });
    xPos += columns[4].width;

    // Allowed (from EOB or line data)
    const allowed = match?.eobLine?.allowed || line.allowed;
    doc.text(allowed ? `$${(allowed / 100).toFixed(2)}` : '', xPos, yPos, { width: columns[5].width, align: 'right' });
    xPos += columns[5].width;

    // Plan Paid
    const planPaid = match?.eobLine?.planPaid || line.planPaid;
    doc.text(planPaid ? `$${(planPaid / 100).toFixed(2)}` : '', xPos, yPos, { width: columns[6].width, align: 'right' });
    xPos += columns[6].width;

    // Patient Resp
    const patientResp = match?.eobLine?.patientResp || line.patientResp;
    doc.text(patientResp ? `$${(patientResp / 100).toFixed(2)}` : '', xPos, yPos, { width: columns[7].width, align: 'right' });
    xPos += columns[7].width;

    // Flags
    const flags: string[] = [];
    if (line.lowConf) flags.push('LC');
    if (match?.matchType === 'fuzzy') flags.push('FM');
    if (data.savingsResult.impactedLines.has(line.lineId)) flags.push('IS');

    doc.text(flags.join(','), xPos, yPos, { width: columns[8].width, align: 'center' });

    yPos += 15;
  }

  // Table footer with totals
  yPos += 10;
  doc.moveTo(72, yPos)
     .lineTo(72 + tableWidth, yPos)
     .stroke();

  yPos += 15;

  doc.font('Helvetica-Bold');

  xPos = 72 + columns[0].width + columns[1].width + columns[2].width + columns[3].width;

  // Total Charge
  const totalCharge = data.pricedSummary.totals.billed || 0;
  doc.text(`$${(totalCharge / 100).toFixed(2)}`, xPos, yPos, { width: columns[4].width, align: 'right' });
  xPos += columns[4].width;

  // Total Allowed
  const totalAllowed = data.pricedSummary.totals.allowed || 0;
  doc.text(totalAllowed ? `$${(totalAllowed / 100).toFixed(2)}` : '', xPos, yPos, { width: columns[5].width, align: 'right' });
  xPos += columns[5].width;

  // Total Plan Paid
  const totalPlanPaid = data.pricedSummary.totals.planPaid || 0;
  doc.text(totalPlanPaid ? `$${(totalPlanPaid / 100).toFixed(2)}` : '', xPos, yPos, { width: columns[6].width, align: 'right' });
  xPos += columns[6].width;

  // Total Patient Resp
  const totalPatientResp = data.pricedSummary.totals.patientResp || 0;
  doc.text(totalPatientResp ? `$${(totalPatientResp / 100).toFixed(2)}` : '', xPos, yPos, { width: columns[7].width, align: 'right' });

  // Legend
  yPos += 40;
  doc.fontSize(9)
     .font('Helvetica')
     .text('Flags: LC = Low Confidence, FM = Fuzzy Match, IS = Impacted by Savings', 72, yPos);
}

/**
 * Generate rule-by-rule analysis
 */
function generateRuleAnalysis(doc: PDFKit.PDFDocument, data: ComprehensiveReportData) {
  doc.fontSize(18)
     .font('Helvetica-Bold')
     .text('Rule-by-Rule Analysis', 72, 120);

  let yPos = 160;

  for (const detection of data.detections) {
    if (yPos > 600) {
      doc.addPage();
      yPos = 120;
    }

    // Rule title and severity
    doc.fontSize(14)
       .font('Helvetica-Bold');

    const severityColor = detection.severity === 'high' ? 'red' :
                         detection.severity === 'warn' ? 'orange' : 'blue';

    doc.fillColor(severityColor)
       .text(`${detection.ruleKey.replace(/_/g, ' ').toUpperCase()}`, 72, yPos);

    yPos += 20;

    // Severity badge
    doc.fontSize(10)
       .fillColor('white')
       .rect(72, yPos, 60, 15)
       .fill(severityColor)
       .fillColor('white')
       .text(detection.severity.toUpperCase(), 75, yPos + 3);

    // Savings amount
    if (detection.savingsCents && detection.savingsCents > 0) {
      doc.fillColor('green')
         .rect(140, yPos, 80, 15)
         .fill('green')
         .fillColor('white')
         .text(`$${(detection.savingsCents / 100).toFixed(2)}`, 145, yPos + 3);
    }

    yPos += 30;

    // Explanation
    doc.fontSize(11)
       .fillColor('black')
       .font('Helvetica')
       .text(detection.explanation, 72, yPos, { width: 450 });

    yPos += 40;

    // Citations
    if (detection.citations && detection.citations.length > 0) {
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .text('Citations:', 72, yPos);

      yPos += 15;

      for (const citation of detection.citations) {
        doc.font('Helvetica')
           .text(`• ${citation.title} (${citation.authority}): ${citation.citation}`, 92, yPos, { width: 430 });
        yPos += 20;
      }
    }

    yPos += 20;
  }
}

/**
 * Generate appeal package
 */
function generateAppealPackage(doc: PDFKit.PDFDocument, data: ComprehensiveReportData) {
  doc.fontSize(18)
     .font('Helvetica-Bold')
     .text('Appeal Package', 72, 120);

  let yPos = 160;

  // Appeal Letter
  if (data.appealLetter) {
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('Appeal Letter Template', 72, yPos);

    yPos += 30;

    doc.fontSize(11)
       .font('Helvetica')
       .text(data.appealLetter, 72, yPos, { width: 450 });

    yPos += 200;
  }

  // Phone Script
  if (data.phoneScript) {
    if (yPos > 600) {
      doc.addPage();
      yPos = 120;
    }

    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('Phone Script for Provider Billing Office', 72, yPos);

    yPos += 30;

    doc.fontSize(11)
       .font('Helvetica')
       .text(data.phoneScript, 72, yPos, { width: 450 });

    yPos += 150;
  }

  // Checklist
  if (data.checklist && data.checklist.length > 0) {
    if (yPos > 600) {
      doc.addPage();
      yPos = 120;
    }

    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('Appeal Documentation Checklist', 72, yPos);

    yPos += 30;

    for (const item of data.checklist) {
      doc.fontSize(11)
         .font('Helvetica')
         .text(`☐ ${item}`, 72, yPos, { width: 450 });
      yPos += 20;
    }
  }
}

/**
 * Generate original images section
 */
function generateOriginalImages(doc: PDFKit.PDFDocument, images: Buffer[]) {
  doc.addPage();

  doc.fontSize(18)
     .font('Helvetica-Bold')
     .text('Original Documents', 72, 120);

  let yPos = 160;

  for (let i = 0; i < images.length; i++) {
    if (yPos > 200) {
      doc.addPage();
      yPos = 120;
    }

    try {
      // Add image to PDF
      doc.image(images[i], 72, yPos, {
        fit: [450, 300],
        align: 'center'
      });

      yPos += 320;

      doc.fontSize(10)
         .text(`Page ${i + 1}`, 72, yPos);

      yPos += 40;
    } catch (error) {
      console.warn(`Failed to add image ${i + 1} to PDF:`, error);
      doc.fontSize(10)
         .text(`[Image ${i + 1} could not be displayed]`, 72, yPos);
      yPos += 20;
    }
  }
}