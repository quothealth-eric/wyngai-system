'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle, Database, Copy, ExternalLink } from 'lucide-react'

interface DatabaseStatus {
  tables: {
    files: {
      exists: boolean
      error?: string
      count: number
    }
    line_items: {
      exists: boolean
      error?: string
      count: number
    }
  }
  recentFiles: Array<{
    id: string
    name: string
    ocrLength: number
    created: string
  }>
}

export default function DatabaseSetupPage() {
  const [status, setStatus] = useState<DatabaseStatus | null>(null)
  const [setupSql, setSetupSql] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const checkStatus = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/create-line-items-table')
      const data = await response.json()
      setStatus(data)
    } catch (error) {
      console.error('Failed to check status:', error)
    }
    setLoading(false)
  }

  const triggerSetup = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/create-line-items-table', {
        method: 'POST'
      })
      const data = await response.json()

      if (data.sql) {
        setSetupSql(data.sql)
      }

      // Recheck status after setup attempt
      await checkStatus()
    } catch (error) {
      console.error('Setup failed:', error)
    }
    setLoading(false)
  }

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(setupSql)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    checkStatus()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center space-x-3">
          <Database className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold">Database Setup</h1>
        </div>

        {/* Current Status */}
        <Card>
          <CardHeader>
            <CardTitle>Current Database Status</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !status ? (
              <div>Checking database status...</div>
            ) : status ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium">Files Table</div>
                      <div className="text-sm text-gray-600">{status.tables.files.count} records</div>
                    </div>
                    {status.tables.files.exists ? (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Exists
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        Missing
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium">Line Items Table</div>
                      <div className="text-sm text-gray-600">{status.tables.line_items.count} records</div>
                    </div>
                    {status.tables.line_items.exists ? (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Exists
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        Missing
                      </Badge>
                    )}
                  </div>
                </div>

                {status.recentFiles.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Recent Files</h3>
                    <div className="space-y-2">
                      {status.recentFiles.map((file) => (
                        <div key={file.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                          <span className="text-sm">{file.name}</span>
                          <span className="text-xs text-gray-500">
                            {file.ocrLength} chars OCR
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>Failed to load status</div>
            )}

            <div className="flex space-x-2 mt-4">
              <Button onClick={checkStatus} disabled={loading}>
                Refresh Status
              </Button>
              {status && !status.tables.line_items.exists && (
                <Button onClick={triggerSetup} disabled={loading} variant="outline">
                  Get Setup Instructions
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Setup Instructions */}
        {setupSql && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                <span>Manual Setup Required</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h3 className="font-medium text-yellow-800 mb-2">Setup Instructions:</h3>
                <ol className="list-decimal list-inside space-y-1 text-sm text-yellow-700">
                  <li>Go to your Supabase project dashboard</li>
                  <li>Navigate to the SQL Editor</li>
                  <li>Copy the SQL below and paste it into the editor</li>
                  <li>Click "Run" to execute the SQL</li>
                  <li>Return here and click "Refresh Status" to verify</li>
                </ol>
              </div>

              <div className="relative">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-medium">SQL to Execute:</h3>
                  <div className="flex space-x-2">
                    <Button size="sm" variant="outline" onClick={copyToClipboard}>
                      <Copy className="h-4 w-4 mr-1" />
                      {copied ? 'Copied!' : 'Copy SQL'}
                    </Button>
                    <a href="https://app.supabase.com" target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline">
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Open Supabase
                      </Button>
                    </a>
                  </div>
                </div>
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                  {setupSql}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Success Message */}
        {status?.tables.line_items.exists && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div>
                  <h3 className="font-medium text-green-800">Database Setup Complete!</h3>
                  <p className="text-green-700">
                    The line_items table is now available. You can upload documents and they will be properly analyzed.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}