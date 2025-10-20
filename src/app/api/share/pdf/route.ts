import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import jsPDF from 'jspdf';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

export async function POST(request: NextRequest) {
  try {
    const { content, title, contentType = 'chat', chatId, caseId } = await request.json();

    if (!content) {
      return NextResponse.json(
        { error: 'Missing required field: content' },
        { status: 400 }
      );
    }

    // Generate PDF
    const pdfBuffer = await generatePDF(content, title, contentType);

    // Store PDF in Supabase Storage
    const filename = `${contentType}_${chatId || caseId || Date.now()}_${Date.now()}.pdf`;
    const storagePath = `reports/${chatId || caseId || 'shared'}/${filename}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('chat-uploads')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Error uploading PDF:', uploadError);
      return NextResponse.json(
        { error: 'Failed to store PDF' },
        { status: 500 }
      );
    }

    // Generate signed URL for download
    const { data: urlData } = await supabase.storage
      .from('chat-uploads')
      .createSignedUrl(storagePath, 3600); // 1 hour expiry

    // Log the share action
    console.log('📄 PDF shared:', { contentType, storagePath, chatId, caseId });

    return NextResponse.json({
      success: true,
      downloadUrl: urlData?.signedUrl,
      filename,
      expiresIn: 3600
    });

  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}

async function generatePDF(content: any, title?: string, contentType: string = 'chat'): Promise<Buffer> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - (margin * 2);
  let y = margin;

  // Header
  doc.setFontSize(20);
  doc.setTextColor(102, 126, 234); // Wyng primary color
  doc.text('Wyng', margin, y);
  y += 8;

  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text('Your Healthcare Guardian Angel', margin, y);
  y += 20;

  // Title
  if (title) {
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    const titleLines = doc.splitTextToSize(title, maxWidth);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 6 + 10;
  }

  // Date
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, margin, y);
  y += 15;

  // Content based on type
  if (contentType === 'chat') {
    y = addChatContent(doc, content, margin, y, maxWidth, pageHeight);
  } else {
    y = addAnalyzerContent(doc, content, margin, y, maxWidth, pageHeight);
  }

  // Footer
  if (y > pageHeight - 40) {
    doc.addPage();
    y = margin;
  }

  y = pageHeight - 30;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('Important: This information is for educational purposes only and should not be', margin, y);
  y += 4;
  doc.text('considered legal or medical advice. Always verify with your providers.', margin, y);
  y += 8;
  doc.text('© 2024 Wyng. We never sell your data. Documents encrypted.', margin, y);

  return Buffer.from(doc.output('arraybuffer'));
}

function addChatContent(doc: jsPDF, content: any, margin: number, y: number, maxWidth: number, pageHeight: number): number {
  // Question
  if (content.question) {
    y = checkPageBreak(doc, y, pageHeight, margin);
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Question:', margin, y);
    y += 6;

    doc.setFontSize(10);
    const questionLines = doc.splitTextToSize(content.question, maxWidth);
    doc.text(questionLines, margin, y);
    y += questionLines.length * 4 + 10;
  }

  // Answer
  y = checkPageBreak(doc, y, pageHeight, margin);
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('Answer:', margin, y);
  y += 6;

  doc.setFontSize(10);
  const answerLines = doc.splitTextToSize(content.answer, maxWidth);
  doc.text(answerLines, margin, y);
  y += answerLines.length * 4 + 15;

  // Jargon Explanations
  if (content.jargonExplanations && content.jargonExplanations.length > 0) {
    y = checkPageBreak(doc, y, pageHeight, margin);
    doc.setFontSize(12);
    doc.text('📚 Insurance Terms Explained:', margin, y);
    y += 8;

    doc.setFontSize(10);
    content.jargonExplanations.forEach((jargon: any) => {
      y = checkPageBreak(doc, y, pageHeight, margin);
      doc.setTextColor(0, 0, 0);
      doc.text(`• ${jargon.term}:`, margin, y);
      y += 4;

      doc.setTextColor(60, 60, 60);
      const defLines = doc.splitTextToSize(jargon.definition, maxWidth - 10);
      doc.text(defLines, margin + 5, y);
      y += defLines.length * 4;

      if (jargon.example) {
        doc.setTextColor(100, 100, 100);
        const exampleLines = doc.splitTextToSize(`Example: ${jargon.example}`, maxWidth - 10);
        doc.text(exampleLines, margin + 5, y);
        y += exampleLines.length * 4;
      }
      y += 5;
    });
    y += 10;
  }

  // Next Steps
  if (content.nextSteps && content.nextSteps.length > 0) {
    y = checkPageBreak(doc, y, pageHeight, margin);
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('📋 Next Steps:', margin, y);
    y += 8;

    doc.setFontSize(10);
    content.nextSteps.forEach((step: string, index: number) => {
      y = checkPageBreak(doc, y, pageHeight, margin);
      const stepLines = doc.splitTextToSize(`${index + 1}. ${step}`, maxWidth);
      doc.text(stepLines, margin, y);
      y += stepLines.length * 4 + 3;
    });
    y += 10;
  }

  // Actionable Links
  if (content.actionableLinks && content.actionableLinks.length > 0) {
    y = checkPageBreak(doc, y, pageHeight, margin);
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('🔗 Helpful Resources:', margin, y);
    y += 8;

    doc.setFontSize(10);
    content.actionableLinks.forEach((link: any) => {
      y = checkPageBreak(doc, y, pageHeight, margin);
      doc.setTextColor(102, 126, 234);
      doc.text(`• ${link.text}`, margin, y);
      y += 4;

      doc.setTextColor(60, 60, 60);
      const descLines = doc.splitTextToSize(link.description, maxWidth - 5);
      doc.text(descLines, margin + 5, y);
      y += descLines.length * 4;

      doc.setTextColor(100, 100, 100);
      doc.text(link.url, margin + 5, y);
      y += 8;
    });
    y += 10;
  }

  // Citations
  if (content.citations && content.citations.length > 0) {
    y = checkPageBreak(doc, y, pageHeight, margin);
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('⚖️ Sources:', margin, y);
    y += 8;

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    content.citations.forEach((citation: any) => {
      y = checkPageBreak(doc, y, pageHeight, margin);
      const citationText = `${citation.authority} - ${citation.title}`;
      const citationLines = doc.splitTextToSize(citationText, maxWidth);
      doc.text(citationLines, margin, y);
      y += citationLines.length * 3 + 2;
    });
  }

  return y;
}

function addAnalyzerContent(doc: jsPDF, content: any, margin: number, y: number, maxWidth: number, pageHeight: number): number {
  // Bill Analysis Title
  y = checkPageBreak(doc, y, pageHeight, margin);
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('📄 Bill Analysis Results', margin, y);
  y += 15;

  // Summary
  if (content.summary) {
    doc.setFontSize(10);
    const summaryLines = doc.splitTextToSize(content.summary, maxWidth);
    doc.text(summaryLines, margin, y);
    y += summaryLines.length * 4 + 15;
  }

  // Findings
  if (content.findings && content.findings.length > 0) {
    y = checkPageBreak(doc, y, pageHeight, margin);
    doc.setFontSize(12);
    doc.text('🔍 Findings:', margin, y);
    y += 8;

    doc.setFontSize(10);
    content.findings.forEach((finding: string) => {
      y = checkPageBreak(doc, y, pageHeight, margin);
      const findingLines = doc.splitTextToSize(`• ${finding}`, maxWidth);
      doc.text(findingLines, margin, y);
      y += findingLines.length * 4 + 3;
    });
    y += 10;
  }

  // Potential Savings
  if (content.potential_savings) {
    y = checkPageBreak(doc, y, pageHeight, margin);
    doc.setFontSize(12);
    doc.setTextColor(0, 128, 0);
    doc.text(`💰 Potential Savings: $${content.potential_savings}`, margin, y);
    y += 15;
  }

  // Next Steps
  if (content.next_steps && content.next_steps.length > 0) {
    y = checkPageBreak(doc, y, pageHeight, margin);
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('📋 Recommended Actions:', margin, y);
    y += 8;

    doc.setFontSize(10);
    content.next_steps.forEach((step: string, index: number) => {
      y = checkPageBreak(doc, y, pageHeight, margin);
      const stepLines = doc.splitTextToSize(`${index + 1}. ${step}`, maxWidth);
      doc.text(stepLines, margin, y);
      y += stepLines.length * 4 + 3;
    });
  }

  return y;
}

function checkPageBreak(doc: jsPDF, y: number, pageHeight: number, margin: number): number {
  if (y > pageHeight - 40) {
    doc.addPage();
    return margin;
  }
  return y;
}