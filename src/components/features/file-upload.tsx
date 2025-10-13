'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Upload, FileText, X, AlertCircle } from 'lucide-react'
import { trackEvent } from '@/lib/analytics'

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  status: 'uploading' | 'processing' | 'completed' | 'error'
  progress?: number
  ocrText?: string
  statusMessage?: string
  databaseId?: string // Database ID from successful upload
}

interface FileUploadProps {
  onFileUploaded: (file: UploadedFile) => void
  onFileRemoved: (fileId: string) => void
  uploadedFiles: UploadedFile[]
  disabled?: boolean
  sessionId?: string // Optional session ID for uploads
  onSessionCreated?: (sessionId: string) => void // Callback when session is created
}

export function FileUpload({ onFileUploaded, onFileRemoved, uploadedFiles, disabled, sessionId, onSessionCreated }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFileUpload = async (files: FileList) => {
    for (const file of Array.from(files)) {
      // Validate file type and size - support all primary image types
      const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp',
        'image/webp', 'image/svg+xml', 'image/tiff', 'image/heic', 'image/heif',
        'application/pdf'
      ];

      if (!allowedTypes.includes(file.type)) {
        alert('Please upload an image file (JPEG, PNG, GIF, BMP, WebP, SVG, TIFF, HEIC) or PDF')
        continue
      }

      if (file.size > 10 * 1024 * 1024) { // 10MB
        alert('File size must be less than 10MB')
        continue
      }

      const uploadedFile: UploadedFile = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'uploading',
        progress: 0
      }

      // Track file upload started
      trackEvent.fileUploadStarted(file.type, file.size)

      onFileUploaded(uploadedFile)

      // Simulate initial progress steps with status messages
      const progressSteps = [
        { progress: 10, delay: 100, message: 'Uploading file...' },
        { progress: 30, delay: 200, message: 'Validating document...' },
        { progress: 50, delay: 300, message: 'Processing upload...' },
        { progress: 70, delay: 200, message: 'Preparing for OCR...' },
        { progress: 85, delay: 500, message: 'Analyzing document...' },
      ]

      // Upload file with progress simulation
      try {
        const formData = new FormData()
        formData.append('file', file)

        // Add session and document number if available
        if (sessionId) {
          formData.append('sessionId', sessionId)
          formData.append('documentNumber', (uploadedFiles.length + 1).toString())
        }

        // Start progress animation
        for (const step of progressSteps) {
          await new Promise(resolve => setTimeout(resolve, step.delay))
          onFileUploaded({
            ...uploadedFile,
            progress: step.progress,
            statusMessage: step.message
          })
        }

        // Show processing status
        onFileUploaded({
          ...uploadedFile,
          status: 'processing',
          progress: 90,
          statusMessage: 'Extracting text with OCR...'
        })

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          throw new Error('Upload failed')
        }

        const result = await response.json()

        // Notify parent about session creation if it happened
        if (result.sessionCreated && result.sessionId && onSessionCreated) {
          onSessionCreated(result.sessionId)
        }

        // Complete the upload - keep the original client ID to prevent duplicates
        const completedFile = {
          ...uploadedFile, // Keep original ID and other properties
          status: 'completed' as const,
          progress: 100,
          ocrText: result.ocrText,
          databaseId: result.id, // Store database ID separately
          statusMessage: `Document processed successfully and ready for analysis.`
        }

        onFileUploaded(completedFile)

        // Track file upload completed
        trackEvent.fileUploadCompleted(file.type, file.size)

        console.log('✅ File upload completed:', result)
      } catch (error) {
        console.error('Upload error:', error)
        onFileUploaded({
          ...uploadedFile,
          status: 'error',
          progress: 0,
          statusMessage: 'Upload failed. Please try again.'
        })

        // Track file upload failed
        trackEvent.fileUploadFailed(file.type, file.size)
      }
    }
  }

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragOver(false)
      if (disabled) return

      const files = e.dataTransfer.files
      if (files.length > 0) {
        handleFileUpload(files)
      }
    },
    [disabled]
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!disabled) {
      setIsDragOver(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragOver
            ? 'border-primary bg-primary/5'
            : disabled
            ? 'border-gray-200 bg-gray-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <Upload className={`mx-auto h-12 w-12 ${disabled ? 'text-gray-300' : 'text-gray-400'} mb-4`} />
        <p className={`text-sm ${disabled ? 'text-gray-400' : 'text-gray-600'} mb-2`}>
          {disabled ? 'Upload disabled during processing' : 'Drag and drop your medical bills here, or click to browse'}
        </p>
        <p className="text-xs text-gray-400 mb-4">
          Upload PDF, JPEG, PNG files • Up to 10MB each • All documents stored securely
        </p>
        <input
          type="file"
          id="file-upload"
          className="hidden"
          multiple
          accept=".jpg,.jpeg,.png,.pdf"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFileUpload(e.target.files)
            }
          }}
        />
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => {
            trackEvent.chooseFilesClick()
            document.getElementById('file-upload')?.click()
          }}
        >
          Choose Files
        </Button>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Uploaded Files</h4>
          {uploadedFiles.map((file) => (
            <Card key={file.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1">
                  <FileText className="h-5 w-5 text-gray-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                    {file.statusMessage && (
                      <p className="text-xs text-blue-600 mt-1">{file.statusMessage}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {(file.status === 'uploading' || file.status === 'processing') && (
                    <div className="w-24">
                      <Progress value={file.progress} className="h-2" />
                      <p className="text-xs text-gray-500 mt-1 text-center">{file.progress}%</p>
                    </div>
                  )}
                  {file.status === 'completed' && (
                    <div className="text-green-600">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {file.status === 'error' && (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      trackEvent.fileRemoved(file.type)
                      onFileRemoved(file.id)
                    }}
                    disabled={file.status === 'uploading' || file.status === 'processing'}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}