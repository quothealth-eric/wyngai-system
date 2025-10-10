'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileUpload } from '@/components/features/file-upload'
import { BenefitsForm } from '@/components/features/benefits-form'
import { AnalysisResults } from '@/components/features/analysis-results'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { BenefitsData } from '@/lib/validations'
import { ArrowLeft, FileText, Heart, User, DollarSign, AlertTriangle } from 'lucide-react'

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
  const [analysisResults, setAnalysisResults] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

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
    setError(null)

    try {
      // Create a mock analysis result for demonstration
      // In production, this would call the actual API with uploaded files
      const mockAnalysisResults = {
        analysis: {
          header: {
            facility: "Sample Medical Center",
            patientName: "John Doe",
            patientRef: "PT123456",
            serviceDateStart: "2024-01-15",
            serviceDateEnd: "2024-01-15",
            mrn: "MRN789012",
            accountNumber: "ACC345678"
          },
          items: completedFiles.map((file, index) => ({
            page: 1,
            dos: "2024-01-15",
            code: `CPT${99213 + index}`,
            codeSystem: "CPT",
            description: `Medical service from ${file.name}`,
            modifiers: [],
            units: 1,
            charge: 150 + (index * 25),
            department: "OUTPATIENT",
            notes: null
          })),
          codesIndex: {},
          combinedQuery: `Analysis of ${completedFiles.length} uploaded documents. ${description || 'No additional description provided.'}`,
          findings: [
            {
              detectorId: 1,
              detectorName: "Duplicate Charges Detection",
              severity: "high" as const,
              affectedLines: [1, 2],
              rationale: "Found potential duplicate charges for similar services on the same date of service.",
              suggestedDocs: ["Request itemized bill", "Compare with EOB"],
              policyCitations: ["45 CFR §149.110"]
            },
            {
              detectorId: 6,
              detectorName: "NSA Ancillary Provider",
              severity: "warn" as const,
              affectedLines: [3],
              rationale: "Out-of-network ancillary provider at in-network facility may be subject to No Surprises Act protections.",
              suggestedDocs: ["Contact insurance", "Verify network status"],
              policyCitations: ["45 CFR §149.410", "42 U.S.C. §300gg-111"]
            }
          ],
          math: {
            sumOfLineCharges: completedFiles.reduce((sum, _, index) => sum + 150 + (index * 25), 0),
            lineCount: completedFiles.length,
            uniqueCodes: completedFiles.length,
            byDepartment: { "OUTPATIENT": completedFiles.length },
            notes: [`Processed ${completedFiles.length} documents`, "OCR confidence varies by document quality"]
          },
          report_md: `# Bill Analysis Report\n\nAnalyzed ${completedFiles.length} documents and found ${2} potential issues requiring attention.`
        },
        appeals: {
          appeals: {
            checklist: [
              "Review all identified billing violations",
              "Contact insurance company within 180 days",
              "Request itemized bill if not provided",
              "Document all communications",
              "Submit formal appeal if necessary"
            ],
            docRequests: [
              "Complete itemized bill",
              "Explanation of Benefits (EOB)",
              "Medical records for disputed services",
              "Insurance policy documentation"
            ],
            letters: {
              payer_appeal: {
                subject: "Formal Appeal for Billing Violations - Account " + completedFiles[0]?.name,
                body_md: `**Subject: Formal Appeal for Billing Violations**\n\nDear Insurance Review Team,\n\nI am writing to formally appeal billing violations identified in my recent medical bill analysis. Our review found potential duplicate charges and No Surprises Act violations that require immediate attention.\n\n**Issues Identified:**\n- Duplicate charges for similar services\n- Out-of-network ancillary provider billing\n\n**Requested Action:**\nPlease reprocess these claims in accordance with federal regulations and provide corrected billing.\n\nSincerely,\n[Your Name]`,
                citations: ["45 CFR §149.110", "45 CFR §149.410"]
              },
              provider_dispute: {
                subject: "Billing Dispute - Potential Violations",
                body_md: `**Subject: Billing Dispute - Potential Violations**\n\nDear Billing Department,\n\nI am disputing charges on my recent bill due to identified billing violations including duplicate charges and potential No Surprises Act issues.\n\nPlease review and provide corrected billing in accordance with applicable regulations.\n\nThank you,\n[Your Name]`,
                citations: ["45 CFR §149.410"]
              },
              state_doi_complaint: {
                subject: "Consumer Complaint - Billing Violations",
                body_md: `**Subject: Consumer Complaint - Billing Violations**\n\nDear State Insurance Department,\n\nI am filing a complaint regarding billing violations that may violate state and federal regulations. Please investigate the attached documentation.\n\nRespectfully,\n[Your Name]`,
                citations: ["State insurance regulations"]
              }
            },
            phone_scripts: {
              insurer: `Hi, I'm calling about my recent medical bill that shows potential violations of the No Surprises Act. I have an analysis that identified duplicate charges and out-of-network billing issues. Can you please review claim [CLAIM_NUMBER] and reprocess according to federal regulations? I'd like to request a supervisor if needed.`,
              provider: `Hello, I'm calling about billing issues on my account [ACCOUNT_NUMBER]. My bill analysis found duplicate charges and potential No Surprises Act violations. Can you please review these charges and provide a corrected bill? I may need to speak with a billing supervisor.`,
              state_doi: `Hi, I need to file a complaint about potential billing violations that may violate state insurance regulations. I have documentation of duplicate charges and No Surprises Act issues. Can you please direct me to the appropriate complaint process?`
            }
          }
        },
        metadata: {
          anthropicAvailable: true,
          openaiAvailable: true,
          selectedProvider: "anthropic",
          filesProcessed: completedFiles.length,
          contextProvided: !!description || Object.keys(benefits).length > 0
        }
      }

      console.log('🚀 Analysis complete:', {
        files: completedFiles.length,
        issues: mockAnalysisResults.analysis.findings.length,
        provider: mockAnalysisResults.metadata.selectedProvider
      })

      setAnalysisResults(mockAnalysisResults)
    } catch (error) {
      console.error('Analysis failed:', error)
      setError('Analysis failed. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const canAnalyze = uploadedFiles.some(f => f.status === 'completed') && !isAnalyzing

  const handleBackToUpload = () => {
    setAnalysisResults(null)
    setError(null)
  }

  if (analysisResults) {
    return (
      <AnalysisResults
        results={analysisResults}
        onBack={handleBackToUpload}
      />
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
            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-medium">Analysis Error</span>
                </div>
                <p className="text-red-700 mt-1">{error}</p>
              </div>
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