'use client'

import { useState, useEffect } from 'react'
import { Upload, FileText, AlertTriangle, CheckCircle, Phone, Download, DollarSign, Calendar, User, Building, CreditCard, Eye, EyeOff } from 'lucide-react'
import { useCaseGuard } from '@/lib/ui-case-guard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

interface AnalyzerResult {
  documentMeta: Array<{
    artifactId: string;
    docType: string;
    providerName?: string;
    providerNPI?: string;
    payer?: string;
    claimId?: string;
    accountId?: string;
    serviceDates?: { start: string; end?: string };
    totals?: {
      billed?: number;
      allowed?: number;
      planPaid?: number;
      patientResp?: number;
    };
  }>;
  lineItems: Array<{
    lineId: string;
    artifactId: string;
    description?: string;
    code?: string;
    modifiers?: string[];
    units?: number;
    revCode?: string;
    pos?: string;
    npi?: string;
    dos?: string;
    charge?: number;
    allowed?: number;
    planPaid?: number;
    patientResp?: number;
    note?: string; // For unstructured_row flagging
    ocr?: { page: number; bbox?: [number, number, number, number]; conf?: number };
  }>;
  pricedSummary: {
    header: {
      providerName?: string;
      NPI?: string;
      claimId?: string;
      accountId?: string;
      serviceDates?: { start: string; end?: string };
      payer?: string;
    };
    totals: {
      billed?: number;
      allowed?: number;
      planPaid?: number;
      patientResp?: number;
    };
    lines: Array<{
      lineId: string;
      code?: string;
      modifiers?: string[];
      description?: string;
      units?: number;
      dos?: string;
      pos?: string;
      revCode?: string;
      npi?: string;
      charge?: number;
      allowed?: number;
      planPaid?: number;
      patientResp?: number;
      note?: string; // For unstructured_row flagging
      ocr?: { page: number; bbox?: [number, number, number, number]; conf?: number };
    }>;
    notes?: string[];
  };
  detections: Array<{
    detectionId: string;
    category: string;
    severity: 'info' | 'warn' | 'high';
    explanation: string;
    evidence: {
      lineRefs?: string[];
      snippets?: string[];
      pageRefs?: number[];
    };
    suggestedQuestions?: string[];
    policyCitations?: Array<{
      title: string;
      authority: string;
      citation: string;
    }>;
  }>;
  complianceFooters: string[];
  confidence: {
    overall: number;
    sections?: { [k: string]: number };
  };
}

export function EOBAnalyzer() {
  const [file, setFile] = useState<File | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [result, setResult] = useState<AnalyzerResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null)
  const [showProofOverlays, setShowProofOverlays] = useState(false)
  const [selectedLineForProof, setSelectedLineForProof] = useState<string | null>(null)

  // Use case guard for strict isolation
  const caseGuard = useCaseGuard()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      // Clear previous case state when new file is selected
      caseGuard.clearCurrentCase()
      setFile(selectedFile)
      setResult(null)
      setError(null)
      setCurrentCaseId(null)
    }
  }

  const simulateProgress = () => {
    setAnalysisProgress(0)
    const steps = [
      { progress: 20, message: 'Uploading document...' },
      { progress: 40, message: 'Processing OCR...' },
      { progress: 60, message: 'Extracting line items...' },
      { progress: 80, message: 'Running detection rules...' },
      { progress: 100, message: 'Finalizing analysis...' }
    ]

    steps.forEach((step, index) => {
      setTimeout(() => {
        setAnalysisProgress(step.progress)
      }, (index + 1) * 1000)
    })
  }

  const handleAnalyze = async () => {
    if (!file) return

    setIsAnalyzing(true)
    setError(null)
    simulateProgress()

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/analyzer/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Analysis failed')
      }

      const data = await response.json()

      if (data.success) {
        // Case binding validation
        if (!data.caseId || !data.document?.artifactDigest) {
          throw new Error('Invalid response: missing case binding data')
        }

        // Block stale results
        if (caseGuard.shouldBlockRender(data)) {
          console.warn('Blocking stale analysis results')
          return
        }

        // Validate and set results with case correlation
        const isValid = caseGuard.setResults(
          data.caseId,
          data.document.artifactDigest,
          data
        )

        if (!isValid) {
          throw new Error('Analysis results failed validation - possible case mixup')
        }

        setCurrentCaseId(data.caseId)
        // Transform the API response to match our interface
        const transformedResult: AnalyzerResult = {
          documentMeta: [{
            artifactId: 'doc_1',
            docType: data.document.type,
            providerName: data.tables?.provider?.name,
            payer: data.tables?.provider?.payer
          }],
          lineItems: data.tables?.lineItems?.rows?.map((row: any, index: number) => ({
            lineId: `line_${index}`,
            artifactId: 'doc_1',
            description: row.cells?.description?.value,
            code: row.cells?.code?.value,
            charge: row.cells?.amount?.value,
            dos: row.cells?.serviceDate?.value
          })) || [],
          pricedSummary: {
            header: {
              providerName: data.tables?.provider?.name,
              payer: data.tables?.provider?.payer
            },
            totals: {
              billed: data.extraction?.totalCharges || 0,
              patientResp: 0
            },
            lines: data.tables?.lineItems?.rows?.map((row: any, index: number) => ({
              lineId: `line_${index}`,
              code: row.cells?.code?.value,
              description: row.cells?.description?.value,
              charge: row.cells?.amount?.value,
              dos: row.cells?.serviceDate?.value
            })) || []
          },
          detections: data.tables?.detections?.topDetections?.map((detection: any) => ({
            detectionId: detection.id || 'unknown',
            category: detection.category || 'GENERAL',
            severity: detection.severity?.toLowerCase() || 'info',
            explanation: detection.message || 'No explanation provided',
            evidence: {
              snippets: [detection.description || '']
            },
            suggestedQuestions: []
          })) || [],
          complianceFooters: [
            'This analysis is for informational purposes only and does not constitute medical or legal advice.',
            'Results are based on automated processing and should be verified by qualified professionals.',
            'Wyng Lite provides basic analysis. For comprehensive review, consider full Wyng service.'
          ],
          confidence: {
            overall: data.document?.confidence || 0.8
          }
        }

        setResult(transformedResult)
      } else {
        throw new Error(data.error || 'Analysis failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsAnalyzing(false)
      setAnalysisProgress(0)
    }
  }

  const handleDownloadGuidance = () => {
    if (!result) return

    const guidance = {
      detections: result.detections || [],
      lineItems: result.lineItems || [],
      pricedSummary: result.pricedSummary,
      confidence: result.confidence
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

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100)
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Free Medical Bill Analyzer</h1>
        <p className="text-gray-600">
          Upload your medical bills for instant analysis. Identify billing errors, understand your charges, and get actionable guidance.
        </p>
      </div>

      {/* Upload Section */}
      {!result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Your Medical Document
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center space-y-4">
              <FileText className="h-16 w-16 text-gray-400 mx-auto" />
              <div>
                <p className="text-lg font-medium text-gray-900">Drop your file here or click to browse</p>
                <p className="text-sm text-gray-600">Supports PDF, PNG, JPG, TIFF files up to 10MB</p>
              </div>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.tiff"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            {file && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div className="flex-1">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-gray-600">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>

                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="w-full"
                  size="lg"
                >
                  {isAnalyzing ? 'Analyzing...' : 'Start Analysis'}
                </Button>
              </div>
            )}

            {isAnalyzing && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Processing your document...</span>
                  <span>{analysisProgress}%</span>
                </div>
                <Progress value={analysisProgress} className="w-full" />
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-medium">Analysis Failed</span>
                </div>
                <p className="text-red-700 mt-1">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results Section */}
      {result && (
        <div className="space-y-6">
          {/* Analysis Complete */}

          {/* Analysis Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Analysis Summary</span>
                <Button onClick={() => setResult(null)} variant="outline" size="sm">
                  Analyze Another Document
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {result.detections.filter(d => d.severity === 'high').length}
                  </div>
                  <div className="text-sm text-gray-600">Issues Found</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    0
                  </div>
                  <div className="text-sm text-gray-600">Phone Scripts</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    0
                  </div>
                  <div className="text-sm text-gray-600">Appeal Letters</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">
                    {Math.round(result.confidence.overall * 100)}%
                  </div>
                  <div className="text-sm text-gray-600">Confidence</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Document Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Document Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <div className="font-medium text-gray-900">Provider</div>
                  <div className="text-gray-600">{result.pricedSummary.header.providerName || 'Not specified'}</div>
                </div>
                <div>
                  <div className="font-medium text-gray-900">Insurance</div>
                  <div className="text-gray-600">{result.pricedSummary.header.payer || 'Not specified'}</div>
                </div>
                <div>
                  <div className="font-medium text-gray-900">Claim Info</div>
                  <div className="text-gray-600">
                    {result.pricedSummary.header.claimId || result.pricedSummary.header.accountId || 'Not specified'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Financial Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Financial Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-lg font-bold text-gray-900">
                    {formatCurrency(result.pricedSummary.totals.billed || 0)}
                  </div>
                  <div className="text-sm text-gray-600">Total Billed</div>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-lg font-bold text-gray-900">
                    {formatCurrency(result.pricedSummary.totals.allowed || 0)}
                  </div>
                  <div className="text-sm text-gray-600">Allowed Amount</div>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-lg font-bold text-gray-900">
                    {formatCurrency(result.pricedSummary.totals.planPaid || 0)}
                  </div>
                  <div className="text-sm text-gray-600">Insurance Paid</div>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-lg font-bold text-red-600">
                    {formatCurrency(result.pricedSummary.totals.patientResp || 0)}
                  </div>
                  <div className="text-sm text-gray-600">Patient Responsibility</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          {result.pricedSummary.lines.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Service Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div className="mb-4 flex justify-between items-center">
                    <div className="text-sm text-gray-600">
                      {result.pricedSummary.lines.length} line items extracted
                    </div>
                    <button
                      onClick={() => setShowProofOverlays(!showProofOverlays)}
                      className="flex items-center gap-2 px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg"
                    >
                      {showProofOverlays ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {showProofOverlays ? 'Hide' : 'Show'} proof
                    </button>
                  </div>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border p-2 text-left">Code & Description</th>
                        <th className="border p-2 text-left">Date</th>
                        <th className="border p-2 text-right">Billed</th>
                        <th className="border p-2 text-right">Allowed</th>
                        <th className="border p-2 text-right">Insurance Paid</th>
                        <th className="border p-2 text-right">Patient Owes</th>
                        {showProofOverlays && <th className="border p-2 text-center">Proof</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {result.pricedSummary.lines.map((line, index) => (
                        <tr key={line.lineId} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${line.note === 'unstructured_row' ? 'border-l-4 border-l-yellow-400' : ''}`}>
                          <td className="border p-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {line.code || '—'}
                                  </span>
                                  {line.note === 'unstructured_row' && (
                                    <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">
                                      Unstructured row (no code detected)
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-600 max-w-xs truncate">
                                  {line.description}
                                </div>
                                {line.modifiers && line.modifiers.length > 0 && (
                                  <div className="text-xs text-blue-600">
                                    Modifiers: {line.modifiers.join(', ')}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="border p-2 text-sm">
                            {line.dos ? new Date(line.dos).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="border p-2 text-right">
                            {formatCurrency(line.charge || 0)}
                          </td>
                          <td className="border p-2 text-right">
                            {line.note === 'unstructured_row' ? '—' : formatCurrency(line.allowed || 0)}
                          </td>
                          <td className="border p-2 text-right">
                            {line.note === 'unstructured_row' ? '—' : formatCurrency(line.planPaid || 0)}
                          </td>
                          <td className="border p-2 text-right">
                            {line.note === 'unstructured_row' ? '—' : formatCurrency(line.patientResp || 0)}
                          </td>
                          {showProofOverlays && (
                            <td className="border p-2 text-center">
                              {line.ocr ? (
                                <button
                                  onClick={() => setSelectedLineForProof(selectedLineForProof === line.lineId ? null : line.lineId)}
                                  className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded"
                                >
                                  {selectedLineForProof === line.lineId ? 'Hide' : 'Show'} region
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">No OCR data</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Proof overlay information */}
                  {showProofOverlays && selectedLineForProof && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      {(() => {
                        const selectedLine = result.pricedSummary.lines.find(l => l.lineId === selectedLineForProof);
                        return selectedLine?.ocr ? (
                          <div>
                            <h4 className="font-medium text-blue-900 mb-2">OCR Provenance</h4>
                            <div className="text-sm text-blue-800 space-y-1">
                              <div>Page: {selectedLine.ocr.page}</div>
                              {selectedLine.ocr.bbox && (
                                <div>Region: [{selectedLine.ocr.bbox.join(', ')}]</div>
                              )}
                              {selectedLine.ocr.conf && (
                                <div>Confidence: {Math.round(selectedLine.ocr.conf * 100)}%</div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-600">No OCR provenance data available for this line.</div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detections */}
          {result.detections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Potential Issues Found ({result.detections.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {result.detections.map((detection, index) => (
                    <AccordionItem key={detection.detectionId} value={`detection-${index}`}>
                      <AccordionTrigger>
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(detection.severity)}`}>
                              {detection.severity.toUpperCase()}
                            </span>
                            <span className="font-medium">{detection.category}</span>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pt-4">
                          <p className="text-gray-700">{detection.explanation}</p>


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
                              <h5 className="font-medium mb-2">Policy References:</h5>
                              <div className="space-y-2">
                                {detection.policyCitations.map((citation, cIndex) => (
                                  <div key={cIndex} className="text-sm bg-gray-50 p-3 rounded-lg">
                                    <div className="font-medium">{citation.title}</div>
                                    <div className="text-gray-600">{citation.authority}: {citation.citation}</div>
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

          {/* Analysis Complete */}
          <Card>
            <CardHeader>
              <CardTitle>Analysis Complete</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Your document has been analyzed successfully. Review the detections above for any issues found.</p>
              <Button onClick={handleDownloadGuidance} className="mt-4">
                <Download className="h-4 w-4 mr-2" />
                Download Analysis Report
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}