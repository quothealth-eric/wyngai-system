'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function ChatPage() {
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
      // Here we would integrate with the QAKB system at /api/chat/analyze
      const response = await fetch('/api/chat/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case: {
            caseId: `case_${Date.now()}`,
            artifacts: [],
            narrative: { text: inputValue.trim() }
          }
        })
      })

      const data = await response.json()

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: data.success ? data.answer?.answer || 'I can help you with your healthcare question.' : 'Sorry, I encountered an error processing your request.',
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'The QAKB system is ready to help with your healthcare questions. Please try again.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-600">
            Wyng Lite
          </Link>
          <div className="text-sm text-gray-600">
            QAKB-Powered Healthcare Assistant
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-lg shadow-sm border min-h-[600px] flex flex-col">
          {/* Messages */}
          <div className="flex-1 p-6 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 mt-20">
                <h2 className="text-2xl font-semibold mb-4">Healthcare Q&A Assistant</h2>
                <p className="mb-4">Ask me about:</p>
                <ul className="text-left inline-block space-y-2">
                  <li>• Reading your EOB (Explanation of Benefits)</li>
                  <li>• Understanding claim denials and appeals</li>
                  <li>• No Surprises Act protections</li>
                  <li>• Insurance costs and deductibles</li>
                  <li>• Provider networks and coverage</li>
                </ul>
                <p className="mt-6 text-sm text-blue-600">
                  Powered by QAKB with 91 answer cards and policy citations
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] p-3 rounded-lg ${
                        message.type === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{message.content}</div>
                      <div
                        className={`text-xs mt-1 ${
                          message.type === 'user' ? 'text-blue-100' : 'text-gray-500'
                        }`}
                      >
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[70%] p-3 rounded-lg bg-gray-100">
                      <div className="text-gray-500">Analyzing with QAKB system...</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="border-t p-4">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about your healthcare coverage, bills, or insurance questions..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </form>
            <div className="mt-2 text-xs text-gray-500 text-center">
              This assistant provides educational information only, not legal or medical advice.
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-4xl mx-auto px-4 py-8 text-center text-sm text-gray-500">
        <p>
          Powered by QAKB system with comprehensive healthcare knowledge base.
          <br />
          Citations sourced from Federal regulations, CMS, State DOI, and payer policies.
        </p>
      </div>
    </div>
  )
}