'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowLeft, Download, FileText, Mail, Calendar, User,
  Shield, AlertCircle, CheckCircle, Clock, Play
} from '@/components/ui/icons'
import Image from 'next/image'

interface CaseDetail {
  case_id: string
  created_at: string
  status: string
  submit_email: string | null
  user_ip: string | null
  user_agent: string | null
  description: string | null
  insurance: any
  files: Array<{
    id: string
    filename: string
    mime: string
    size_bytes: number
    storage_path: string
    uploaded_at: string
  }>
  detections: Array<{
    rule_key: string
    severity: string
    explanation: string
    evidence: any
    created_at: string
  }>
  extractions: Array<{
    page: number
    code: string
    description: string
    charge_cents: number
    created_at: string
  }>
}

export default function CaseDetailPage({ params }: { params: { caseId: string } }) {
  const router = useRouter()
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null)

  const fetchCaseDetail = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/cases/${params.caseId}`)
      if (!response.ok) {
        if (response.status === 401) {
          // Browser will handle Basic Auth prompt
          return
        }
        throw new Error('Failed to fetch case details')
      }
      const data = await response.json()
      setCaseDetail(data.case)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load case details')
    } finally {
      setLoading(false)
    }
  }, [params.caseId])

  useEffect(() => {
    fetchCaseDetail()
  }, [fetchCaseDetail])

  const downloadFile = async (fileId: string, filename: string) => {
    setDownloadingFile(fileId)
    try {
      const response = await fetch(`/api/admin/files/${fileId}/download`)
      if (!response.ok) {
        throw new Error('Download failed')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      alert('Download failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setDownloadingFile(null)
    }
  }

  const downloadAllFiles = async () => {
    if (!caseDetail?.files.length) return

    setProcessing(true)
    try {
      const response = await fetch(`/api/admin/cases/${params.caseId}/download-all`)
      if (!response.ok) {
        throw new Error('Download failed')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `case-${params.caseId}-packet.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      alert('Download failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setProcessing(false)
    }
  }

  const runOcrAnalysis = async () => {
    setProcessing(true)
    try {
      const response = await fetch(`/api/admin/cases/${params.caseId}/analyze`, {
        method: 'POST'
      })
      if (!response.ok) {
        throw new Error('Analysis failed')
      }

      // Refresh case details to show new data
      await fetchCaseDetail()
      alert('Analysis completed successfully!')
    } catch (err) {
      alert('Analysis failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setProcessing(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted': return 'bg-blue-100 text-blue-800'
      case 'processing': return 'bg-yellow-100 text-yellow-800'
      case 'ready': return 'bg-green-100 text-green-800'
      case 'emailed': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted': return <Clock className="h-4 w-4" />
      case 'processing': return <AlertCircle className="h-4 w-4" />
      case 'ready': return <CheckCircle className="h-4 w-4" />
      case 'emailed': return <Mail className="h-4 w-4" />
      default: return <FileText className="h-4 w-4" />
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full mx-auto mb-4"></div>
          <p>Loading case details...</p>
        </div>
      </div>
    )
  }

  if (error || !caseDetail) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex items-center">
            <Link href="/admin" className="mr-4">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Cases
              </Button>
            </Link>
            <div className="flex items-center space-x-2">
              <Image src="/images/wyng-logo.svg" alt="Wyng" width={24} height={24} />
              <span className="text-xl font-bold text-primary">Wyng Admin</span>
            </div>
          </div>
        </header>
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
              <span className="text-red-700">{error || 'Case not found'}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <Link href="/admin">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Cases
              </Button>
            </Link>
            <div className="flex items-center space-x-2">
              <Image src="/images/wyng-logo.svg" alt="Wyng" width={24} height={24} />
              <span className="text-xl font-bold text-primary">Wyng Admin</span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Badge className={getStatusColor(caseDetail.status)}>
              <div className="flex items-center space-x-1">
                {getStatusIcon(caseDetail.status)}
                <span className="capitalize">{caseDetail.status}</span>
              </div>
            </Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Case Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Case Details
          </h1>
          <p className="text-gray-600">
            Case ID: {caseDetail.case_id}
          </p>
          <p className="text-sm text-gray-500">
            Created: {formatDate(caseDetail.created_at)}
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* User Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <User className="h-5 w-5" />
                  <span>User Information</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium">Email:</span>
                    </div>
                    <p className="text-sm text-gray-600 ml-6">
                      {caseDetail.submit_email || 'Not provided'}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium">Submitted:</span>
                    </div>
                    <p className="text-sm text-gray-600 ml-6">
                      {formatDate(caseDetail.created_at)}
                    </p>
                  </div>
                  {caseDetail.user_ip && (
                    <div>
                      <div className="flex items-center space-x-2">
                        <Shield className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium">IP Address:</span>
                      </div>
                      <p className="text-sm text-gray-600 ml-6">{caseDetail.user_ip}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Problem Description */}
            {caseDetail.description && (
              <Card>
                <CardHeader>
                  <CardTitle>Problem Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-gray-800 whitespace-pre-wrap">{caseDetail.description}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Insurance Information */}
            {caseDetail.insurance && Object.keys(caseDetail.insurance).some(key => caseDetail.insurance[key]) && (
              <Card>
                <CardHeader>
                  <CardTitle>Insurance Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4">
                    {Object.entries(caseDetail.insurance)
                      .filter(([key, value]) => value)
                      .map(([key, value]) => (
                        <div key={key}>
                          <span className="text-sm font-medium capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}:
                          </span>
                          <p className="text-sm text-gray-600 ml-2">{String(value)}</p>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Files */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center space-x-2">
                  <FileText className="h-5 w-5" />
                  <span>Uploaded Files ({caseDetail.files.length})</span>
                </CardTitle>
                {caseDetail.files.length > 0 && (
                  <Button
                    onClick={downloadAllFiles}
                    disabled={processing}
                    variant="outline"
                    size="sm"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {processing ? 'Preparing...' : 'Download Summary'}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {caseDetail.files.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No files uploaded</p>
                ) : (
                  <div className="space-y-3">
                    {caseDetail.files.map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <FileText className="h-5 w-5 text-gray-400" />
                          <div>
                            <p className="font-medium text-gray-900">{file.filename}</p>
                            <p className="text-sm text-gray-500">
                              {formatFileSize(file.size_bytes)} • {file.mime} • {formatDate(file.uploaded_at)}
                            </p>
                          </div>
                        </div>
                        <Button
                          onClick={() => downloadFile(file.id, file.filename)}
                          disabled={downloadingFile === file.id}
                          variant="outline"
                          size="sm"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {downloadingFile === file.id ? 'Downloading...' : 'Download'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Analysis Results */}
            {(caseDetail.extractions.length > 0 || caseDetail.detections.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>Analysis Results</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* OCR Extractions */}
                  {caseDetail.extractions.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">OCR Extractions ({caseDetail.extractions.length})</h4>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {caseDetail.extractions.map((extraction, index) => (
                          <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                            <div>
                              <span className="font-medium">{extraction.code}</span>
                              <span className="text-gray-600 ml-2">{extraction.description}</span>
                              <span className="text-gray-400 ml-2">Page {extraction.page}</span>
                            </div>
                            <span className="font-medium text-green-600">
                              {formatCurrency(extraction.charge_cents)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rule Detections */}
                  {caseDetail.detections.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Rule Detections ({caseDetail.detections.length})</h4>
                      <div className="space-y-3">
                        {caseDetail.detections.map((detection, index) => (
                          <div key={index} className="p-3 border rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">{detection.rule_key}</span>
                              <Badge variant={detection.severity === 'high' ? 'destructive' : detection.severity === 'warn' ? 'secondary' : 'outline'}>
                                {detection.severity}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-700">{detection.explanation}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {caseDetail.status === 'submitted' && (
                  <Button
                    onClick={runOcrAnalysis}
                    disabled={processing}
                    className="w-full"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {processing ? 'Processing...' : 'Run OCR & Analysis'}
                  </Button>
                )}

                <Button
                  onClick={downloadAllFiles}
                  disabled={processing || caseDetail.files.length === 0}
                  variant="outline"
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Case Summary
                </Button>

                {caseDetail.status === 'ready' && (
                  <>
                    <Button variant="outline" className="w-full">
                      Edit Report
                    </Button>
                    <Button className="w-full btn-wyng-gradient text-white">
                      <Mail className="h-4 w-4 mr-2" />
                      Email Results
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Case Statistics */}
            <Card>
              <CardHeader>
                <CardTitle>Case Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Files:</span>
                  <span className="text-sm font-medium">{caseDetail.files.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Extractions:</span>
                  <span className="text-sm font-medium">{caseDetail.extractions.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Detections:</span>
                  <span className="text-sm font-medium">{caseDetail.detections.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Status:</span>
                  <Badge className={getStatusColor(caseDetail.status)} variant="outline">
                    {caseDetail.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}