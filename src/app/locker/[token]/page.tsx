'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { MessageCircle, FileText, Download, ExternalLink, Loader2 } from 'lucide-react'

interface LockerItem {
  id: string
  item_type: string
  ref_id: string
  title: string
  storage_path?: string
  signedUrl?: string
  created_at: string
}

interface Locker {
  lockerId: string
  email: string
  createdAt: string
  expiresAt: string
}

export default function LockerPage() {
  const params = useParams()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [locker, setLocker] = useState<Locker | null>(null)
  const [items, setItems] = useState<LockerItem[]>([])

  useEffect(() => {
    if (token) {
      loadLocker()
    }
  }, [token])

  const loadLocker = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/locker/open?token=${token}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load locker')
      }

      setLocker(data.locker)
      setItems(data.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load locker')
    } finally {
      setLoading(false)
    }
  }

  const getItemIcon = (itemType: string) => {
    switch (itemType) {
      case 'chat':
        return <MessageCircle className="h-5 w-5" />
      case 'explainer':
        return <FileText className="h-5 w-5" />
      case 'analyzer_report':
        return <Download className="h-5 w-5" />
      default:
        return <FileText className="h-5 w-5" />
    }
  }

  const getItemTypeName = (itemType: string) => {
    switch (itemType) {
      case 'chat':
        return 'Chat Conversation'
      case 'explainer':
        return 'Bill Explainer'
      case 'analyzer_report':
        return 'Analysis Report'
      default:
        return 'Unknown Item'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p>Loading your MyWyng Locker...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button onClick={() => window.location.href = '/'}>
            Return to WyngAI
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">MyWyng Case Locker</h1>
              <p className="text-gray-600">{locker?.email}</p>
            </div>
            <Button variant="outline" onClick={() => window.location.href = '/'}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Back to WyngAI
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {items.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No items saved yet</h3>
              <p className="text-gray-600 mb-6">
                Start a conversation with WyngAI and save responses to see them here.
              </p>
              <Button onClick={() => window.location.href = '/'}>
                Start New Conversation
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Saved Items ({items.length})
              </h2>
              <p className="text-sm text-gray-500">
                Expires: {formatDate(locker?.expiresAt || '')}
              </p>
            </div>

            <div className="grid gap-4">
              {items.map((item) => (
                <Card key={item.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getItemIcon(item.item_type)}
                        <div>
                          <CardTitle className="text-base">{item.title}</CardTitle>
                          <div className="flex items-center space-x-2 mt-1">
                            <Badge variant="secondary">
                              {getItemTypeName(item.item_type)}
                            </Badge>
                            <span className="text-sm text-gray-500">
                              {formatDate(item.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        {item.signedUrl && (
                          <Button size="sm" variant="outline" asChild>
                            <a href={item.signedUrl} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4 mr-1" />
                              Download
                            </a>
                          </Button>
                        )}
                        <Button size="sm" variant="outline">
                          View Details
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        )}

        <Separator className="my-8" />

        <div className="text-center text-sm text-gray-500">
          <p>MyWyng Case Locker - Secure access to your health insurance insights</p>
          <p className="mt-1">
            Questions? Visit{' '}
            <a href="/" className="text-primary hover:underline">
              getwyng.co
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}