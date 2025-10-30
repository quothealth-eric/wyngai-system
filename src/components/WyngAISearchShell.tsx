'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Search,
  Upload,
  MessageCircle,
  FileText,
  HelpCircle,
  ExternalLink,
  Copy,
  Mail,
  Download,
  Building,
  Gavel,
  Sparkles,
  Clock,
  User,
  CheckCircle,
  AlertCircle,
  Info
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContextProd'

interface SearchMode {
  id: 'insurance' | 'legislation' | 'mixed'
  label: string
  description: string
  icon: React.ComponentType<any>
  color: string
}

interface SearchResult {
  query: string
  mode: string
  intent: any
  summary: string
  answer: string
  confidence: number
  citations: Array<{
    title: string
    authority: string
    url?: string
    section?: string
    relevance_score: number
  }>
  next_steps: Array<{
    action: string
    description: string
    priority: 'high' | 'medium' | 'low'
    deadline?: string
  }>
  scripts?: Array<{
    channel: string
    purpose: string
    body: string
    estimated_duration: string
  }>
  links: Array<{
    label: string
    url: string
    authority: string
  }>
  bill_meta?: {
    bill_id: string
    number: string
    title: string
    introduced_date?: string
    latest_action?: string
    url: string
  }
  themes: Array<{
    theme: string
    score: number
  }>
  search_metadata: {
    results_found: number
    search_time: number
    source_distribution: Record<string, number>
    authority_mix: Record<string, number>
  }
}

interface WyngAISearchShellProps {
  className?: string
}

const searchModes: SearchMode[] = [
  {
    id: 'insurance',
    label: 'Insurance',
    description: 'Health insurance coverage, benefits, and guidance',
    icon: Building,
    color: 'text-blue-600'
  },
  {
    id: 'legislation',
    label: 'Legislation',
    description: 'Healthcare bills and policy analysis',
    icon: Gavel,
    color: 'text-purple-600'
  },
  {
    id: 'mixed',
    label: 'All',
    description: 'Search everything',
    icon: Sparkles,
    color: 'text-teal-600'
  }
]

export function WyngAISearchShell({ className }: WyngAISearchShellProps) {
  const { user, isAuthenticated } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [query, setQuery] = useState('')
  const [selectedMode, setSelectedMode] = useState<'insurance' | 'legislation' | 'mixed'>('insurance')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Example queries for each mode
  const exampleQueries = {
    insurance: [
      "What is my deductible and how does it work?",
      "Can I switch from employer insurance to marketplace?",
      "What's covered under preventive care?",
      "How do I appeal a denied claim?"
    ],
    legislation: [
      "What healthcare bills are pending in Congress?",
      "What would H.R. 3 do to prescription drug prices?",
      "How would Medicare for All work?",
      "What's in the latest surprise billing legislation?"
    ],
    mixed: [
      "How would new legislation affect my insurance premiums?",
      "What bills address mental health coverage?",
      "Will Congress change the ACA marketplace?",
      "How do proposed Medicare changes affect me?"
    ]
  }

  // Initialize thread ID from URL or create new one
  useEffect(() => {
    const threadParam = searchParams.get('t')
    if (threadParam) {
      setThreadId(threadParam)
    } else {
      setThreadId(`search_${Date.now()}`)
    }
  }, [searchParams])

  // Handle search submission
  const handleSearch = useCallback(async () => {
    if (!query.trim()) return

    setIsSearching(true)
    setError(null)

    try {
      console.log('🔍 Submitting search:', { query, mode: selectedMode })

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: query.trim(),
          mode: selectedMode,
          threadId,
          userId: user?.id,
          max_results: 10
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.details || 'Search failed')
      }

      const result = await response.json()
      setSearchResult(result.data)

      // Analytics
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'search_completed', {
          mode: selectedMode,
          query_length: query.length,
          results_found: result.data.search_metadata.results_found,
          confidence: result.data.confidence
        })
      }

    } catch (error) {
      console.error('Search error:', error)
      setError(error instanceof Error ? error.message : 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }, [query, selectedMode, threadId, user])

  // Handle example query click
  const handleExampleClick = useCallback((exampleQuery: string) => {
    setQuery(exampleQuery)
    setTimeout(() => handleSearch(), 100)
  }, [handleSearch])

  // Copy result to clipboard
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      // Could show a toast notification here
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }, [])

  // Generate shareable link
  const generateShareLink = useCallback(() => {
    const baseUrl = window.location.origin
    return `${baseUrl}/?t=${threadId}&q=${encodeURIComponent(query)}&m=${selectedMode}`
  }, [threadId, query, selectedMode])

  return (
    <div className={`w-full max-w-6xl mx-auto space-y-6 ${className}`}>
      {/* Search Interface */}
      <Card className="border-gray-200">
        <CardContent className="p-6">
          {/* Search Tabs */}
          <Tabs value={selectedMode} onValueChange={(value) => setSelectedMode(value as any)} className="mb-6">
            <TabsList className="grid w-full grid-cols-3">
              {searchModes.map((mode) => (
                <TabsTrigger key={mode.id} value={mode.id} className="flex items-center gap-2">
                  <mode.icon className={`h-4 w-4 ${mode.color}`} />
                  {mode.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Tab Content with Descriptions */}
            {searchModes.map((mode) => (
              <TabsContent key={mode.id} value={mode.id} className="mt-4">
                <div className="text-center mb-4">
                  <p className="text-gray-600 text-sm">{mode.description}</p>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          {/* Search Input */}
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="space-y-4">
            <div className="flex gap-3">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Ask about ${selectedMode === 'insurance' ? 'health insurance' : selectedMode === 'legislation' ? 'healthcare policy' : 'health insurance or policy'}...`}
                className="text-lg py-3"
                disabled={isSearching}
              />
              <Button
                type="submit"
                disabled={!query.trim() || isSearching}
                size="lg"
                className="px-8"
              >
                <Search className="h-4 w-4 mr-2" />
                {isSearching ? 'Searching...' : 'Search'}
              </Button>
            </div>
          </form>

          {/* User Status */}
          {isAuthenticated && user && (
            <div className="flex items-center gap-2 pt-3 text-sm text-gray-600">
              <User className="h-4 w-4" />
              <span>Signed in as {user.email}</span>
              <Badge variant="outline" className="text-xs">
                Searches saved for 14 days
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Example Queries */}
      {!searchResult && (
        <Card className="border-gray-100 bg-gray-50/50">
          <CardContent className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">
              Try these {selectedMode} examples:
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {exampleQueries[selectedMode].map((example, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  className="h-auto p-3 text-left justify-start hover:bg-white text-sm"
                  onClick={() => handleExampleClick(example)}
                >
                  <MessageCircle className="h-4 w-4 mr-3 flex-shrink-0" />
                  <span>{example}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="h-4 w-4" />
              <span className="font-medium">Search Error</span>
            </div>
            <p className="text-red-600 mt-1">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      {searchResult && (
        <div className="space-y-6">
          {/* Summary */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    {searchResult.summary}
                  </h2>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{searchResult.search_metadata.search_time}ms</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="h-4 w-4" />
                      <span>{searchResult.search_metadata.results_found} sources</span>
                    </div>
                    <Badge
                      variant={searchResult.confidence > 0.8 ? 'default' : searchResult.confidence > 0.6 ? 'secondary' : 'outline'}
                      className="text-xs"
                    >
                      {Math.round(searchResult.confidence * 100)}% confidence
                    </Badge>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(searchResult.answer)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(generateShareLink())}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Mode and Intent Indicators */}
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="outline">
                  Mode: {searchResult.mode}
                </Badge>
                {searchResult.intent && (
                  <Badge variant="secondary">
                    Intent: {searchResult.intent.intent}
                  </Badge>
                )}
                {searchResult.themes.slice(0, 3).map((theme) => (
                  <Badge key={theme.theme} variant="outline" className="text-xs">
                    {theme.theme}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Bill Metadata (for legislation queries) */}
          {searchResult.bill_meta && (
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Gavel className="h-6 w-6 text-purple-600 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-purple-900 mb-2">
                      {searchResult.bill_meta.number}: {searchResult.bill_meta.title}
                    </h3>
                    <div className="space-y-1 text-sm text-purple-800">
                      {searchResult.bill_meta.introduced_date && (
                        <p>Introduced: {new Date(searchResult.bill_meta.introduced_date).toLocaleDateString()}</p>
                      )}
                      {searchResult.bill_meta.latest_action && (
                        <p>Latest Action: {searchResult.bill_meta.latest_action}</p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => window.open(searchResult.bill_meta!.url, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View on Congress.gov
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Main Answer */}
          <Card>
            <CardContent className="p-6">
              <div className="prose prose-gray max-w-none">
                {searchResult.answer.split('\n\n').map((paragraph, index) => (
                  <p key={index} className="mb-4 last:mb-0">
                    {paragraph}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Next Steps */}
          {searchResult.next_steps.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Next Steps</h3>
                <div className="space-y-3">
                  {searchResult.next_steps.map((step, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                        step.priority === 'high' ? 'bg-red-100 text-red-800' :
                        step.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{step.action}</h4>
                        <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                        {step.deadline && (
                          <p className="text-xs text-gray-500 mt-1">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {step.deadline}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Scripts */}
          {searchResult.scripts && searchResult.scripts.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Phone Scripts</h3>
                <div className="space-y-4">
                  {searchResult.scripts.map((script, index) => (
                    <div key={index} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900">{script.purpose}</h4>
                        <Badge variant="outline" className="text-xs">
                          {script.estimated_duration}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-700 mb-2">
                        <strong>Call:</strong> {script.channel}
                      </p>
                      <div className="bg-white p-3 rounded border text-sm text-gray-800">
                        {script.body}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => copyToClipboard(script.body)}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Script
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Citations and Links */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Citations */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Sources & Citations</h3>
                <div className="space-y-3">
                  {searchResult.citations.map((citation, index) => (
                    <div key={index} className="p-3 border rounded-lg">
                      <h4 className="font-medium text-sm text-gray-900 mb-1">
                        {citation.title}
                      </h4>
                      <p className="text-xs text-gray-600 mb-2">
                        Authority: {citation.authority}
                      </p>
                      {citation.section && (
                        <p className="text-xs text-gray-500 mb-2">
                          Section: {citation.section}
                        </p>
                      )}
                      {citation.url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-0 h-auto text-xs"
                          onClick={() => window.open(citation.url, '_blank')}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View Source
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Helpful Links */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Helpful Links</h3>
                <div className="space-y-3">
                  {searchResult.links.map((link, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      className="w-full justify-start text-left h-auto p-3"
                      onClick={() => window.open(link.url, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-3 flex-shrink-0" />
                      <div>
                        <div className="font-medium text-sm">{link.label}</div>
                        <div className="text-xs text-gray-500">{link.authority}</div>
                      </div>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search Another Query */}
          <Card className="border-gray-100 bg-gray-50">
            <CardContent className="p-6 text-center">
              <h3 className="font-semibold text-gray-900 mb-2">Need more help?</h3>
              <p className="text-gray-600 mb-4">Search for something else or try a different mode</p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchResult(null)
                  setQuery('')
                  setError(null)
                }}
              >
                <Search className="h-4 w-4 mr-2" />
                New Search
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}