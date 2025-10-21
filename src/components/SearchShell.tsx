'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  Upload,
  MessageCircle,
  FileText,
  HelpCircle,
  Camera
} from 'lucide-react'
import { IntentRouter, type Intent, type IntentResult, type IntentInput } from '@/lib/intent/router'
import { ThreadPane } from './ThreadPane'
import { UploadPane } from './UploadPane'
import { Clarifier } from './Clarifier'

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
  const [showUploadPane, setShowUploadPane] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [submittedQuery, setSubmittedQuery] = useState<string>('')

  const intentRouter = useRef(new IntentRouter())
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Example queries for quick access
  const exampleQueries = [
    {
      text: "What is my deductible?",
      icon: MessageCircle,
      intent: "CHAT" as Intent
    },
    {
      text: "Analyze my medical bill",
      icon: FileText,
      intent: "ANALYZER" as Intent
    },
    {
      text: "Does my PPO cover out-of-state?",
      icon: MessageCircle,
      intent: "CHAT" as Intent
    },
    {
      text: "Check for billing errors",
      icon: FileText,
      intent: "ANALYZER" as Intent
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
  const handleInputChange = useCallback((value: string) => {
    setInput(value)

    if (value.trim()) {
      const result = intentRouter.current.routeIntent({ text: value })
      setIntentResult(result)

      // Auto-expand upload pane for analyzer intent with high confidence
      if (result.intent === 'ANALYZER' && result.confidence > 0.8) {
        setShowUploadPane(true)
      } else if (result.intent === 'CHAT') {
        setShowUploadPane(false)
      }
    } else {
      setIntentResult(null)
      setShowUploadPane(false)
    }
  }, [])

  // Handle form submission
  const handleSubmit = useCallback(async (overrideIntent?: Intent) => {
    if (!input.trim() && !showUploadPane) return

    const finalIntent = overrideIntent || intentResult?.intent || 'CHAT'
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
  }, [input, intentResult, threadId, showUploadPane])

  // Handle file uploads
  const handleFileUpload = useCallback((files: File[]) => {
    if (files.length === 0) return

    const fileMeta = files.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type
    }))

    const result = intentRouter.current.routeIntent({ files: fileMeta })
    setIntentResult(result)
    setCurrentIntent('ANALYZER')
    setShowUploadPane(true)

    // Analytics
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'file_uploaded', {
        count: files.length,
        totalBytes: files.reduce((sum, f) => sum + f.size, 0)
      })
    }
  }, [])

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFileUpload(files)
    }
  }, [handleFileUpload])

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

    if (intent === 'ANALYZER') {
      setShowUploadPane(true)
    }

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
        <Card
          className={`transition-all duration-200 ${
            dragActive ? 'border-primary shadow-lg bg-primary/5' : 'border-gray-200'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
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
                    placeholder="Ask about insurance or describe your billing issue..."
                    className="text-lg py-3 pr-12"
                    disabled={isProcessing}
                  />

                  {/* Intent indicator */}
                  {intentResult && intentResult.confidence > 0.7 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {intentResult.intent === 'CHAT' ? (
                        <MessageCircle className="h-5 w-5 text-blue-500" />
                      ) : intentResult.intent === 'ANALYZER' ? (
                        <FileText className="h-5 w-5 text-green-500" />
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

              {/* Upload hint and file input */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Upload className="h-4 w-4" />
                  <span>Drag files here or</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-primary hover:underline"
                  >
                    browse files
                  </button>

                  {/* Mobile camera option */}
                  <span className="hidden sm:inline">•</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.accept = "image/*"
                        fileInputRef.current.setAttribute('capture', 'environment')
                        fileInputRef.current.click()
                      }
                    }}
                    className="sm:hidden text-primary hover:underline flex items-center gap-1"
                  >
                    <Camera className="h-4 w-4" />
                    Take photo
                  </button>
                </div>

                {/* Intent confidence indicator */}
                {intentResult && (
                  <Badge
                    variant={intentResult.confidence > 0.8 ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {Math.round(intentResult.confidence * 100)}% confident
                  </Badge>
                )}
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf,.pdf"
                onChange={(e) => {
                  if (e.target.files) {
                    handleFileUpload(Array.from(e.target.files))
                  }
                }}
                className="hidden"
              />
            </form>
          </CardContent>
        </Card>

        {/* Clarifier */}
        {intentResult?.intent === 'CLARIFY' && intentResult.suggestedActions && (
          <div className="mt-4">
            <Clarifier
              suggestions={intentResult.suggestedActions}
              onChoice={handleClarifierChoice}
              reason={intentResult.reason}
            />
          </div>
        )}

        {/* Upload Pane (expands inline) */}
        {showUploadPane && (
          <div className="mt-4">
            <UploadPane
              threadId={threadId}
              onUploadComplete={() => {
                setShowUploadPane(false)
                setInput('')
              }}
              onCancel={() => {
                setShowUploadPane(false)
                setCurrentIntent(null)
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
            if (newIntent === 'ANALYZER') {
              setShowUploadPane(true)
            }
          }}
        />
      )}
    </div>
  )
}