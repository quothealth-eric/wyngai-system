'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Shield, MessageCircle, Upload, Send, Home, ChevronRight } from 'lucide-react'
import { EmailCapture, useEmailCapture } from '@/components/features/email-capture'

interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: Date
  citations?: Array<{
    title: string
    authority: string
    citation: string
  }>
}

export default function ChatPage() {
  const { hasEmail, userEmail, handleEmailSubmit } = useEmailCapture()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)

    try {
      // Use the enhanced chat API with semantic search
      const response = await fetch('/api/chat/enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case: {
            caseId: `case_${Date.now()}`,
            artifacts: [],
            narrative: { text: inputValue.trim() }
          },
          email: userEmail
        })
      })

      const data = await response.json()

      if (data.success && data.answer) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: data.answer.answer,
          timestamp: new Date(),
          citations: data.answer.citations || []
        }

        setMessages(prev => [...prev, assistantMessage])

        // Add suggested questions as a follow-up message if available
        if (data.answer.suggested_questions && data.answer.suggested_questions.length > 0) {
          setTimeout(() => {
            const suggestionsMessage: Message = {
              id: (Date.now() + 2).toString(),
              type: 'assistant',
              content: `Here are some related questions you might find helpful:\n\n${data.answer.suggested_questions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}`,
              timestamp: new Date()
            }
            setMessages(prev => [...prev, suggestionsMessage])
          }, 1000)
        }
      } else {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: data.error || 'Sorry, I encountered an error processing your request.',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMessage])
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'I encountered a technical issue. Please try rephrasing your question or try again in a moment.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  // Show email capture first
  if (!hasEmail) {
    return (
      <EmailCapture
        onSubmit={handleEmailSubmit}
        title="Welcome to Chat Assistant"
        subtitle="Ask healthcare questions with AI guidance"
      />
    )
  }

  return (
    <div className="min-h-screen bg-wyng-light-gradient">
      {/* Header */}
      <div className="guardian-header border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center text-xl font-bold text-gray-900 hover:text-wyng transition-colors">
            <Home className="h-5 w-5 mr-2" />
            Wyng Lite
          </Link>
          <div className="flex items-center text-sm text-gray-600">
            <Shield className="h-4 w-4 mr-2 text-wyng" />
            AI Healthcare Assistant
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="max-w-4xl mx-auto p-4">
        <div className="guardian-card min-h-[600px] flex flex-col fade-in">
          {/* Chat Header */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="p-3 bg-wyng-gradient rounded-xl mr-4">
                  <MessageCircle className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Healthcare Chat Assistant</h1>
                  <p className="text-sm text-gray-600">Logged in as: {userEmail}</p>
                </div>
              </div>
              <Link href="/analyzer" className="text-sm text-wyng hover:underline flex items-center">
                <Upload className="h-4 w-4 mr-1" />
                Upload Documents
              </Link>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 p-6 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 mt-20">
                <div className="p-4 bg-wyng-light rounded-xl mb-6 inline-flex">
                  <MessageCircle className="h-12 w-12 text-wyng" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Ask Your Healthcare Questions</h2>
                <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
                  Get instant, evidence-based answers to complex healthcare questions with policy citations and actionable guidance.
                </p>

                <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto mb-8">
                  <div className="p-4 bg-white rounded-lg border border-gray-100">
                    <h3 className="font-semibold text-gray-900 mb-2">Insurance & Coverage</h3>
                    <ul className="text-left text-sm text-gray-600 space-y-1">
                      <li>• EOB explanations & claim denials</li>
                      <li>• Network status & out-of-network costs</li>
                      <li>• Deductibles, copays, and coinsurance</li>
                    </ul>
                  </div>
                  <div className="p-4 bg-white rounded-lg border border-gray-100">
                    <h3 className="font-semibold text-gray-900 mb-2">Billing & Appeals</h3>
                    <ul className="text-left text-sm text-gray-600 space-y-1">
                      <li>• No Surprises Act protections</li>
                      <li>• Medical bill errors & overcharges</li>
                      <li>• Appeal processes & deadlines</li>
                    </ul>
                  </div>
                </div>

                <p className="text-sm text-wyng font-medium">
                  Powered by 91 answer cards with comprehensive policy citations
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] ${
                        message.type === 'user'
                          ? 'bg-wyng-gradient text-white rounded-xl p-4'
                          : 'bg-white border border-gray-100 rounded-xl p-4'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{message.content}</div>

                      {/* Citations for assistant messages */}
                      {message.type === 'assistant' && message.citations && message.citations.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <h4 className="font-semibold text-gray-900 text-sm mb-2">Policy Citations:</h4>
                          <div className="space-y-2">
                            {message.citations.map((citation, index) => (
                              <div key={index} className="bg-gray-50 p-3 rounded-lg text-sm">
                                <div className="font-medium text-gray-900">{citation.title}</div>
                                <div className="text-xs text-gray-600 mt-1">Authority: {citation.authority}</div>
                                <div className="text-xs text-gray-700 mt-2">{citation.citation}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div
                        className={`text-xs mt-2 ${
                          message.type === 'user' ? 'text-white opacity-75' : 'text-gray-500'
                        }`}
                      >
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] bg-white border border-gray-100 rounded-xl p-4">
                      <div className="flex items-center text-gray-500">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-wyng mr-2" />
                        Searching knowledge base and analyzing with QAKB system...
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-100 p-4">
            <form onSubmit={handleSubmit} className="flex gap-3">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about your healthcare coverage, bills, insurance questions, or policy details..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wyng focus:border-transparent"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="btn-wyng-gradient px-6 py-3 inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            <div className="mt-2 text-xs text-gray-500 text-center">
              This assistant provides educational information only, not legal or medical advice.
            </div>
          </div>
        </div>

        {/* Promotion Card */}
        <div className="guardian-card p-6 mt-6 fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="mb-4 md:mb-0">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Need Document Analysis Too?</h3>
              <p className="text-gray-600">Upload your medical bills and EOBs for comprehensive error detection.</p>
            </div>
            <Link href="/analyzer" className="btn-wyng-gradient px-6 py-3 inline-flex items-center">
              <Upload className="h-4 w-4 mr-2" />
              Try Bill Analyzer
              <ChevronRight className="h-4 w-4 ml-2" />
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-4xl mx-auto px-4 py-8 text-center text-sm text-gray-500">
        <p>
          Powered by comprehensive healthcare knowledge base with authority-ordered citations.
          <br />
          Sources: Federal regulations → CMS guidelines → State DOI policies → Payer contracts
        </p>
      </div>
    </div>
  )
}