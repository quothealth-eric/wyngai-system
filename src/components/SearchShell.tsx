'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  MessageCircle,
  FileText,
  HelpCircle
} from 'lucide-react'
import { EnhancedIntentRouter, type Intent, type IntentResult, type IntentInput } from '@/lib/intent/enhanced-router'
import { ThreadPane } from './ThreadPane'
import { Clarifier } from './Clarifier'
import { ExplainerLite } from './ExplainerLite'

interface SearchShellProps {
  className?: string
}

export function SearchShell({ className }: SearchShellProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [input, setInput] = useState('')
  const [currentIntent, setCurrentIntent] = useState<Intent | null>(null)
  const [intentResult, setIntentResult] = useState<IntentResult | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [submittedQuery, setSubmittedQuery] = useState<string>('')
  const [showExplainerLite, setShowExplainerLite] = useState(false)

  const intentRouter = useRef(new EnhancedIntentRouter())

  // Example queries for quick access
  const exampleQueries = [
    {
      text: "What is my deductible?",
      icon: MessageCircle,
      intent: "insurance" as Intent
    },
    {
      text: "Should I switch from employer to marketplace?",
      icon: MessageCircle,
      intent: "insurance" as Intent,
      isNew: true
    },
    {
      text: "What healthcare bills are pending in Congress?",
      icon: FileText,
      intent: "legislation" as Intent
    },
    {
      text: "How would Medicare for All work?",
      icon: HelpCircle,
      intent: "legislation" as Intent
    }
  ]

  // Initialize from URL params if resuming a thread
  useEffect(() => {
    const threadParam = searchParams.get('t')
    if (threadParam) {
      setThreadId(threadParam)
    }
  }, [searchParams])

  // Handle input change and real-time intent evaluation
  const handleInputChange = useCallback(async (value: string) => {
    setInput(value)

    if (value.trim()) {
      const result = await intentRouter.current.routeIntent({ text: value })
      setIntentResult(result)
    } else {
      setIntentResult(null)
    }
  }, [])

  // Handle form submission
  const handleSubmit = useCallback(async (overrideIntent?: Intent) => {
    if (!input.trim()) return

    const finalIntent = overrideIntent || intentResult?.intent || 'insurance'
    setCurrentIntent(finalIntent)
    setIsProcessing(true)

    // Store the query before clearing input
    const queryToProcess = input.trim()

    try {
      // Create or continue thread
      const newThreadId = threadId || `thread_${Date.now()}`

      if (!threadId) {
        setThreadId(newThreadId)
        // Update URL without navigation
        const newUrl = `/t/${newThreadId}`
        window.history.pushState({}, '', newUrl)
      }

      // Store query for ThreadPane and clear input
      setSubmittedQuery(queryToProcess)
      setInput('')
      setIntentResult(null)

      // Analytics
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'query_submitted', {
          intent: finalIntent,
          confidence: intentResult?.confidence || 0
        })
      }

    } catch (error) {
      console.error('Error submitting query:', error)
    } finally {
      setIsProcessing(false)
    }
  }, [input, intentResult, threadId])


  // Handle example query clicks
  const handleExampleClick = useCallback((example: typeof exampleQueries[0]) => {
    setInput(example.text)
    handleInputChange(example.text)

    // Auto-submit for examples
    setTimeout(() => {
      handleSubmit(example.intent)
    }, 100)
  }, [handleInputChange, handleSubmit])

  // Handle clarifier choice
  const handleClarifierChoice = useCallback((intent: Intent) => {
    setCurrentIntent(intent)
    handleSubmit(intent)

    // Analytics
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'clarifier_choice', {
        choice: intent
      })
    }
  }, [handleSubmit])

  return (
    <div className={`w-full max-w-4xl mx-auto ${className}`}>
      {/* Main Search Interface */}
      <div className="mb-6">
        <Card className="border-gray-200">
          <CardContent className="p-6">
            {/* Search Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSubmit()
              }}
              className="space-y-4"
            >
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Input
                    value={input}
                    onChange={(e) => handleInputChange(e.target.value)}
                    placeholder="Ask about health insurance or healthcare policy..."
                    className="text-lg py-3 pr-12"
                    disabled={isProcessing}
                  />

                  {/* Intent indicator */}
                  {intentResult && intentResult.confidence > 0.7 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {intentResult.intent === 'insurance' ? (
                        <MessageCircle className="h-5 w-5 text-blue-500" />
                      ) : intentResult.intent === 'legislation' ? (
                        <FileText className="h-5 w-5 text-purple-500" />
                      ) : (
                        <HelpCircle className="h-5 w-5 text-yellow-500" />
                      )}
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={!input.trim() || isProcessing}
                  size="lg"
                  className="px-6"
                >
                  <Search className="h-4 w-4 mr-2" />
                  {isProcessing ? 'Processing...' : 'Search'}
                </Button>
              </div>

              {/* Search options and indicators */}
              {(intentResult || showExplainerLite) && (
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    {/* Quick Explainer CTA */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowExplainerLite(!showExplainerLite)
                        // Analytics
                        if (typeof window !== 'undefined' && (window as any).gtag) {
                          (window as any).gtag('event', 'explainer_lite_start')
                        }
                      }}
                      className="text-primary hover:underline"
                    >
                      {showExplainerLite ? 'Hide Quick Explainer' : 'Quick Explainer'}
                    </button>
                  </div>

                  {/* Intent confidence and theme indicator */}
                  {intentResult && (
                    <div className="flex items-center gap-2">
                      {/* Primary theme */}
                      {intentResult.themes && intentResult.themes.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {intentResult.themes[0].theme}
                        </Badge>
                      )}

                      {/* State/marketplace indicator */}
                      {intentResult.state && (
                        <Badge variant="outline" className="text-xs">
                          {intentResult.state} • {intentResult.marketplace || 'Healthcare.gov'}
                        </Badge>
                      )}

                      {/* Confidence indicator */}
                      <Badge
                        variant={intentResult.confidence > 0.8 ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {Math.round(intentResult.confidence * 100)}%
                      </Badge>
                    </div>
                  )}
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Clarifier */}
        {intentResult?.intent === 'CLARIFY' && intentResult.suggestedActions && (
          <div className="mt-4">
            <Clarifier
              suggestions={intentResult.suggestedActions}
              onChoice={handleClarifierChoice}
              reason={intentResult.reasons?.join(', ')}
            />
          </div>
        )}


        {/* Explainer Lite (expandable) */}
        {showExplainerLite && (
          <div className="mt-4">
            <ExplainerLite
              threadId={threadId || `thread_${Date.now()}`}
              onComplete={(result) => {
                // Analytics
                if (typeof window !== 'undefined' && (window as any).gtag) {
                  (window as any).gtag('event', 'explainer_lite_done', {
                    bullets_count: result.bullets.length
                  })
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Example Queries (show when no thread active) */}
      {!threadId && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
            Try these examples:
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {exampleQueries.map((example, index) => (
              <Button
                key={index}
                variant="outline"
                className="h-auto p-4 text-left justify-start hover:bg-gray-50"
                onClick={() => handleExampleClick(example)}
              >
                <example.icon className="h-4 w-4 mr-3 flex-shrink-0" />
                <span className="text-sm">{example.text}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Thread Pane (renders conversation) */}
      {threadId && (
        <ThreadPane
          threadId={threadId}
          currentIntent={currentIntent}
          initialQuery={submittedQuery}
          onIntentSwitch={(newIntent) => {
            setCurrentIntent(newIntent)
          }}
        />
      )}
    </div>
  )
}