'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Send,
  AlertTriangle,
  Share,
  Download,
  Mail,
  MessageSquare,
  FileText,
  ArrowLeft,
  MessageCircle
} from 'lucide-react'
import { IntentInput } from '@/lib/intent/types'

interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: Date
  llmResponse?: any
}

interface ChatInterfaceProps {
  initialInput: IntentInput
  sessionData?: any
  onBackToSearch: () => void
}

export function ChatInterface({ initialInput, sessionData, onBackToSearch }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasProcessedInitial, setHasProcessedInitial] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' })
      }
    }
  }

  // Auto-scroll behavior
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollToBottom(), 100)
    }
  }, [messages])

  const handleSendMessage = useCallback(async (messageText?: string) => {
    const textToSend = messageText || inputValue.trim()
    if (!textToSend || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: textToSend,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    if (!messageText) setInputValue('')
    setIsLoading(true)

    try {
      console.log('🚀 Sending chat request:', textToSend.substring(0, 100) + '...')

      const response = await fetch('/api/chat/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: textToSend,
          userId: sessionData?.userId || 'anonymous',
          chatId: sessionData?.chatId || `chat_${Date.now()}`
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to get response')
      }

      const result = await response.json()
      const assistantResponse = result.response || result

      const assistantMessage: Message = {
        id: Date.now().toString() + '_assistant',
        type: 'assistant',
        content: assistantResponse.answer || 'I apologize, but I encountered an issue processing your request. Please try again.',
        timestamp: new Date(),
        llmResponse: assistantResponse
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Chat error:', error)

      const errorMessage: Message = {
        id: Date.now().toString() + '_error',
        type: 'assistant',
        content: 'I apologize, but I encountered an issue processing your request. Please try again or check back later.',
        timestamp: new Date()
      }

      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }, [inputValue, isLoading, sessionData])

  // Add initial welcome message
  useEffect(() => {
    const welcomeMessage: Message = {
      id: 'welcome',
      type: 'assistant',
      content: `I'm your healthcare guardian angel, ready to help you understand insurance issues and medical bills.

I can help with:
• Understanding confusing medical bills
• Appeal letters for denied claims
• Billing error identification
• Insurance coverage questions
• Step-by-step guidance for next actions

What's your healthcare question today?`,
      timestamp: new Date()
    }

    setMessages([welcomeMessage])
  }, [])

  // Process initial input
  useEffect(() => {
    if (initialInput?.text && !hasProcessedInitial) {
      setHasProcessedInitial(true)
      handleSendMessage(initialInput.text)
    }
  }, [initialInput, hasProcessedInitial, handleSendMessage])

  const handleShare = async (method: 'email' | 'sms' | 'pdf') => {
    const latestAssistantMessage = messages.filter(m => m.type === 'assistant').pop()
    if (!latestAssistantMessage) return

    try {
      let endpoint = ''
      let payload = {}

      const content = {
        question: messages.find(m => m.type === 'user')?.content,
        answer: latestAssistantMessage.content,
        ...latestAssistantMessage.llmResponse
      }

      switch (method) {
        case 'email':
          endpoint = '/api/share/email'
          const email = prompt('Enter email address:')
          if (!email) return
          payload = {
            to: email,
            subject: 'Your Wyng Healthcare Analysis',
            content,
            contentType: 'chat'
          }
          break
        case 'sms':
          endpoint = '/api/share/sms'
          const phone = prompt('Enter phone number:')
          if (!phone) return
          payload = {
            to: phone,
            content
          }
          break
        case 'pdf':
          endpoint = '/api/share/pdf'
          payload = {
            content,
            title: 'Wyng Healthcare Analysis',
            contentType: 'chat'
          }
          break
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) throw new Error('Share failed')

      const result = await response.json()

      if (method === 'pdf' && result.downloadUrl) {
        window.open(result.downloadUrl, '_blank')
      } else {
        alert(`Successfully shared via ${method}!`)
      }
    } catch (error) {
      console.error('Share error:', error)
      alert(`Failed to share via ${method}`)
    }

    setShowShareMenu(false)
  }

  const renderLLMResponse = (llmResponse: any) => {
    if (llmResponse.answer && llmResponse.citations) {
      return (
        <div className="space-y-6">
          {/* Main Answer */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-gray-800 whitespace-pre-line">{llmResponse.answer}</div>
          </div>

          {/* Jargon Explanations */}
          {llmResponse.jargonExplanations && llmResponse.jargonExplanations.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-3">📚 Insurance Terms Explained</h4>
              <div className="space-y-3">
                {llmResponse.jargonExplanations.map((jargon: any, index: number) => (
                  <div key={index} className="bg-white p-3 rounded border border-blue-100">
                    <h5 className="font-medium text-blue-800 mb-1">{jargon.term}</h5>
                    <p className="text-blue-700 text-sm mb-2">{jargon.definition}</p>
                    {jargon.example && (
                      <p className="text-blue-600 text-xs italic">Example: {jargon.example}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next Steps */}
          {llmResponse.nextSteps && llmResponse.nextSteps.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">📋 Next Steps</h4>
              <div className="space-y-2">
                {llmResponse.nextSteps.map((step: string, index: number) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-blue-50 rounded border border-blue-200">
                    <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-blue-900">{step}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actionable Links */}
          {llmResponse.actionableLinks && llmResponse.actionableLinks.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-900 mb-3">🔗 Helpful Resources</h4>
              <div className="space-y-2">
                {llmResponse.actionableLinks.map((link: any, index: number) => (
                  <div key={index} className="bg-white p-3 rounded border border-green-100">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-700 hover:text-green-900 font-medium text-sm hover:underline"
                    >
                      {link.text} →
                    </a>
                    <p className="text-green-600 text-xs mt-1">{link.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Citations */}
          {llmResponse.citations && llmResponse.citations.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">⚖️ Legal Basis</h4>
              <div className="space-y-2">
                {llmResponse.citations.map((citation: any, index: number) => (
                  <div key={index} className="text-sm text-gray-600 bg-gray-50 p-3 rounded border">
                    <div className="font-medium text-gray-800">{citation.authority} - {citation.title}</div>
                    {citation.excerpt && (
                      <p className="text-gray-600 mt-1 italic">"{citation.excerpt}"</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-gray-800 whitespace-pre-line">{llmResponse}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToSearch}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Search
          </Button>

          <div className="h-6 w-px bg-gray-300" />

          <Badge variant="default" className="flex items-center gap-1">
            <MessageCircle className="h-3 w-3" />
            Chat Mode
          </Badge>
        </div>

        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowShareMenu(!showShareMenu)}
            className="flex items-center gap-2"
          >
            <Share className="h-4 w-4" />
            Share
          </Button>

          {showShareMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
              <div className="p-2">
                <button
                  onClick={() => handleShare('pdf')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 rounded"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </button>
                <button
                  onClick={() => handleShare('email')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 rounded"
                >
                  <Mail className="h-4 w-4" />
                  Email
                </button>
                <button
                  onClick={() => handleShare('sms')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 rounded"
                >
                  <MessageSquare className="h-4 w-4" />
                  SMS
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
        <p className="text-xs text-yellow-800 text-center flex items-center justify-center gap-2">
          <AlertTriangle className="h-3 w-3" />
          General info only. Not insurance. Not legal advice.
        </p>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 mb-4" ref={scrollAreaRef}>
        <div className="space-y-4 pr-4">
          {messages.map((message, index) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-3xl rounded-lg px-4 py-3 ${
                  message.type === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-white border border-gray-200'
                }`}
              >
                {message.type === 'assistant' && message.llmResponse ? (
                  renderLLMResponse(message.llmResponse)
                ) : (
                  <div className="whitespace-pre-wrap">{message.content}</div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                <p className="text-gray-500">Analyzing your situation...</p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t pt-4">
        <div className="flex gap-2">
          <Textarea
            placeholder="Ask a follow-up question or describe another insurance issue..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSendMessage()
              }
            }}
            disabled={isLoading}
            className="flex-1 min-h-[60px] resize-none"
            rows={2}
          />
          <Button
            onClick={() => handleSendMessage()}
            disabled={!inputValue.trim() || isLoading}
            className="px-4 self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}