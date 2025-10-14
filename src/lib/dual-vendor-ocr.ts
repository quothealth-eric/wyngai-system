// Stub file to prevent import errors during build
// This module is not used in the current implementation

export interface OCRJob {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  result?: {
    text: string
    confidence: number
  }
}

export async function queueOCRJob(buffer: Buffer, mimeType: string): Promise<OCRJob> {
  console.warn('dual-vendor-ocr is deprecated and not implemented')
  return {
    id: 'stub-' + Date.now(),
    status: 'failed'
  }
}

export async function getOCRJobStatus(jobId: string): Promise<OCRJob | null> {
  console.warn('dual-vendor-ocr is deprecated and not implemented')
  return null
}

// Default export for compatibility
export default {
  queueOCRJob,
  getOCRJobStatus
}