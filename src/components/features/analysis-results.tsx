'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  FileText,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Phone,
  Mail,
  Download,
  ArrowLeft,
  Clock,
  Building,
  User
} from 'lucide-react'

interface AnalysisResults {
  analysis: {
    header: any
    items: any[]
    codesIndex: Record<string, any>
    combinedQuery: string
    findings: Array<{
      detectorId: number
      detectorName: string
      severity: 'info' | 'warn' | 'high'
      affectedLines: number[]
      rationale: string
      suggestedDocs: string[]
      policyCitations: string[]
    }>
    math: {
      sumOfLineCharges: number | null
      lineCount: number
      uniqueCodes: number
      byDepartment: Record<string, number>
      notes: string[]
    }
    report_md: string
  }
  appeals: {
    appeals: {
      checklist: string[]
      docRequests: string[]
      letters: {
        payer_appeal: { subject: string; body_md: string; citations: string[] }
        provider_dispute: { subject: string; body_md: string; citations: string[] }
        state_doi_complaint: { subject: string; body_md: string; citations: string[] }
      }
      phone_scripts: {
        insurer: string
        provider: string
        state_doi: string
      }
    }
  }
  metadata: {
    anthropicAvailable: boolean
    openaiAvailable: boolean
    selectedProvider: string
    filesProcessed: number
    contextProvided: boolean
  }
}

interface AnalysisResultsProps {
  results: AnalysisResults
  onBack: () => void
}

export function AnalysisResults({ results, onBack }: AnalysisResultsProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'findings' | 'appeals' | 'scripts'>('overview')

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200'
      case 'warn': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'info': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const highSeverityFindings = results.analysis.findings.filter(f => f.severity === 'high')
  const warnSeverityFindings = results.analysis.findings.filter(f => f.severity === 'warn')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={onBack} className="flex items-center space-x-2">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Upload</span>
            </Button>
            <div className="flex items-center space-x-2">
              <FileText className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-bold">Analysis Results</span>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Clock className="h-4 w-4" />
            <span>Analyzed by {results.metadata.selectedProvider}</span>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{highSeverityFindings.length}</div>
              <div className="text-sm text-gray-600">Critical Issues</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">{warnSeverityFindings.length}</div>
              <div className="text-sm text-gray-600">Warnings</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{results.analysis.items.length}</div>
              <div className="text-sm text-gray-600">Line Items</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(results.analysis.math.sumOfLineCharges)}
              </div>
              <div className="text-sm text-gray-600">Total Charges</div>
            </CardContent>
          </Card>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg">
          {[
            { id: 'overview', label: 'Overview', icon: FileText },
            { id: 'findings', label: 'Issues Found', icon: AlertTriangle },
            { id: 'appeals', label: 'Appeal Letters', icon: Mail },
            { id: 'scripts', label: 'Phone Scripts', icon: Phone }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Document Info */}
            <Card>
              <CardHeader>
                <CardTitle>Document Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="font-medium">Provider</div>
                    <div className="text-gray-600">{results.analysis.header.facility || 'Not specified'}</div>
                  </div>
                  <div>
                    <div className="font-medium">Patient</div>
                    <div className="text-gray-600">{results.analysis.header.patientName || 'Not specified'}</div>
                  </div>
                  <div>
                    <div className="font-medium">Service Date</div>
                    <div className="text-gray-600">{results.analysis.header.serviceDateStart || 'Not specified'}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Line Items */}
            <Card>
              <CardHeader>
                <CardTitle>Billing Line Items ({results.analysis.items.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Code</th>
                        <th className="text-left py-2">Description</th>
                        <th className="text-right py-2">Units</th>
                        <th className="text-right py-2">Charge</th>
                        <th className="text-left py-2">Department</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.analysis.items.slice(0, 10).map((item, index) => (
                        <tr key={index} className="border-b">
                          <td className="py-2 font-mono text-sm">{item.code || '—'}</td>
                          <td className="py-2">{item.description || '—'}</td>
                          <td className="py-2 text-right">{item.units || 1}</td>
                          <td className="py-2 text-right">{formatCurrency(item.charge)}</td>
                          <td className="py-2">{item.department || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {results.analysis.items.length > 10 && (
                    <div className="text-center py-4 text-gray-500">
                      Showing 10 of {results.analysis.items.length} items
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'findings' && (
          <div className="space-y-4">
            {results.analysis.findings.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Issues Found</h3>
                  <p className="text-gray-600">Your bill appears to be clean with no billing violations detected.</p>
                </CardContent>
              </Card>
            ) : (
              <Accordion type="single" collapsible className="space-y-2">
                {results.analysis.findings.map((finding, index) => (
                  <AccordionItem key={index} value={`finding-${index}`}>
                    <Card>
                      <AccordionTrigger className="px-6 py-4 hover:no-underline">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center space-x-3">
                            <Badge className={getSeverityColor(finding.severity)}>
                              {finding.severity.toUpperCase()}
                            </Badge>
                            <span className="font-medium">{finding.detectorName}</span>
                          </div>
                          <div className="text-sm text-gray-500">
                            Detector #{finding.detectorId}
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="px-6 pb-4 space-y-4">
                          <p className="text-gray-700">{finding.rationale}</p>

                          {finding.affectedLines.length > 0 && (
                            <div>
                              <h5 className="font-medium mb-2">Affected Line Items:</h5>
                              <div className="text-sm text-gray-600">
                                Lines: {finding.affectedLines.join(', ')}
                              </div>
                            </div>
                          )}

                          {finding.suggestedDocs.length > 0 && (
                            <div>
                              <h5 className="font-medium mb-2">Suggested Documentation:</h5>
                              <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                                {finding.suggestedDocs.map((doc, i) => (
                                  <li key={i}>{doc}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {finding.policyCitations.length > 0 && (
                            <div>
                              <h5 className="font-medium mb-2">Legal Citations:</h5>
                              <div className="space-y-2">
                                {finding.policyCitations.map((citation, i) => (
                                  <div key={i} className="text-xs bg-gray-50 p-2 rounded">
                                    {citation}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </Card>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
        )}

        {activeTab === 'appeals' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Appeal Letters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(results.appeals.appeals.letters).map(([type, letter]) => (
                  <div key={type} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium capitalize">{type.replace('_', ' ')}</h4>
                      <Button size="sm" variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </div>
                    <div className="text-sm text-gray-600 mb-2">{letter.subject}</div>
                    <div className="text-sm bg-gray-50 p-3 rounded max-h-40 overflow-y-auto">
                      {letter.body_md}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'scripts' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Phone Scripts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(results.appeals.appeals.phone_scripts).map(([type, script]) => (
                  <div key={type} className="border rounded-lg p-4">
                    <h4 className="font-medium capitalize mb-2">{type} Script</h4>
                    <div className="text-sm bg-gray-50 p-3 rounded whitespace-pre-wrap">
                      {script}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}