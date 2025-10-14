'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Mail, Clock, CheckCircle, AlertCircle } from '@/components/ui/icons'
import Image from 'next/image'

interface CaseSummary {
  case_id: string
  created_at: string
  status: string
  submit_email: string | null
  description: string | null
  file_count: number
  detection_count: number
  extraction_count: number
  emailed_at: string | null
}

export default function AdminDashboard() {
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCases()
  }, [])

  const fetchCases = async () => {
    try {
      const response = await fetch('/api/admin/cases')
      if (!response.ok) {
        if (response.status === 401) {
          // Browser will handle Basic Auth prompt
          return
        }
        throw new Error('Failed to fetch cases')
      }
      const data = await response.json()
      setCases(data.cases)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cases')
    } finally {
      setLoading(false)
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full mx-auto mb-4"></div>
          <p>Loading admin dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Image src="/images/wyng-logo.svg" alt="Wyng" width={32} height={32} />
            <span className="text-2xl font-bold text-primary">Wyng Admin</span>
          </div>
          <div className="flex items-center space-x-4">
            <Badge variant="outline">Cases: {cases.length}</Badge>
            <Button variant="outline" onClick={fetchCases}>
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Case Management Dashboard
          </h1>
          <p className="text-gray-600">
            Monitor and process medical bill analysis cases
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
              <span className="text-red-700">{error}</span>
            </div>
          </div>
        )}

        {/* Cases Grid */}
        {cases.length === 0 ? (
          <Card>
            <CardContent className="pt-8 pb-8 text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Cases Found</h3>
              <p className="text-gray-600">No cases have been submitted yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {cases.map((case_) => (
              <Card key={case_.case_id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Badge className={getStatusColor(case_.status)}>
                        <div className="flex items-center space-x-1">
                          {getStatusIcon(case_.status)}
                          <span className="capitalize">{case_.status}</span>
                        </div>
                      </Badge>
                      <span className="text-sm text-gray-500">
                        {formatDate(case_.created_at)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      ID: {case_.case_id.slice(0, 8)}...
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Mail className="h-4 w-4 text-gray-400" />
                          <span className="text-sm">
                            {case_.submit_email || 'No email provided'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-gray-400" />
                          <span className="text-sm">
                            {case_.file_count} files uploaded
                          </span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-gray-400" />
                          <span className="text-sm">
                            {case_.detection_count} detections
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <AlertCircle className="h-4 w-4 text-gray-400" />
                          <span className="text-sm">
                            {case_.extraction_count} extractions
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {case_.description && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-700 line-clamp-2">
                        {case_.description}
                      </p>
                    </div>
                  )}

                  <div className="mt-4 flex justify-between items-center">
                    <div>
                      {case_.emailed_at && (
                        <span className="text-sm text-green-600">
                          ✓ Emailed {formatDate(case_.emailed_at)}
                        </span>
                      )}
                    </div>
                    <Link href={`/admin/cases/${case_.case_id}`}>
                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}