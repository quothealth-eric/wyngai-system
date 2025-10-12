import crypto from "crypto";
import { gcpClientsFactory } from "../gcp/clients";

export type OcrDocType = "BILL" | "EOB" | "LETTER" | "PORTAL" | "INSURANCE_CARD" | "UNKNOWN";

export interface OcrRow {
  code?: string;
  codeSystem?: "CPT" | "HCPCS" | "REV" | "POS";
  modifiers?: string[];
  description?: string;
  units?: number;
  dos?: string; // date of service
  pos?: string; // place of service
  revCode?: string;
  npi?: string;
  charge?: string;
  allowed?: string;
  planPaid?: string;
  patientResp?: string;
  page?: number;
  bbox?: [number, number, number, number];
  conf?: number;
}

export interface OcrResult {
  artifactId: string;
  artifactDigest: string;
  contentType: string;
  pages: number;
  text: string; // full extracted text
  rows: OcrRow[]; // may be empty; we parse rows later from text
}

// MIME type helpers
const isPdf = (mime: string) => mime === "application/pdf";
const isTiff = (mime: string) => mime === "image/tiff" || mime === "image/tif";
const isImage = (mime: string) => [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp"
].includes(mime);

export async function ocrBuffer(
  buffer: Buffer,
  filename: string,
  mime: string
): Promise<OcrResult> {
  console.log(`🔍 Starting OCR for ${filename} (${mime}, ${buffer.length} bytes)`);

  const { vision, storage, UPLOAD_BUCKET, OUTPUT_BUCKET } = gcpClientsFactory();
  const artifactId = crypto.randomUUID();
  const artifactDigest = crypto.createHash("sha256").update(buffer).digest("hex");
  const gcsUploadPath = `${artifactId}/${filename}`;

  console.log(`📤 Uploading to GCS: ${UPLOAD_BUCKET}/${gcsUploadPath}`);

  // Upload source file to GCS
  await storage
    .bucket(UPLOAD_BUCKET)
    .file(gcsUploadPath)
    .save(buffer, {
      contentType: mime,
      resumable: false,
      metadata: {
        artifactId,
        originalFilename: filename
      }
    });

  console.log(`✅ File uploaded to GCS successfully`);

  if (isImage(mime)) {
    console.log(`🖼️ Processing image with synchronous Vision API...`);

    // Synchronous Document Text Detection for images
    const [resp] = await vision.documentTextDetection({
      image: {
        source: {
          imageUri: `gs://${UPLOAD_BUCKET}/${gcsUploadPath}`
        }
      }
    });

    const text = resp.fullTextAnnotation?.text ||
                 resp.textAnnotations?.[0]?.description ||
                 "";

    const pages = resp.fullTextAnnotation?.pages?.length ?? 1;

    console.log(`📝 Extracted ${text.length} characters from image`);

    return {
      artifactId,
      artifactDigest,
      contentType: mime,
      pages,
      text,
      rows: [] // Will be populated by normalization step
    };
  }

  if (isPdf(mime) || isTiff(mime)) {
    console.log(`📄 Processing ${isPdf(mime) ? 'PDF' : 'TIFF'} with async Vision API...`);

    // Async batch annotate → outputs JSON to OUTPUT_BUCKET (Vision requirement for PDF/TIFF)
    const gcsDest = `gs://${OUTPUT_BUCKET}/${artifactId}/`;

    const request = {
      requests: [{
        inputConfig: {
          mimeType: isPdf(mime) ? "application/pdf" : "image/tiff",
          gcsSource: { uri: `gs://${UPLOAD_BUCKET}/${gcsUploadPath}` }
        },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" as const }],
        outputConfig: {
          gcsDestination: { uri: gcsDest },
          batchSize: 20
        }
      }]
    };

    console.log(`🚀 Starting async Vision API operation...`);
    const [operation] = await vision.asyncBatchAnnotateFiles(request as any);

    console.log(`⏳ Waiting for Vision API operation to complete...`);
    await operation.promise();

    console.log(`✅ Vision API operation completed`);

    // Vision writes one or more JSON files to OUTPUT_BUCKET/<artifactId>/
    console.log(`📥 Downloading results from ${OUTPUT_BUCKET}/${artifactId}/`);
    const [files] = await storage.bucket(OUTPUT_BUCKET).getFiles({
      prefix: `${artifactId}/`
    });

    let combinedText = "";
    let pages = 0;

    for (const file of files) {
      if (file.name.endsWith('.json')) {
        console.log(`📋 Processing result file: ${file.name}`);
        const [jsonBuf] = await file.download();
        const output = JSON.parse(jsonBuf.toString("utf-8"));

        // Handle different response structures from Vision API
        const responses = output.responses?.[0]?.responses || output.responses || [];

        for (const page of responses) {
          const pageText = page.fullTextAnnotation?.text ||
                          page.textAnnotations?.[0]?.description ||
                          "";

          if (pageText) {
            combinedText += (combinedText ? "\n" : "") + pageText;
            pages += 1;
          }
        }
      }
    }

    console.log(`📝 Extracted ${combinedText.length} characters from ${pages} pages`);

    return {
      artifactId,
      artifactDigest,
      contentType: mime,
      pages: Math.max(1, pages),
      text: combinedText,
      rows: [] // Will be populated by normalization step
    };
  }

  throw new Error(`Unsupported content type: ${mime}`);
}