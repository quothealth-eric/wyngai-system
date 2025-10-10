'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileUpload } from '@/components/features/file-upload'
import { BenefitsForm } from '@/components/features/benefits-form'
import { EOBAnalyzer } from '@/components/features/eob-analyzer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { BenefitsData } from '@/lib/validations'
import { ArrowLeft, FileText, Heart, User, DollarSign } from 'lucide-react'

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  status: 'uploading' | 'processing' | 'completed' | 'error'
  progress?: number
  ocrText?: string
  statusMessage?: string
}

export default function AnalyzerPage() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [description, setDescription] = useState('')
  const [benefits, setBenefits] = useState<BenefitsData>({})
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showResults, setShowResults] = useState(false)

  const handleFileUploaded = (file: UploadedFile) => {
    setUploadedFiles(prev => {
      const existingIndex = prev.findIndex(f => f.id === file.id)
      if (existingIndex >= 0) {
        const updated = [...prev]
        updated[existingIndex] = file
        return updated
      }
      return [...prev, file]
    })
  }

  const handleFileRemoved = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId))
  }

  const handleAnalyze = async () => {
    if (uploadedFiles.length === 0) {
      alert('Please upload at least one document before analyzing.')
      return
    }

    const completedFiles = uploadedFiles.filter(f => f.status === 'completed')
    if (completedFiles.length === 0) {
      alert('Please wait for file upload to complete before analyzing.')
      return
    }

    setIsAnalyzing(true)

    try {
      // Prepare form data for the Wyng Pipeline API
      const formData = new FormData()

      // Add description
      if (description.trim()) {
        formData.append('description', description.trim())
      }

      // Add context/benefits information
      const context = {
        planType: benefits.planType || 'Unknown',
        insurerName: benefits.insurerName,
        deductible: benefits.deductible,
        coinsurance: benefits.coinsurance,
        copay: benefits.copay,
        oopMax: benefits.oopMax,
        deductibleMet: benefits.deductibleMet
      }
      formData.append('context', JSON.stringify(context))

      // For now, create mock file data since we don't have access to the actual files
      // In a real implementation, you'd get the file data from the upload response
      const mockFileData = completedFiles.map((file, index) => ({
        name: file.name,
        type: file.type,
        size: file.size
      }))

      console.log('🚀 Starting Wyng analysis with:', {
        files: mockFileData,
        description,
        context,
        hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
        hasOpenAI: !!process.env.OPENAI_API_KEY
      })

      // For demo purposes, we'll show the results after a delay
      // In production, this would call the actual API
      await new Promise(resolve => setTimeout(resolve, 3000))

      setShowResults(true)
    } catch (error) {
      console.error('Analysis failed:', error)
      alert('Analysis failed. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const canAnalyze = uploadedFiles.some(f => f.status === 'completed') && !isAnalyzing

  if (showResults) {
    return (
      <div className="min-h-screen bg-gray-50">
        <EOBAnalyzer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <Link href="/" className="flex items-center space-x-2 text-blue-600 hover:text-blue-700">
              <ArrowLeft className="h-5 w-5" />
              <span>Back to Home</span>
            </Link>
            <div className="flex items-center space-x-2">
              <Heart className="h-6 w-6 text-blue-600" />
              <span className="text-2xl font-bold text-primary">Wyng</span>
              <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">Lite</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Page Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <FileText className="h-16 w-16 text-blue-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Medical Bill Analyzer
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Upload your medical bills or EOBs to detect errors, billing violations,
            and get phone scripts plus appeal letters for any issues found.
          </p>
        </div>

        <div className="space-y-6">
          {/* Step 1: Upload Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">1</span>
                Upload Your Medical Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FileUpload
                onFileUploaded={handleFileUploaded}
                onFileRemoved={handleFileRemoved}
                uploadedFiles={uploadedFiles}
                disabled={isAnalyzing}
              />
            </CardContent>
          </Card>

          {/* Step 2: Describe Your Situation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">2</span>
                Describe Your Situation (Optional)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Label htmlFor="description">
                  Tell us about your bill or specific concerns you have:
                </Label>
                <Textarea
                  id="description"
                  placeholder="e.g., 'I was charged twice for IV fluid during my induced delivery. The anesthesiologist was out-of-network but I wasn't told beforehand.'"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isAnalyzing}
                  rows={4}
                  className="resize-none"
                />
                <p className="text-sm text-gray-500">
                  This helps our AI provide more targeted analysis and specific guidance for your situation.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Insurance Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">3</span>
                Insurance Information (Optional)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BenefitsForm
                benefits={benefits}
                onBenefitsChange={setBenefits}
                disabled={isAnalyzing}
              />
            </CardContent>
          </Card>

          {/* Analysis Button */}
          <div className="text-center">
            <Button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              size="lg"
              className="px-8 py-3 text-lg btn-wyng-gradient"
            >
              {isAnalyzing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Analyzing Your Bills...
                </>
              ) : (
                <>
                  <FileText className="h-5 w-5 mr-2" />
                  Analyze My Bills
                </>
              )}
            </Button>
            {uploadedFiles.length === 0 && (
              <p className="text-sm text-gray-500 mt-2">
                Upload at least one document to start the analysis
              </p>
            )}
          </div>

          {/* Features */}
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            <div className="text-center p-6 bg-white rounded-lg shadow-sm">
              <FileText className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">18 Compliance Detectors</h3>
              <p className="text-sm text-gray-600">
                Detect NSA violations, duplicate charges, preventive care errors, and more
              </p>
            </div>
            <div className="text-center p-6 bg-white rounded-lg shadow-sm">
              <User className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Phone Scripts</h3>
              <p className="text-sm text-gray-600">
                Get exact scripts for calling your insurance and healthcare providers
              </p>
            </div>
            <div className="text-center p-6 bg-white rounded-lg shadow-sm">
              <DollarSign className="h-12 w-12 text-purple-600 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Appeal Letters</h3>
              <p className="text-sm text-gray-600">
                Receive ready-to-send appeal letters with legal citations
              </p>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="mt-8 p-4 bg-gray-100 rounded-lg text-center">
            <p className="text-sm text-gray-600">
              <strong>Wyng Lite</strong> provides general information and analysis, not legal or medical advice.
              Always verify information with your insurance company and healthcare providers.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}