'use client'

import React, { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  Download,
  Phone,
  Mail,
  X,
  Eye,
  EyeOff
} from 'lucide-react'
import { BenefitsContext, AnalyzerResult } from '@/types/analyzer'
import { EmailCapture, useEmailCapture } from './email-capture'

interface UploadedFile {
  file: File
  preview?: string
}

export function EOBAnalyzer() {
  const { hasEmail, userEmail, handleEmailSubmit } = useEmailCapture()
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [result, setResult] = useState<AnalyzerResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [benefits, setBenefits] = useState<Partial<BenefitsContext>>({})
  const [showBenefitsForm, setShowBenefitsForm] = useState(false)
  const [userDescription, setUserDescription] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)

  const processFiles = useCallback((fileList: FileList | null) => {
    console.log('📁 processFiles called with:', fileList)
    if (!fileList || fileList.length === 0) {
      console.log('❌ No files provided')
      return
    }

    const uploadedFiles = Array.from(fileList)
    console.log('📁 Processing files:', uploadedFiles.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(2)}MB)`))

    // Client-side validation before processing
    const maxFileSize = 15 * 1024 * 1024; // 15MB
    const oversizedFiles = uploadedFiles.filter(file => file.size > maxFileSize);

    if (oversizedFiles.length > 0) {
      const oversizedNames = oversizedFiles.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(2)}MB)`);
      setError(`The following files exceed the 15MB limit: ${oversizedNames.join(', ')}. Please select smaller files.`);
      return;
    }

    // Check total size
    const currentTotalSize = files.reduce((sum, f) => sum + f.file.size, 0);
    const newTotalSize = uploadedFiles.reduce((sum, f) => sum + f.size, 0);
    const combinedSize = currentTotalSize + newTotalSize;

    if (combinedSize > 75 * 1024 * 1024) { // 75MB total
      setError(`Total file size would exceed 75MB limit. Current: ${(currentTotalSize / 1024 / 1024).toFixed(2)}MB, Adding: ${(newTotalSize / 1024 / 1024).toFixed(2)}MB`);
      return;
    }

    const newFiles: UploadedFile[] = uploadedFiles.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    }))

    console.log('📁 Adding files to state:', newFiles.length)
    setFiles(prev => {
      const updated = [...prev, ...newFiles]
      console.log('📁 Total files in state:', updated.length)
      return updated
    })
    setError(null)
  }, [files])

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(event.target.files)
    // Reset the input value to allow selecting the same files again if needed
    event.target.value = ''
  }, [processFiles])

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)
    processFiles(event.dataTransfer.files)
  }, [processFiles])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)
  }, [])

  const removeFile = useCallback((index: number) => {
    setFiles(prev => {
      const newFiles = [...prev]
      if (newFiles[index]?.preview) {
        URL.revokeObjectURL(newFiles[index].preview!)
      }
      newFiles.splice(index, 1)
      return newFiles
    })
  }, [])

  const handleAnalyze = async () => {
    if (files.length === 0) {
      setError('Please upload at least one document')
      return
    }

    setIsAnalyzing(true)
    setAnalysisProgress(0)
    setError(null)

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setAnalysisProgress(prev => Math.min(prev + 10, 90))
      }, 500)

      const formData = new FormData()

      console.log('🚀 Starting analysis with files:', files.map(f => `${f.file.name} (${(f.file.size / 1024 / 1024).toFixed(2)}MB)`))

      files.forEach((fileObj, index) => {
        console.log(`📤 Appending file ${index}: ${fileObj.file.name} (${fileObj.file.size} bytes)`)
        formData.append(`file_${index}`, fileObj.file)
      })

      formData.append('email', userEmail)
      formData.append('userDescription', userDescription)

      if (Object.keys(benefits).length > 0) {
        formData.append('benefits', JSON.stringify(benefits))
      }

      const response = await fetch('/api/analyze-documents', {
        method: 'POST',
        body: formData
      })

      clearInterval(progressInterval)
      setAnalysisProgress(100)

      if (!response.ok) {
        let errorMessage = 'Analysis failed'

        // Handle specific status codes
        if (response.status === 413) {
          errorMessage = 'Files too large. Please upload files smaller than 15MB each.'
        } else if (response.status === 429) {
          errorMessage = 'Too many requests. Please wait a moment and try again.'
        } else if (response.status === 500) {
          errorMessage = 'Server error. Please try again or contact support.'
        } else {
          try {
            const errorData = await response.json()
            errorMessage = errorData.error || errorMessage
          } catch (jsonError) {
            // If response is not JSON, try to get text
            try {
              const errorText = await response.text()
              console.log('Non-JSON error response:', errorText)

              if (errorText.includes('Request Entity Too Large') ||
                  errorText.includes('PayloadTooLargeError') ||
                  errorText.includes('413')) {
                errorMessage = 'Files too large. Please upload files smaller than 15MB each.'
              } else if (errorText.includes('404')) {
                errorMessage = 'Service not found. Please refresh the page and try again.'
              } else if (errorText.includes('timeout')) {
                errorMessage = 'Request timed out. Please try again with smaller files.'
              } else {
                errorMessage = `Server error (${response.status}): Please try again or contact support.`
              }
            } catch (textError) {
              console.error('Failed to parse error response:', textError)
              errorMessage = `Network error (${response.status}). Please check your connection and try again.`
            }
          }
        }
        throw new Error(errorMessage)
      }

      let analysisResult: AnalyzerResult
      try {
        analysisResult = await response.json()
      } catch (jsonError) {
        console.error('Failed to parse successful response as JSON:', jsonError)
        throw new Error('Received invalid response from server. Please try again.')
      }
      setResult(analysisResult)

    } catch (err) {
      console.error('Analysis error:', err)
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsAnalyzing(false)
      setAnalysisProgress(0)
    }
  }

  const handleDownloadGuidance = () => {
    if (!result) return

    const guidance = {
      phoneScripts: result.guidance.phoneScripts,
      appealLetters: result.guidance.appealLetters,
      nextActions: result.nextActions
    }

    const blob = new Blob([JSON.stringify(guidance, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wyng-guidance-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-50'
      case 'warn': return 'text-yellow-600 bg-yellow-50'
      case 'info': return 'text-blue-600 bg-blue-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return <AlertTriangle className="h-4 w-4" />
      case 'warn': return <AlertTriangle className="h-4 w-4" />
      case 'info': return <CheckCircle className="h-4 w-4" />
      default: return <CheckCircle className="h-4 w-4" />
    }
  }

  // Show email capture first
  if (!hasEmail) {
    return (
      <EmailCapture
        onSubmit={handleEmailSubmit}
      />
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          EOB & Medical Bill Analyzer
        </h1>
        <p className="text-lg text-gray-600">
          Upload your medical bills or EOBs for detailed analysis and guidance
        </p>
      </div>

      {/* File Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label
            htmlFor="file-upload"
            className={`block border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              isDragOver
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <Upload className={`mx-auto h-12 w-12 mb-4 ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`} />
            <div className="space-y-2">
              <p className="text-lg font-medium">
                {isDragOver ? 'Drop your files here' : 'Upload your medical documents'}
              </p>
              <p className="text-sm text-gray-500">
                Drag & drop or click anywhere to select • PDF, JPEG, PNG, WebP (max 15MB each)
              </p>
            </div>
            <div className="mt-4">
              <div className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                <Upload className="mr-2 h-4 w-4" />
                Choose Files
              </div>
            </div>
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
          </label>

          {/* Uploaded Files */}
          {files.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Uploaded Files:</h4>
              {files.map((fileObj, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <span className="text-sm font-medium">{fileObj.file.name}</span>
                    <span className="text-xs text-gray-500">
                      ({(fileObj.file.size / 1024 / 1024).toFixed(1)} MB)
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeFile(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Additional Details (Optional)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <Label htmlFor="description">Describe Your Situation</Label>
            <textarea
              id="description"
              className="w-full p-3 border rounded-md resize-none h-20"
              placeholder="Briefly describe your questions or concerns about this medical bill..."
              value={userDescription}
              onChange={(e) => setUserDescription(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Logged in as: {userEmail}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Optional Benefits Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Insurance Benefits (Optional)
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowBenefitsForm(!showBenefitsForm)}
            >
              {showBenefitsForm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showBenefitsForm ? 'Hide' : 'Add Benefits'}
            </Button>
          </CardTitle>
        </CardHeader>
        {showBenefitsForm && (
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600 mb-4">
              Adding your insurance benefits enables more accurate cost calculations and error detection.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="planType">Plan Type</Label>
                <select
                  id="planType"
                  className="w-full p-2 border rounded-md"
                  value={benefits.planType || ''}
                  onChange={(e) => setBenefits(prev => ({ ...prev, planType: e.target.value as any }))}
                >
                  <option value="">Select plan type</option>
                  <option value="HMO">HMO</option>
                  <option value="PPO">PPO</option>
                  <option value="EPO">EPO</option>
                  <option value="HDHP">High Deductible Health Plan</option>
                </select>
              </div>

              <div>
                <Label htmlFor="network">Network Status</Label>
                <select
                  id="network"
                  className="w-full p-2 border rounded-md"
                  value={benefits.network || ''}
                  onChange={(e) => setBenefits(prev => ({ ...prev, network: e.target.value as any }))}
                >
                  <option value="">Select network status</option>
                  <option value="IN">In-Network</option>
                  <option value="OUT">Out-of-Network</option>
                  <option value="Unknown">Unknown</option>
                </select>
              </div>

              <div>
                <Label htmlFor="deductible">Annual Deductible ($)</Label>
                <Input
                  id="deductible"
                  type="number"
                  placeholder="e.g., 1500"
                  value={benefits.deductible?.individual ? benefits.deductible.individual / 100 : ''}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0
                    setBenefits(prev => ({
                      ...prev,
                      deductible: {
                        ...prev.deductible,
                        individual: value * 100
                      }
                    }))
                  }}
                />
              </div>

              <div>
                <Label htmlFor="coinsurance">Coinsurance (%)</Label>
                <Input
                  id="coinsurance"
                  type="number"
                  placeholder="e.g., 20"
                  min="0"
                  max="100"
                  value={benefits.coinsurance || ''}
                  onChange={(e) => setBenefits(prev => ({ ...prev, coinsurance: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Analyze Button */}
      <div className="text-center">
        <Button
          onClick={handleAnalyze}
          disabled={isAnalyzing || files.length === 0}
          size="lg"
          className="w-full md:w-auto px-8 py-3"
        >
          {isAnalyzing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Analyzing...
            </>
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              Analyze Documents
            </>
          )}
        </Button>
      </div>

      {/* Progress Bar */}
      {isAnalyzing && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing documents...</span>
                <span>{analysisProgress}%</span>
              </div>
              <Progress value={analysisProgress} className="w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">Error:</span>
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Section */}
      {result && (
        <div className="space-y-6">
          {/* Email Gate Check */}
          {result.emailGate && !result.emailGate.emailOk && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <p className="text-yellow-800">{result.emailGate.message}</p>
                  {result.emailGate.redirectUrl && (
                    <Button
                      onClick={() => window.open(result.emailGate?.redirectUrl || '', '_blank')}
                      className="bg-yellow-600 hover:bg-yellow-700"
                    >
                      Learn About Full Wyng
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Analysis Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Analysis Summary</span>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>Confidence: {result.confidence.overall}%</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {result.detections.length}
                  </div>
                  <div className="text-sm text-gray-600">Issues Found</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {result.guidance.phoneScripts.length}
                  </div>
                  <div className="text-sm text-gray-600">Phone Scripts</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {result.guidance.appealLetters.length}
                  </div>
                  <div className="text-sm text-gray-600">Appeal Letters</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Priced Summary Table */}
          <Card>
            <CardHeader>
              <CardTitle>Detailed Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Header Information */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="font-medium text-gray-900">Provider</div>
                    <div className="text-gray-600">{result.pricedSummary.header.providerName || 'Not specified'}</div>
                    {result.pricedSummary.header.NPI && (
                      <div className="text-xs text-gray-500">NPI: {result.pricedSummary.header.NPI}</div>
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Service Dates</div>
                    <div className="text-gray-600">
                      {result.pricedSummary.header.serviceDates?.start || 'Not specified'}
                      {result.pricedSummary.header.serviceDates?.end &&
                        result.pricedSummary.header.serviceDates.end !== result.pricedSummary.header.serviceDates.start &&
                        ` to ${result.pricedSummary.header.serviceDates.end}`
                      }
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Insurance</div>
                    <div className="text-gray-600">{result.pricedSummary.header.payer || 'Not specified'}</div>
                    {result.pricedSummary.header.networkAssumption && (
                      <div className="text-xs text-gray-500">
                        Network: {result.pricedSummary.header.networkAssumption === 'IN' ? 'In-Network' :
                                  result.pricedSummary.header.networkAssumption === 'OUT' ? 'Out-of-Network' : 'Unknown'}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Claim Info</div>
                    <div className="text-gray-600">
                      {result.pricedSummary.header.claimId || result.pricedSummary.header.accountId || 'Not specified'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-lg font-bold text-blue-900">
                    ${((result.pricedSummary.totals.billed || 0) / 100).toFixed(2)}
                  </div>
                  <div className="text-xs text-blue-700">Total Billed</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-lg font-bold text-green-900">
                    ${((result.pricedSummary.totals.allowed || 0) / 100).toFixed(2)}
                  </div>
                  <div className="text-xs text-green-700">Allowed Amount</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-lg font-bold text-purple-900">
                    ${((result.pricedSummary.totals.planPaid || 0) / 100).toFixed(2)}
                  </div>
                  <div className="text-xs text-purple-700">Plan Paid</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-lg font-bold text-orange-900">
                    ${((result.pricedSummary.totals.patientResp || 0) / 100).toFixed(2)}
                  </div>
                  <div className="text-xs text-orange-700">Patient Responsibility</div>
                </div>
              </div>

              {/* Line Items Table - Mobile Responsive */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="text-left p-2 font-medium">Service</th>
                      <th className="text-left p-2 font-medium hidden md:table-cell">Date</th>
                      <th className="text-right p-2 font-medium">Charged</th>
                      <th className="text-right p-2 font-medium hidden sm:table-cell">Allowed</th>
                      <th className="text-right p-2 font-medium">Patient Resp.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.pricedSummary.lines.map((line, index) => (
                      <tr key={line.lineId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="p-2">
                          <div className="font-medium">{line.code?.value || 'N/A'}</div>
                          <div className="text-xs text-gray-600 max-w-xs truncate">
                            {line.description}
                          </div>
                          {line.modifiers && line.modifiers.length > 0 && (
                            <div className="text-xs text-blue-600">
                              Modifiers: {line.modifiers.join(', ')}
                            </div>
                          )}
                          {/* Mobile-only: Show date and allowed amount */}
                          <div className="md:hidden text-xs text-gray-500 mt-1">
                            {line.dos && `Date: ${line.dos}`}
                            {line.allowed && (
                              <span className="ml-2">
                                Allowed: ${((line.allowed) / 100).toFixed(2)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 hidden md:table-cell text-gray-600">
                          {line.dos || '-'}
                        </td>
                        <td className="p-2 text-right font-medium">
                          ${((line.charge || 0) / 100).toFixed(2)}
                        </td>
                        <td className="p-2 text-right hidden sm:table-cell">
                          {line.allowed ? `$${(line.allowed / 100).toFixed(2)}` : '-'}
                        </td>
                        <td className="p-2 text-right font-medium">
                          ${((line.patientResp || 0) / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary Notes */}
              {result.pricedSummary.notes && result.pricedSummary.notes.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Analysis Notes</h4>
                  <div className="space-y-1">
                    {result.pricedSummary.notes.map((note, index) => (
                      <div key={index} className="text-sm text-blue-800">{note}</div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detections */}
          {result.detections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Issues Detected</CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {result.detections.map((detection, index) => (
                    <AccordionItem key={detection.detectionId} value={`detection-${index}`}>
                      <AccordionTrigger className="text-left">
                        <div className="flex items-center gap-3">
                          <div className={`p-1 rounded-full ${getSeverityColor(detection.severity)}`}>
                            {getSeverityIcon(detection.severity)}
                          </div>
                          <div>
                            <div className="font-medium">{detection.category.replace('_', ' ')}</div>
                            <div className="text-sm text-gray-600 capitalize">{detection.severity} priority</div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pt-4">
                          <p className="text-gray-700">{detection.explanation}</p>

                          {detection.mathDelta && (
                            <div className="bg-blue-50 p-3 rounded-lg">
                              <h5 className="font-medium text-blue-900 mb-2">Amount Discrepancy</h5>
                              <div className="text-sm text-blue-800">
                                <div>Expected: ${(detection.mathDelta.expected! / 100).toFixed(2)}</div>
                                <div>Observed: ${(detection.mathDelta.observed! / 100).toFixed(2)}</div>
                                <div className="font-medium">
                                  Difference: ${(Math.abs((detection.mathDelta.observed! - detection.mathDelta.expected!) / 100)).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          )}

                          {detection.suggestedQuestions && detection.suggestedQuestions.length > 0 && (
                            <div>
                              <h5 className="font-medium mb-2">Questions to Ask:</h5>
                              <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                                {detection.suggestedQuestions.map((question, qIndex) => (
                                  <li key={qIndex}>{question}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {detection.policyCitations && detection.policyCitations.length > 0 && (
                            <div>
                              <h5 className="font-medium mb-2">Legal Authority & Citations:</h5>
                              <div className="space-y-2">
                                {detection.policyCitations.map((citation, cIndex) => (
                                  <div key={cIndex} className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                    <div className="font-medium text-blue-900 text-sm">{citation.title}</div>
                                    <div className="text-xs text-blue-700 mt-1">
                                      Authority: {citation.authority}
                                    </div>
                                    <div className="text-xs text-gray-700 mt-2 leading-relaxed">
                                      {citation.citation}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )}

          {/* Guidance - only show if email gate passed */}
          {(!result.emailGate || result.emailGate.emailOk) && (
            <>
              {/* Phone Scripts */}
              {result.guidance.phoneScripts.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Phone className="h-5 w-5" />
                      Phone Scripts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible className="w-full">
                      {result.guidance.phoneScripts.map((script, index) => (
                        <AccordionItem key={index} value={`script-${index}`}>
                          <AccordionTrigger>{script.title}</AccordionTrigger>
                          <AccordionContent>
                            <div className="bg-gray-50 p-4 rounded-lg">
                              <pre className="whitespace-pre-wrap text-sm">{script.body}</pre>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              )}

              {/* Appeal Letters */}
              {result.guidance.appealLetters.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Appeal Letters
                      </div>
                      <Button onClick={handleDownloadGuidance} size="sm" variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Download All
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible className="w-full">
                      {result.guidance.appealLetters.map((letter, index) => (
                        <AccordionItem key={index} value={`letter-${index}`}>
                          <AccordionTrigger>{letter.title}</AccordionTrigger>
                          <AccordionContent>
                            <div className="bg-gray-50 p-4 rounded-lg">
                              <pre className="whitespace-pre-wrap text-sm">{letter.body}</pre>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              )}

              {/* Next Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Next Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {result.nextActions.map((action, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="font-medium">{action.label}</div>
                          {action.dueDateISO && (
                            <div className="text-sm text-gray-600 mt-1">
                              Due: {new Date(action.dueDateISO).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Wyng Promotion */}
          <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <h3 className="text-xl font-bold text-gray-900">Want More Than Basic Analysis?</h3>
                <p className="text-gray-700">
                  This free analysis gives you a taste of what Wyng can do. Our full platform offers:
                </p>
                <div className="grid md:grid-cols-2 gap-3 text-sm text-gray-700">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Unlimited document analysis</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Real-time insurance verification</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Direct provider negotiations</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Automated appeals filing</span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    onClick={() => window.open('https://getwyng.co', '_blank')}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                  >
                    Get Full Wyng Access
                  </Button>
                  <Button
                    onClick={() => window.open('/api/donate?amount=25', '_blank')}
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                  >
                    Support Our Mission
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Compliance Footer */}
          <Card className="bg-gray-50">
            <CardContent className="pt-6">
              <div className="text-xs text-gray-600 space-y-1">
                {result.complianceFooters.map((footer, index) => (
                  <p key={index}>• {footer}</p>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}