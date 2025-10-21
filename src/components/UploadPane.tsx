'use client'

import React, { useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  Upload,
  X,
  FileText,
  Image,
  File,
  AlertCircle,
  CheckCircle,
  Loader2,
  Camera,
  Plus
} from 'lucide-react'

interface UploadFile {
  id: string
  file: File
  preview?: string
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

interface UploadPaneProps {
  threadId?: string | null
  onUploadComplete?: (result: any) => void
  onCancel?: () => void
}

export function UploadPane({ threadId, onUploadComplete, onCancel }: UploadPaneProps) {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [description, setDescription] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [advancedInputs, setAdvancedInputs] = useState({
    specificConcerns: '',
    comparisonNeeded: false,
    priorAnalysis: '',
    focusAreas: [] as string[]
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // File size limits
  const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB per file
  const MAX_TOTAL_SIZE = 100 * 1024 * 1024 // 100MB total

  const getTotalSize = useCallback(() => {
    return files.reduce((total, uploadFile) => total + uploadFile.file.size, 0)
  }, [files])

  const formatFileSize = useCallback((bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }, [])

  const validateFile = useCallback((file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}`
    }

    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/tiff',
      'image/tif'
    ]

    if (!allowedTypes.includes(file.type)) {
      return 'Unsupported file type. Please upload PDF or image files.'
    }

    return null
  }, [formatFileSize])

  const generatePreview = useCallback((file: File): Promise<string | undefined> => {
    return new Promise((resolve) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (e) => {
          resolve(e.target?.result as string)
        }
        reader.onerror = () => resolve(undefined)
        reader.readAsDataURL(file)
      } else {
        resolve(undefined)
      }
    })
  }, [])

  const addFiles = useCallback(async (newFiles: File[]) => {
    const validFiles: UploadFile[] = []

    for (const file of newFiles) {
      const error = validateFile(file)
      const currentTotal = getTotalSize()

      if (currentTotal + file.size > MAX_TOTAL_SIZE) {
        alert(`Adding this file would exceed the total size limit of ${formatFileSize(MAX_TOTAL_SIZE)}`)
        break
      }

      const preview = await generatePreview(file)

      validFiles.push({
        id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        file,
        preview,
        status: error ? 'error' : 'pending',
        error: error || undefined
      })
    }

    setFiles(prev => [...prev, ...validFiles])
  }, [validateFile, getTotalSize, formatFileSize, generatePreview])

  const removeFile = useCallback((fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length > 0) {
      addFiles(droppedFiles)
    }
  }, [addFiles])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files))
    }
  }, [addFiles])

  const handleAnalyze = useCallback(async () => {
    if (files.length === 0) {
      alert('Please upload at least one file to analyze.')
      return
    }

    const validFiles = files.filter(f => f.status !== 'error')
    if (validFiles.length === 0) {
      alert('Please fix file errors before analyzing.')
      return
    }

    setIsAnalyzing(true)

    try {
      const formData = new FormData()

      validFiles.forEach((uploadFile, index) => {
        formData.append(`files`, uploadFile.file)
      })

      formData.append('description', description)
      formData.append('threadId', threadId || `thread_${Date.now()}`)
      formData.append('userId', 'anonymous')

      // Add advanced inputs if provided
      if (advancedInputs.specificConcerns) {
        formData.append('specificConcerns', advancedInputs.specificConcerns)
      }
      if (advancedInputs.priorAnalysis) {
        formData.append('priorAnalysis', advancedInputs.priorAnalysis)
      }
      if (advancedInputs.focusAreas.length > 0) {
        formData.append('focusAreas', JSON.stringify(advancedInputs.focusAreas))
      }
      formData.append('comparisonNeeded', advancedInputs.comparisonNeeded.toString())

      const response = await fetch('/api/analyze/bills', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`)
      }

      const result = await response.json()

      // Update file statuses
      setFiles(prev => prev.map(f => ({ ...f, status: 'success' as const })))

      // Call completion handler
      if (onUploadComplete) {
        onUploadComplete(result)
      }

      // Analytics
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'bill_analysis_complete', {
          file_count: validFiles.length,
          total_size: getTotalSize(),
          has_description: !!description,
          has_advanced_inputs: !!(advancedInputs.specificConcerns || advancedInputs.priorAnalysis)
        })
      }

    } catch (error) {
      console.error('Analysis failed:', error)
      alert('Analysis failed. Please try again.')

      // Mark files as error
      setFiles(prev => prev.map(f => ({
        ...f,
        status: 'error' as const,
        error: 'Analysis failed'
      })))
    } finally {
      setIsAnalyzing(false)
    }
  }, [files, description, threadId, advancedInputs, getTotalSize, onUploadComplete])

  const getFileIcon = useCallback((file: File) => {
    if (file.type === 'application/pdf') {
      return <FileText className="h-8 w-8 text-red-500" />
    }
    if (file.type.startsWith('image/')) {
      return <Image className="h-8 w-8 text-green-500" />
    }
    return <File className="h-8 w-8 text-gray-500" />
  }, [])

  const focusAreaOptions = [
    'Billing Errors',
    'Insurance Coverage',
    'Out-of-Network Charges',
    'Duplicate Services',
    'Coding Accuracy',
    'Prior Authorization',
    'Cost Comparison',
    'Payment Disputes'
  ]

  const toggleFocusArea = useCallback((area: string) => {
    setAdvancedInputs(prev => ({
      ...prev,
      focusAreas: prev.focusAreas.includes(area)
        ? prev.focusAreas.filter(a => a !== area)
        : [...prev.focusAreas, area]
    }))
  }, [])

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Bills for Analysis
          </CardTitle>
          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* File Drop Zone */}
        <div
          ref={dropZoneRef}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive
              ? 'border-primary bg-primary/5'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="space-y-4">
            <Upload className="h-12 w-12 text-gray-400 mx-auto" />
            <div>
              <p className="text-lg font-medium text-gray-900">
                Drop your medical bills here
              </p>
              <p className="text-sm text-gray-600">
                or click to browse files
              </p>
            </div>
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="mx-2"
              >
                <Plus className="h-4 w-4 mr-2" />
                Choose Files
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = "image/*"
                    fileInputRef.current.setAttribute('capture', 'environment')
                    fileInputRef.current.click()
                  }
                }}
                className="sm:hidden mx-2"
              >
                <Camera className="h-4 w-4 mr-2" />
                Take Photo
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              PDF, JPG, PNG, TIFF • Max {formatFileSize(MAX_FILE_SIZE)} per file • {formatFileSize(MAX_TOTAL_SIZE)} total
            </p>
          </div>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">
                Files ({files.length})
              </h4>
              <div className="text-sm text-gray-600">
                Total: {formatFileSize(getTotalSize())} / {formatFileSize(MAX_TOTAL_SIZE)}
              </div>
            </div>

            <div className="space-y-2">
              {files.map((uploadFile) => (
                <div
                  key={uploadFile.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  {/* File preview/icon */}
                  <div className="flex-shrink-0">
                    {uploadFile.preview ? (
                      <img
                        src={uploadFile.preview}
                        alt={uploadFile.file.name}
                        className="h-12 w-12 object-cover rounded"
                      />
                    ) : (
                      getFileIcon(uploadFile.file)
                    )}
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {uploadFile.file.name}
                    </p>
                    <p className="text-xs text-gray-600">
                      {formatFileSize(uploadFile.file.size)}
                    </p>
                    {uploadFile.error && (
                      <p className="text-xs text-red-600 mt-1">
                        {uploadFile.error}
                      </p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="flex-shrink-0 flex items-center gap-2">
                    {uploadFile.status === 'pending' && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                    {uploadFile.status === 'uploading' && (
                      <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                    )}
                    {uploadFile.status === 'success' && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                    {uploadFile.status === 'error' && (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(uploadFile.id)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-900">
            Description (Optional)
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your concern or what you'd like us to focus on..."
            className="min-h-[80px]"
          />
        </div>

        {/* Advanced Inputs */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="advanced">
            <AccordionTrigger className="text-sm">
              Advanced Analysis Options
            </AccordionTrigger>
            <AccordionContent className="space-y-4">
              {/* Specific Concerns */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">
                  Specific Concerns
                </label>
                <Textarea
                  value={advancedInputs.specificConcerns}
                  onChange={(e) => setAdvancedInputs(prev => ({
                    ...prev,
                    specificConcerns: e.target.value
                  }))}
                  placeholder="Any specific billing issues or questions you have..."
                  className="min-h-[60px]"
                />
              </div>

              {/* Focus Areas */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">
                  Focus Areas
                </label>
                <div className="flex flex-wrap gap-2">
                  {focusAreaOptions.map((area) => (
                    <Badge
                      key={area}
                      variant={advancedInputs.focusAreas.includes(area) ? 'default' : 'secondary'}
                      className="cursor-pointer"
                      onClick={() => toggleFocusArea(area)}
                    >
                      {area}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Prior Analysis */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">
                  Prior Analysis or Context
                </label>
                <Textarea
                  value={advancedInputs.priorAnalysis}
                  onChange={(e) => setAdvancedInputs(prev => ({
                    ...prev,
                    priorAnalysis: e.target.value
                  }))}
                  placeholder="Any previous analysis or additional context..."
                  className="min-h-[60px]"
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-gray-600">
            {files.length > 0 && (
              <span>
                {files.filter(f => f.status !== 'error').length} of {files.length} files ready
              </span>
            )}
          </div>

          <div className="flex gap-3">
            {onCancel && (
              <Button
                variant="outline"
                onClick={onCancel}
                disabled={isAnalyzing}
              >
                Cancel
              </Button>
            )}
            <Button
              onClick={handleAnalyze}
              disabled={files.length === 0 || isAnalyzing || files.every(f => f.status === 'error')}
              className="min-w-[120px]"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                'Analyze Bills'
              )}
            </Button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/jpg,image/png,image/tiff"
          onChange={handleFileInput}
          className="hidden"
        />
      </CardContent>
    </Card>
  )
}