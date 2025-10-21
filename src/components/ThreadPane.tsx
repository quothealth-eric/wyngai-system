'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  MessageCircle,
  FileText,
  Edit2,
  Download,
  Mail,
  MessageSquare,
  Copy,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap
} from 'lucide-react'
import { Intent } from '@/lib/intent/router'

interface Message {
  id: string
  type: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  intent?: Intent
  metadata?: any
  collapsed?: boolean
}

interface ThreadPaneProps {
  threadId: string
  currentIntent?: Intent | null
  initialQuery?: string
  onIntentSwitch?: (newIntent: Intent) => void
}

export function ThreadPane({
  threadId,
  currentIntent,
  initialQuery,
  onIntentSwitch
}: ThreadPaneProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [threadTitle, setThreadTitle] = useState('New Conversation')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Process initial query when component mounts
  useEffect(() => {
    if (initialQuery && messages.length === 0) {
      handleQuery(initialQuery, currentIntent || 'CHAT')
    }
  }, [initialQuery, currentIntent, messages.length])

  // Handle query submission
  const handleQuery = useCallback(async (query: string, intent: Intent) => {
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      type: 'user',
      content: query,
      timestamp: new Date(),
      intent
    }

    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    try {
      if (intent === 'CHAT') {
        // System message for chat processing
        const systemMessage: Message = {
          id: `sys_${Date.now()}`,
          type: 'system',
          content: 'Processing your question...',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, systemMessage])

        // Call chat API
        const response = await fetch('/api/chat/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: query,
            chatId: threadId,
            userId: 'anonymous'
          })
        })

        if (!response.ok) {
          throw new Error('Chat request failed')
        }

        const result = await response.json()

        // Remove system message and add response
        setMessages(prev => prev.filter(m => m.id !== systemMessage.id))

        const assistantMessage: Message = {
          id: `msg_${Date.now()}_assistant`,
          type: 'assistant',
          content: result.response?.answer || 'I apologize, but I encountered an issue processing your request.',
          timestamp: new Date(),
          intent: 'CHAT',
          metadata: result.response,
          collapsed: false
        }

        setMessages(prev => [...prev, assistantMessage])

        // Generate thread title if this is the first exchange
        if (messages.length <= 1) {
          generateThreadTitle(query)
        }

      } else if (intent === 'ANALYZER') {
        // For analyzer, we'll trigger the upload pane
        // This is handled by the parent component
      }

      // Analytics
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'query_submitted', {
          intent,
          threadId
        })
      }

    } catch (error) {
      console.error('Error processing query:', error)

      const errorMessage: Message = {
        id: `msg_${Date.now()}_error`,
        type: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
        intent
      }

      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }, [threadId, messages.length])

  // Generate thread title from first query
  const generateThreadTitle = useCallback((query: string) => {
    // Extract key words to create a meaningful title
    const words = query.toLowerCase().split(' ')
    const keyWords = words.filter(word =>
      !['what', 'how', 'when', 'where', 'why', 'is', 'are', 'can', 'do', 'does', 'my', 'the', 'a', 'an'].includes(word)
    )

    const title = keyWords.slice(0, 4).join(' ')
    setThreadTitle(title.length > 50 ? title.substring(0, 47) + '...' : title)
  }, [])

  // Handle title editing
  const handleTitleEdit = useCallback(() => {
    setIsEditingTitle(true)
    setTimeout(() => titleInputRef.current?.focus(), 0)
  }, [])

  const handleTitleSave = useCallback(() => {
    setIsEditingTitle(false)
  }, [])

  // Handle section collapse/expand
  const handleToggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId)
      } else {
        newSet.add(sectionId)
      }
      return newSet
    })
  }, [])

  // Handle export functionality
  const handleExport = useCallback(async (messageId: string, format: 'pdf' | 'email' | 'sms' | 'copy') => {
    const message = messages.find(m => m.id === messageId)
    if (!message) return

    try {
      if (format === 'copy') {
        await navigator.clipboard.writeText(message.content)
        // Show toast notification
        return
      }

      const endpoint = `/api/share/${format}`
      let payload: any = {
        content: message.metadata || { answer: message.content },
        threadId,
        messageId
      }

      if (format === 'email') {
        const email = prompt('Enter email address:')
        if (!email) return
        payload = {
          ...payload,
          to: email,
          subject: `Wyng: ${threadTitle}`
        }
      }

      if (format === 'sms') {
        const phone = prompt('Enter phone number:')
        if (!phone) return
        payload = {
          ...payload,
          to: phone
        }
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`)
      }

      const result = await response.json()

      if (format === 'pdf' && result.downloadUrl) {
        window.open(result.downloadUrl, '_blank')
      }

      // Analytics
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', `export_${format}`, {
          threadId,
          messageId
        })
      }

    } catch (error) {
      console.error(`Export ${format} failed:`, error)
      alert(`Failed to export via ${format}. Please try again.`)
    }
  }, [messages, threadId, threadTitle])

  // Render message content based on type and metadata
  const renderMessageContent = useCallback((message: Message) => {
    if (message.type === 'system') {
      return (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Clock className="h-4 w-4 animate-spin" />
          {message.content}
        </div>
      )
    }

    if (message.type === 'user') {
      return (
        <div className="text-gray-900">
          {message.content}
        </div>
      )
    }

    // Assistant message with potential rich content
    if (message.metadata && message.intent === 'CHAT') {
      return renderChatResponse(message)
    }

    if (message.metadata && message.intent === 'ANALYZER') {
      return renderAnalyzerResponse(message)
    }

    // Fallback to plain text
    return (
      <div className="text-gray-900 whitespace-pre-wrap">
        {message.content}
      </div>
    )
  }, [])

  // Render chat response with structured content
  const renderChatResponse = useCallback((message: Message) => {
    const data = message.metadata
    const sectionId = `chat_${message.id}`

    return (
      <div className="space-y-4">
        {/* Main Answer */}
        <div className="text-gray-900 whitespace-pre-wrap">
          {data.answer || message.content}
        </div>

        {/* Expandable sections */}
        <Accordion type="multiple" className="w-full">
          {/* Next Steps */}
          {data.nextSteps && data.nextSteps.length > 0 && (
            <AccordionItem value="next-steps">
              <AccordionTrigger className="text-sm">
                📋 Next Steps ({data.nextSteps.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {data.nextSteps.map((step: string, index: number) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-blue-50 rounded">
                      <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </div>
                      <div className="text-sm text-blue-900">{step}</div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Citations */}
          {data.citations && data.citations.length > 0 && (
            <AccordionItem value="citations">
              <AccordionTrigger className="text-sm">
                ⚖️ Sources ({data.citations.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {data.citations.map((citation: any, index: number) => (
                    <div key={index} className="text-sm bg-gray-50 p-3 rounded">
                      <div className="font-medium">{citation.authority} - {citation.title}</div>
                      {citation.excerpt && (
                        <div className="text-gray-600 mt-1 italic">"{citation.excerpt}"</div>
                      )}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Actionable Links */}
          {data.actionableLinks && data.actionableLinks.length > 0 && (
            <AccordionItem value="links">
              <AccordionTrigger className="text-sm">
                🔗 Helpful Resources ({data.actionableLinks.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {data.actionableLinks.map((link: any, index: number) => (
                    <div key={index} className="bg-green-50 p-3 rounded">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-700 hover:text-green-900 font-medium text-sm hover:underline"
                      >
                        {link.text} →
                      </a>
                      <div className="text-green-600 text-xs mt-1">{link.description}</div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </div>
    )
  }, [])

  // Render analyzer response (placeholder for now)
  const renderAnalyzerResponse = useCallback((message: Message) => {
    return (
      <div className="text-gray-900">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5 text-green-600" />
          <span className="font-semibold">Bill Analysis Complete</span>
        </div>
        {message.content}
      </div>
    )
  }, [])

  return (
    <div className="space-y-6">
      {/* Thread Header */}
      <div className="flex items-center justify-between p-4 bg-white border rounded-lg">
        <div className="flex items-center gap-3">
          {/* Mode indicator */}
          <Badge
            variant={currentIntent === 'CHAT' ? 'default' : 'secondary'}
            className="flex items-center gap-1"
          >
            {currentIntent === 'CHAT' ? (
              <MessageCircle className="h-3 w-3" />
            ) : (
              <FileText className="h-3 w-3" />
            )}
            Mode: {currentIntent || 'Chat'}
          </Badge>

          {/* Editable title */}
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              value={threadTitle}
              onChange={(e) => setThreadTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyPress={(e) => e.key === 'Enter' && handleTitleSave()}
              className="text-lg font-semibold bg-transparent border-none outline-none"
            />
          ) : (
            <button
              onClick={handleTitleEdit}
              className="text-lg font-semibold text-gray-900 hover:text-gray-700 flex items-center gap-2"
            >
              {threadTitle}
              <Edit2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Thread actions */}
        <div className="text-xs text-gray-500">
          Thread ID: {threadId.slice(-8)}
        </div>
      </div>

      {/* Messages */}
      <div className="space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.type === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-3xl rounded-lg px-4 py-3 ${
                message.type === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : message.type === 'system'
                  ? 'bg-yellow-50 border border-yellow-200'
                  : 'bg-white border border-gray-200'
              }`}
            >
              {renderMessageContent(message)}

              {/* Export options for assistant messages */}
              {message.type === 'assistant' && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-500">Export:</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleExport(message.id, 'copy')}
                    className="h-6 px-2 text-xs"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleExport(message.id, 'email')}
                    className="h-6 px-2 text-xs"
                  >
                    <Mail className="h-3 w-3 mr-1" />
                    Email
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleExport(message.id, 'pdf')}
                    className="h-6 px-2 text-xs"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    PDF
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 text-gray-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                Processing...
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}