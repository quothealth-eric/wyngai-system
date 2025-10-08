import { PDFTextResult, PDFTextBlock } from '@/types/ocr';

export class PDFTextDetector {
  /**
   * Attempts to extract text from PDF using vector text extraction
   * If extractable text is found, returns structured text blocks with layout
   */
  public async extractText(buffer: Buffer): Promise<PDFTextResult> {
    console.log('🔍 Analyzing PDF for extractable text...');

    try {
      // Check if PDF has extractable text by looking for text streams
      const pdfString = buffer.toString('latin1');

      // Look for PDF text streams and font references
      const hasTextStreams = this.hasTextStreams(pdfString);
      const hasEmbeddedFonts = this.hasEmbeddedFonts(pdfString);

      if (!hasTextStreams && !hasEmbeddedFonts) {
        console.log('📄 PDF appears to be image-only, requires OCR');
        return {
          hasExtractableText: false,
          blocks: [],
          pages: this.estimatePageCount(buffer)
        };
      }

      // Attempt basic text extraction from PDF structure
      const textBlocks = await this.extractTextBlocks(buffer);

      if (textBlocks.length === 0) {
        console.log('📄 No extractable text found, requires OCR');
        return {
          hasExtractableText: false,
          blocks: [],
          pages: this.estimatePageCount(buffer)
        };
      }

      console.log(`✅ Extracted ${textBlocks.length} text blocks from PDF`);
      return {
        hasExtractableText: true,
        blocks: textBlocks,
        pages: this.estimatePageCount(buffer)
      };

    } catch (error) {
      console.error('❌ PDF text extraction failed:', error);
      return {
        hasExtractableText: false,
        blocks: [],
        pages: this.estimatePageCount(buffer)
      };
    }
  }

  private hasTextStreams(pdfString: string): boolean {
    // Look for common PDF text stream indicators
    const textStreamPatterns = [
      /BT[\s\S]*?ET/g, // Text objects (Begin Text / End Text)
      /\/F\d+\s+\d+\s+Tf/g, // Font selection
      /Tj\s*[\]\)]/g, // Show text operators
      /TJ\s*[\]\)]/g, // Show text with adjustments
    ];

    return textStreamPatterns.some(pattern => pattern.test(pdfString));
  }

  private hasEmbeddedFonts(pdfString: string): boolean {
    // Look for font definitions
    return /\/Type\s*\/Font/.test(pdfString) || /\/FontDescriptor/.test(pdfString);
  }

  private async extractTextBlocks(buffer: Buffer): Promise<PDFTextBlock[]> {
    const blocks: PDFTextBlock[] = [];

    try {
      // This is a simplified text extraction - in production would use pdf-parse or pdf2pic
      // For now, we'll extract basic text content and create mock layout blocks

      const pdfString = buffer.toString('latin1');

      // Extract text between BT/ET (Begin Text/End Text) markers
      const textMatches = pdfString.match(/BT[\s\S]*?ET/g);

      if (textMatches) {
        textMatches.forEach((textBlock, index) => {
          // Extract actual text content (simplified)
          const textContent = this.extractTextFromBlock(textBlock);

          if (textContent.trim()) {
            blocks.push({
              text: textContent.trim(),
              bbox: [50 + (index % 2) * 300, 100 + Math.floor(index / 2) * 50, 200, 20], // Mock bbox
              page: Math.floor(index / 10) + 1, // Rough page estimation
              font: 'Arial', // Mock font
              fontSize: 12 // Mock size
            });
          }
        });
      }

      // If no BT/ET blocks found, try to extract from stream objects
      if (blocks.length === 0) {
        const streamMatches = pdfString.match(/stream[\s\S]*?endstream/g);

        if (streamMatches) {
          streamMatches.slice(0, 10).forEach((stream, index) => {
            const textContent = this.extractTextFromStream(stream);

            if (textContent.trim()) {
              blocks.push({
                text: textContent.trim(),
                bbox: [50, 100 + index * 30, 400, 20],
                page: 1,
                font: 'Default',
                fontSize: 11
              });
            }
          });
        }
      }

    } catch (error) {
      console.error('Text block extraction error:', error);
    }

    return blocks;
  }

  private extractTextFromBlock(textBlock: string): string {
    // Very simplified text extraction from PDF text objects
    // In production, would use proper PDF parsing library

    try {
      // Look for text show operators: Tj, TJ, ', "
      const textPatterns = [
        /\(([^)]+)\)\s*Tj/g, // (text) Tj
        /\[([^\]]+)\]\s*TJ/g, // [text array] TJ
        /\(([^)]+)\)\s*'/g, // (text) '
        /\(([^)]+)\)\s*"/g, // (text) "
      ];

      let extractedText = '';

      for (const pattern of textPatterns) {
        let match;
        while ((match = pattern.exec(textBlock)) !== null) {
          let text = match[1];

          // Clean up text - remove escape sequences
          text = text.replace(/\\n/g, ' ')
                    .replace(/\\r/g, ' ')
                    .replace(/\\t/g, ' ')
                    .replace(/\\\\/g, '\\')
                    .replace(/\\(.)/g, '$1');

          extractedText += text + ' ';
        }
      }

      return extractedText.trim();

    } catch (error) {
      return '';
    }
  }

  private extractTextFromStream(stream: string): string {
    // Very basic stream text extraction
    // Remove PDF operators and try to find readable text

    const cleaned = stream
      .replace(/stream|endstream/g, '')
      .replace(/[<>]/g, '')
      .replace(/\b\d+\s+\d+\s+(obj|R)\b/g, '')
      .replace(/\/[A-Za-z]+\b/g, '')
      .replace(/\b\d+(\.\d+)?\b/g, ' ')
      .replace(/[^\w\s.,;:!?()$%-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Only return if it looks like meaningful text
    if (cleaned.length > 10 && /[a-zA-Z]/.test(cleaned)) {
      return cleaned;
    }

    return '';
  }

  private estimatePageCount(buffer: Buffer): number {
    const pdfString = buffer.toString('latin1');

    // Count page objects
    const pageMatches = pdfString.match(/\/Type\s*\/Page[^s]/g);
    if (pageMatches && pageMatches.length > 0) {
      return pageMatches.length;
    }

    // Fallback to size-based estimation
    return Math.max(1, Math.floor(buffer.length / 50000));
  }
}