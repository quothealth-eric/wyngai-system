/**
 * Google Cloud Vision OCR implementation
 */

import { ImageAnnotatorClient } from '@google-cloud/vision';
import { Storage } from '@google-cloud/storage';
import { OCRPageResult, OCRResult } from '@/lib/types/ocr';

let visionClient: ImageAnnotatorClient | null = null;
let storageClient: Storage | null = null;

/**
 * Initialize Google Cloud clients
 */
function initializeClients() {
  if (!process.env.GCP_PROJECT_ID || !process.env.GCP_SA_KEY_B64) {
    throw new Error('Missing Google Cloud credentials');
  }

  try {
    // Decode base64 service account key
    const serviceAccountKey = JSON.parse(
      Buffer.from(process.env.GCP_SA_KEY_B64, 'base64').toString('utf-8')
    );

    const clientConfig = {
      projectId: process.env.GCP_PROJECT_ID,
      credentials: serviceAccountKey,
    };

    visionClient = new ImageAnnotatorClient(clientConfig);
    storageClient = new Storage(clientConfig);
  } catch (error) {
    console.error('Failed to initialize Google Cloud clients:', error);
    throw new Error('Failed to initialize Google Cloud clients');
  }
}

/**
 * Get or create initialized Vision client
 */
function getVisionClient(): ImageAnnotatorClient {
  if (!visionClient) {
    initializeClients();
  }
  return visionClient!;
}

/**
 * Get or create initialized Storage client
 */
function getStorageClient(): Storage {
  if (!storageClient) {
    initializeClients();
  }
  return storageClient!;
}

/**
 * OCR processing for images (JPEG/PNG) using sync API
 */
export async function processImageWithVision(
  imageBuffer: Buffer,
  mimeType: string
): Promise<OCRResult> {
  const startTime = Date.now();

  try {
    const client = getVisionClient();

    const [result] = await client.documentTextDetection({
      image: {
        content: imageBuffer,
      },
    });

    const pages = extractPagesFromVisionResult(result);
    const processingTimeMs = Date.now() - startTime;

    return {
      vendor: 'google',
      pages,
      processingTimeMs,
      success: true,
    };
  } catch (error) {
    console.error('Google Vision OCR failed:', error);
    return {
      vendor: 'google',
      pages: [],
      processingTimeMs: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * OCR processing for PDFs using async batch API
 */
export async function processPdfWithVision(
  pdfBuffer: Buffer,
  tempBucketName: string
): Promise<OCRResult> {
  const startTime = Date.now();

  try {
    const client = getVisionClient();
    const storage = getStorageClient();

    // Generate unique file names
    const inputFileName = `temp_ocr_input_${Date.now()}.pdf`;
    const outputPrefix = `temp_ocr_output_${Date.now()}/`;

    // Upload PDF to temporary bucket
    const bucket = storage.bucket(tempBucketName);
    const inputFile = bucket.file(inputFileName);

    await inputFile.save(pdfBuffer, {
      metadata: {
        contentType: 'application/pdf',
      },
    });

    // Configure batch request
    const request = {
      requests: [
        {
          inputConfig: {
            gcsSource: {
              uri: `gs://${tempBucketName}/${inputFileName}`,
            },
            mimeType: 'application/pdf',
          },
          features: [
            {
              type: 'DOCUMENT_TEXT_DETECTION' as const,
            },
          ],
          outputConfig: {
            gcsDestination: {
              uri: `gs://${tempBucketName}/${outputPrefix}`,
            },
            batchSize: 20, // Process up to 20 pages per output file
          },
        },
      ],
    };

    // Start async batch operation
    const [operation] = await client.asyncBatchAnnotateFiles(request);

    // Wait for completion (with timeout)
    const [response] = await operation.promise();

    // Download and parse results
    const pages = await parseAsyncVisionResults(bucket, outputPrefix);

    // Cleanup temporary files
    await cleanupTempFiles(bucket, inputFileName, outputPrefix);

    const processingTimeMs = Date.now() - startTime;

    return {
      vendor: 'google',
      pages,
      processingTimeMs,
      success: true,
    };
  } catch (error) {
    console.error('Google Vision PDF OCR failed:', error);
    return {
      vendor: 'google',
      pages: [],
      processingTimeMs: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Extract page results from Vision API response
 */
function extractPagesFromVisionResult(result: any): OCRPageResult[] {
  if (!result.fullTextAnnotation?.pages) {
    return [];
  }

  return result.fullTextAnnotation.pages.map((page: any, index: number) => {
    const pageText = extractPageText(page);
    const lines = extractPageLines(page);
    const confidence = calculatePageConfidence(page);

    return {
      pageNumber: index + 1,
      text: pageText,
      confidence,
      lines,
    };
  });
}

/**
 * Extract text content from a Vision API page
 */
function extractPageText(page: any): string {
  if (!page.blocks) return '';

  const textParts: string[] = [];

  for (const block of page.blocks) {
    if (!block.paragraphs) continue;

    for (const paragraph of block.paragraphs) {
      if (!paragraph.words) continue;

      const paragraphText = paragraph.words
        .map((word: any) => {
          if (!word.symbols) return '';
          return word.symbols.map((symbol: any) => symbol.text || '').join('');
        })
        .join(' ');

      if (paragraphText.trim()) {
        textParts.push(paragraphText.trim());
      }
    }
  }

  return textParts.join('\n');
}

/**
 * Extract line-level information from a Vision API page
 */
function extractPageLines(page: any): OCRPageResult['lines'] {
  const lines: OCRPageResult['lines'] = [];

  if (!page.blocks) return lines;

  for (const block of page.blocks) {
    if (!block.paragraphs) continue;

    for (const paragraph of block.paragraphs) {
      if (!paragraph.words) continue;

      const lineText = paragraph.words
        .map((word: any) => {
          if (!word.symbols) return '';
          return word.symbols.map((symbol: any) => symbol.text || '').join('');
        })
        .join(' ');

      if (lineText.trim()) {
        const bbox = extractBoundingBox(paragraph.boundingBox);
        const confidence = paragraph.confidence || 0;

        lines.push({
          text: lineText.trim(),
          bbox,
          confidence,
        });
      }
    }
  }

  return lines;
}

/**
 * Calculate overall confidence for a page
 */
function calculatePageConfidence(page: any): number {
  if (!page.blocks) return 0;

  let totalConfidence = 0;
  let count = 0;

  for (const block of page.blocks) {
    if (block.confidence !== undefined) {
      totalConfidence += block.confidence;
      count++;
    }
  }

  return count > 0 ? totalConfidence / count : 0;
}

/**
 * Extract bounding box coordinates
 */
function extractBoundingBox(boundingBox: any): [number, number, number, number] | undefined {
  if (!boundingBox?.vertices || boundingBox.vertices.length < 4) {
    return undefined;
  }

  const vertices = boundingBox.vertices;
  const xs = vertices.map((v: any) => v.x || 0);
  const ys = vertices.map((v: any) => v.y || 0);

  return [
    Math.min(...xs), // left
    Math.min(...ys), // top
    Math.max(...xs), // right
    Math.max(...ys), // bottom
  ];
}

/**
 * Parse results from async batch processing
 */
async function parseAsyncVisionResults(
  bucket: any,
  outputPrefix: string
): Promise<OCRPageResult[]> {
  const pages: OCRPageResult[] = [];

  try {
    const [files] = await bucket.getFiles({
      prefix: outputPrefix,
    });

    // Sort files by name to maintain page order
    const sortedFiles = files.sort((a: any, b: any) => a.name.localeCompare(b.name));

    for (const file of sortedFiles) {
      const [contents] = await file.download();
      const jsonResult = JSON.parse(contents.toString());

      if (jsonResult.responses) {
        for (const response of jsonResult.responses) {
          const visionPages = extractPagesFromVisionResult(response);
          pages.push(...visionPages);
        }
      }
    }
  } catch (error) {
    console.error('Failed to parse async Vision results:', error);
  }

  return pages;
}

/**
 * Cleanup temporary files from bucket
 */
async function cleanupTempFiles(
  bucket: any,
  inputFileName: string,
  outputPrefix: string
): Promise<void> {
  try {
    // Delete input file
    await bucket.file(inputFileName).delete({ ignoreNotFound: true });

    // Delete output files
    const [files] = await bucket.getFiles({ prefix: outputPrefix });
    await Promise.all(
      files.map((file: any) => file.delete({ ignoreNotFound: true }))
    );
  } catch (error) {
    console.warn('Failed to cleanup temp files:', error);
  }
}

/**
 * Check if Google Cloud Vision is available
 */
export function isVisionAvailable(): boolean {
  return !!(process.env.GCP_PROJECT_ID && process.env.GCP_SA_KEY_B64);
}