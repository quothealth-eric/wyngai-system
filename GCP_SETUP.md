# Google Cloud Vision OCR Setup Guide

This guide will help you set up Google Cloud Vision OCR for the Wyng Lite application.

## Prerequisites

1. Google Cloud Platform account
2. Billing enabled on your GCP project
3. Vercel account (for deployment)

## Step 1: GCP Project Setup

### Create a New Project (or use existing)
```bash
# Create a new project
gcloud projects create wyng-medical-ocr

# Set as default project
gcloud config set project wyng-medical-ocr
```

### Enable Required APIs
```bash
# Enable Vision API
gcloud services enable vision.googleapis.com

# Enable Cloud Storage API
gcloud services enable storage-component.googleapis.com
```

## Step 2: Create Service Account

### Create Service Account
```bash
# Create service account
gcloud iam service-accounts create wyng-ocr \
    --description="Wyng OCR Service Account" \
    --display-name="Wyng OCR"
```

### Grant Required Roles
```bash
# Vision API access
gcloud projects add-iam-policy-binding wyng-medical-ocr \
    --member="serviceAccount:wyng-ocr@wyng-medical-ocr.iam.gserviceaccount.com" \
    --role="roles/vision.user"

# Storage access
gcloud projects add-iam-policy-binding wyng-medical-ocr \
    --member="serviceAccount:wyng-ocr@wyng-medical-ocr.iam.gserviceaccount.com" \
    --role="roles/storage.objectAdmin"

gcloud projects add-iam-policy-binding wyng-medical-ocr \
    --member="serviceAccount:wyng-ocr@wyng-medical-ocr.iam.gserviceaccount.com" \
    --role="roles/storage.admin"
```

### Create and Download Service Account Key
```bash
# Create and download service account key
gcloud iam service-accounts keys create ~/wyng-ocr-key.json \
    --iam-account=wyng-ocr@wyng-medical-ocr.iam.gserviceaccount.com
```

## Step 3: Create Cloud Storage Buckets

### Create Upload Bucket
```bash
# Create upload bucket (choose region close to Vercel: us-east1, us-west2, etc.)
gsutil mb -p wyng-medical-ocr -c STANDARD -l us-east1 gs://wyng-ocr-uploads-prod

# Set CORS for upload bucket
gsutil cors set cors.json gs://wyng-ocr-uploads-prod
```

### Create Output Bucket
```bash
# Create output bucket for Vision API results
gsutil mb -p wyng-medical-ocr -c STANDARD -l us-east1 gs://wyng-ocr-output-prod
```

### CORS Configuration (cors.json)
Create a `cors.json` file:
```json
[
  {
    "origin": ["*"],
    "method": ["GET", "POST", "PUT"],
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"],
    "maxAgeSeconds": 3600
  }
]
```

## Step 4: Environment Variables

### Convert Service Account Key to Base64
```bash
# Convert service account key to base64 (for Vercel)
base64 -i ~/wyng-ocr-key.json -o ~/wyng-ocr-key-base64.txt

# Or on macOS:
base64 ~/wyng-ocr-key.json > ~/wyng-ocr-key-base64.txt
```

### Required Environment Variables

Set these in your Vercel dashboard or `.env.local`:

```bash
# GCP Configuration
GCP_PROJECT_ID=wyng-medical-ocr
GCP_SA_KEY_B64=[paste the base64 content from above]

# Cloud Storage Buckets
GCS_UPLOAD_BUCKET=wyng-ocr-uploads-prod
GCS_OUTPUT_BUCKET=wyng-ocr-output-prod
```

### For Local Development (.env.local)
```bash
# Copy the base64 content (all on one line, no breaks)
GCP_PROJECT_ID=wyng-medical-ocr
GCP_SA_KEY_B64=ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsCiAgInByb2plY3RfaWQiOiAi...
GCS_UPLOAD_BUCKET=wyng-ocr-uploads-prod
GCS_OUTPUT_BUCKET=wyng-ocr-output-prod
```

## Step 5: Vercel Deployment

### Add Environment Variables to Vercel
1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add each variable:
   - `GCP_PROJECT_ID`: `wyng-medical-ocr`
   - `GCP_SA_KEY_B64`: [paste the base64 content - ensure it's all on one line]
   - `GCS_UPLOAD_BUCKET`: `wyng-ocr-uploads-prod`
   - `GCS_OUTPUT_BUCKET`: `wyng-ocr-output-prod`

### Important Notes
- **Base64 Encoding**: The service account key MUST be base64 encoded for Vercel
- **No Line Breaks**: Ensure the base64 string has no line breaks or spaces
- **Bucket Regions**: Choose regions close to your Vercel deployment region for better performance
- **Security**: Never commit service account keys to git. Always use environment variables.

## Step 6: Testing

### Test the Setup
```bash
# Test locally
npm run dev

# Test the OCR endpoint
curl -X POST http://localhost:3000/api/ocr/ingest \
  -F "file=@test-bill.pdf"
```

### Debug Environment Setup
Visit: `https://your-app.vercel.app/api/debug/google-vision-env`

This endpoint will check your environment configuration and provide specific guidance.

## Supported File Types

- **PDF**: Multi-page documents (async processing)
- **JPEG/JPG**: Images (sync processing)
- **PNG**: Images (sync processing)
- **TIFF**: Multi-page or single images (async processing)
- **HEIC/HEIF**: Apple photos (sync processing)
- **WebP**: Web images (sync processing)

## Cost Considerations

### Google Cloud Vision Pricing (as of 2024)
- **Document Text Detection**: $1.50 per 1,000 images
- **PDF/TIFF Processing**: $1.50 per 1,000 pages
- **Free Tier**: 1,000 units/month

### Cloud Storage Pricing
- **Standard Storage**: ~$0.020 per GB/month
- **Operations**: Minimal cost for OCR use case

### Optimization Tips
- Use appropriate image resolution (300 DPI recommended)
- Compress large PDFs when possible
- Clean up temporary files in GCS buckets regularly

## Security Best Practices

1. **Service Account Permissions**: Use minimal required permissions
2. **Bucket Access**: Consider bucket-level IAM policies
3. **Environment Variables**: Never expose service account keys in client-side code
4. **Network Security**: Consider VPC restrictions for production
5. **Audit Logging**: Enable Cloud Audit Logs for compliance

## Troubleshooting

### Common Issues

1. **"Missing GCP_SA_KEY_B64"**
   - Ensure the environment variable is set in Vercel
   - Check that base64 encoding was done correctly

2. **"Google Cloud Vision client not initialized"**
   - Verify all 4 environment variables are set
   - Check that the service account has proper roles

3. **"Bucket not found"**
   - Verify bucket names in environment variables
   - Ensure buckets are in the correct project

4. **"Rate limit exceeded"**
   - Implement exponential backoff
   - Consider upgrading your GCP quota

### Debug Commands
```bash
# Check if APIs are enabled
gcloud services list --enabled --filter="vision"

# Verify service account
gcloud iam service-accounts list

# Check bucket permissions
gsutil iam get gs://wyng-ocr-uploads-prod
```

## Production Checklist

- [ ] Service account created with minimal permissions
- [ ] All required APIs enabled
- [ ] Buckets created in appropriate regions
- [ ] Environment variables set in Vercel
- [ ] CORS configured for upload bucket
- [ ] OCR endpoint tested with sample files
- [ ] Cost monitoring alerts set up
- [ ] Audit logging enabled
- [ ] Regular bucket cleanup scheduled