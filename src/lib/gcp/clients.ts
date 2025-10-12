import { ImageAnnotatorClient } from '@google-cloud/vision';
import { Storage } from '@google-cloud/storage';

export interface GCPClients {
  vision: ImageAnnotatorClient;
  storage: Storage;
  UPLOAD_BUCKET: string;
  OUTPUT_BUCKET: string;
}

export const gcpClientsFactory = (): GCPClients => {
  console.log('🔑 Initializing GCP clients...');

  // Get base64 encoded service account key
  const b64 = process.env.GCP_SA_KEY_B64;
  if (!b64) {
    throw new Error("GCP_SA_KEY_B64 environment variable missing");
  }

  // Decode and parse credentials
  let creds: any;
  try {
    creds = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
    console.log(`📧 Using service account: ${creds.client_email}`);
  } catch (error) {
    throw new Error(`Failed to parse GCP service account credentials: ${error}`);
  }

  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) {
    throw new Error("GCP_PROJECT_ID environment variable missing");
  }

  // Get bucket names
  const UPLOAD_BUCKET = process.env.GCS_UPLOAD_BUCKET;
  const OUTPUT_BUCKET = process.env.GCS_OUTPUT_BUCKET;

  if (!UPLOAD_BUCKET || !OUTPUT_BUCKET) {
    throw new Error("GCS bucket environment variables missing (GCS_UPLOAD_BUCKET, GCS_OUTPUT_BUCKET)");
  }

  console.log(`🪣 Upload bucket: ${UPLOAD_BUCKET}`);
  console.log(`🪣 Output bucket: ${OUTPUT_BUCKET}`);

  // Initialize clients with credentials
  const vision = new ImageAnnotatorClient({
    credentials: creds,
    projectId: projectId
  });

  const storage = new Storage({
    credentials: creds,
    projectId: projectId
  });

  console.log('✅ GCP clients initialized successfully');

  return {
    vision,
    storage,
    UPLOAD_BUCKET,
    OUTPUT_BUCKET
  };
};