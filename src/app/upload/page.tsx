'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Upload, FileText, X, AlertCircle } from '@/components/ui/icons'
import Image from 'next/image'

interface UploadedFile {
  id?: string
  name: string
  size: number
  type: string
  status: 'uploading' | 'completed' | 'error'
  progress?: number
  file?: File
  documentType?: 'bill' | 'eob'
}

export default function UploadPage() {
  const router = useRouter()
  const [caseId, setCaseId] = useState<string | null>(null)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Initialize case session on first file
  const initializeCase = async () => {
    if (caseId) return caseId

    try {
      const response = await fetch('/api/case/init', { method: 'POST' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error)
      }

      setCaseId(data.caseId)
      return data.caseId
    } catch (error) {
      console.error('Failed to initialize case:', error)
      throw error
    }
  }

  const handleFileUpload = async (fileList: FileList) => {
    const newFiles = Array.from(fileList).map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'uploading' as const,
      progress: 0,
      file,
      documentType: 'bill' as const
    }))

    // Validate files
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/tiff',
      'image/heic', 'image/heif', 'application/pdf'
    ]

    for (const file of newFiles) {
      if (!allowedTypes.includes(file.type)) {
        alert(`File ${file.name} has unsupported type. Please upload PDF, JPEG, PNG, TIFF, or HEIC files.`)
        return
      }
      if (file.size > 20 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Maximum size is 20MB.`)
        return
      }
    }

    if (files.length + newFiles.length > 6) {
      alert('Maximum 6 files allowed')
      return
    }

    setFiles(prev => [...prev, ...newFiles])

    try {
      // Initialize case if needed
      const currentCaseId = await initializeCase()

      // Upload files
      const formData = new FormData()
      formData.append('caseId', currentCaseId)

      newFiles.forEach((fileData, index) => {
        if (fileData.file) {
          formData.append('files', fileData.file)
          formData.append(`documentType_${index}`, fileData.documentType || 'bill')
        }
      })

      // Simulate progress
      const progressInterval = setInterval(() => {
        setFiles(prev => prev.map(f =>
          newFiles.find(nf => nf.name === f.name)
            ? { ...f, progress: Math.min((f.progress || 0) + 10, 90) }
            : f
        ))
      }, 200)

      const response = await fetch('/api/case/upload', {
        method: 'POST',
        body: formData
      })

      clearInterval(progressInterval)

      // Check if response is JSON
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        console.error('Non-JSON response:', text)
        throw new Error(`Server error: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || `Upload failed: ${response.status}`)
      }

      // Mark files as completed
      setFiles(prev => prev.map(f =>
        newFiles.find(nf => nf.name === f.name)
          ? { ...f, status: 'completed' as const, progress: 100 }
          : f
      ))

      console.log('✅ Files uploaded successfully:', result)

    } catch (error) {
      console.error('Upload failed:', error)

      // Mark files as error
      setFiles(prev => prev.map(f =>
        newFiles.find(nf => nf.name === f.name)
          ? { ...f, status: 'error' as const, progress: 0 }
          : f
      ))

      alert('Upload failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)

    const droppedFiles = e.dataTransfer.files
    if (droppedFiles.length > 0) {
      handleFileUpload(droppedFiles)
    }
  }, [handleFileUpload])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const updateDocumentType = (index: number, documentType: 'bill' | 'eob') => {
    setFiles(prev => prev.map((file, i) =>
      i === index ? { ...file, documentType } : file
    ))
  }

  const handleNext = async () => {
    if (files.length === 0) {
      alert('Please upload at least one file')
      return
    }

    if (files.some(f => f.status !== 'completed')) {
      alert('Please wait for all files to finish uploading')
      return
    }

    if (!caseId) {
      alert('No case session found')
      return
    }

    setIsProcessing(true)
    router.push(`/describe?caseId=${caseId}`)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Image src="/images/wyng-logo.svg" alt="Wyng" width={32} height={32} />
            <span className="text-2xl font-bold text-primary">Wyng Lite</span>
          </div>
          <div className="text-sm text-gray-500">
            Step 1 of 3: Upload Documents
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Upload Your Medical Documents
          </h1>
          <p className="text-lg text-gray-600 mb-6">
            Upload your medical bills, EOBs, or insurance documents. We support PDF, JPEG, PNG, TIFF, and HEIC files.
          </p>
        </div>

        {/* Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-6 ${
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-lg text-gray-600 mb-2">
            Drag and drop your documents here, or click to browse
          </p>
          <p className="text-sm text-gray-400 mb-6">
            PDF, JPEG, PNG, TIFF, HEIC • Up to 20MB each • Maximum 6 files
          </p>

          <input
            type="file"
            id="file-upload"
            className="hidden"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.heic,.heif"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileUpload(e.target.files)
              }
            }}
          />

          <Button
            onClick={() => document.getElementById('file-upload')?.click()}
            className="btn-wyng-gradient"
          >
            Choose Files
          </Button>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-3 mb-8">
            <h3 className="text-lg font-semibold text-gray-900">Uploaded Files ({files.length}/6)</h3>
            {files.map((file, index) => (
              <Card key={index} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <p className="text-sm font-medium text-gray-900">{file.name}</p>
                        <select
                          value={file.documentType || 'bill'}
                          onChange={(e) => updateDocumentType(index, e.target.value as 'bill' | 'eob')}
                          disabled={file.status === 'uploading'}
                          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                        >
                          <option value="bill">Medical Bill</option>
                          <option value="eob">EOB (Explanation of Benefits)</option>
                        </select>
                      </div>
                      <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    {file.status === 'uploading' && (
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
                      onClick={() => removeFile(index)}
                      disabled={file.status === 'uploading'}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Next Button */}
        <div className="text-center">
          <Button
            onClick={handleNext}
            disabled={files.length === 0 || files.some(f => f.status !== 'completed') || isProcessing}
            className="btn-wyng-gradient text-lg py-3 px-8"
            size="lg"
          >
            {isProcessing ? 'Processing...' : `Next: Describe Your Issue (${files.filter(f => f.status === 'completed').length} files)`}
          </Button>

          {files.length > 0 && (
            <p className="text-sm text-gray-500 mt-4">
              Your files are securely stored and will be analyzed by our team within 24-48 hours.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}