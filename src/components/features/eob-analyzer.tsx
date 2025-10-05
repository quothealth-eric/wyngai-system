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

interface UploadedFile {
  file: File
  preview?: string
}

export function EOBAnalyzer() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [result, setResult] = useState<AnalyzerResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [benefits, setBenefits] = useState<Partial<BenefitsContext>>({})
  const [showBenefitsForm, setShowBenefitsForm] = useState(false)
  const [userDescription, setUserDescription] = useState('')

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = Array.from(event.target.files || [])

    const newFiles: UploadedFile[] = uploadedFiles.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    }))

    setFiles(prev => [...prev, ...newFiles])
    setError(null)
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

    if (!email.trim()) {
      setError('Please enter your email address')
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

      files.forEach((fileObj, index) => {
        formData.append(`file_${index}`, fileObj.file)
      })

      formData.append('email', email)
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
        const errorData = await response.json()
        throw new Error(errorData.error || 'Analysis failed')
      }

      const analysisResult: AnalyzerResult = await response.json()
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
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <div className="space-y-2">
              <p className="text-lg font-medium">Upload your medical documents</p>
              <p className="text-sm text-gray-500">
                Supported formats: PDF, JPEG, PNG, WebP (max 10MB each)
              </p>
            </div>
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="inline-block mt-4">
              <Button variant="outline">
                Choose Files
              </Button>
            </label>
          </div>

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

      {/* Email and Description */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Contact Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              placeholder="your.email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Required to download analysis results and guidance
            </p>
          </div>

          <div>
            <Label htmlFor="description">Describe Your Situation (Optional)</Label>
            <textarea
              id="description"
              className="w-full p-3 border rounded-md resize-none h-20"
              placeholder="Briefly describe your questions or concerns about this medical bill..."
              value={userDescription}
              onChange={(e) => setUserDescription(e.target.value)}
            />
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
          disabled={isAnalyzing || files.length === 0 || !email.trim()}
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
          {!result.emailGate.emailOk && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <p className="text-yellow-800">{result.emailGate.message}</p>
                  {result.emailGate.redirectUrl && (
                    <Button
                      onClick={() => window.open(result.emailGate.redirectUrl, '_blank')}
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
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )}

          {/* Guidance - only show if email gate passed */}
          {result.emailGate.emailOk && (
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
                          {action.dueDate && (
                            <div className="text-sm text-gray-600 mt-1">
                              Due: {new Date(action.dueDate).toLocaleDateString()}
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