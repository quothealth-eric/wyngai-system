'use client'

import React, { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { SearchShell } from './SearchShell'
import { IntentRouter } from './IntentRouter'
import { ChatInterface } from './ChatInterface'
import { AnalyzerInterface } from './AnalyzerInterface'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageCircle, FileText, ArrowLeft } from 'lucide-react'
import { IntentInput, IntentResult } from '@/lib/intent/types'

interface SearchPageProps {
  initialMode?: 'CHAT' | 'ANALYZER';
  onModeChange?: (mode: 'CHAT' | 'ANALYZER', input: IntentInput) => void;
}

export function SearchPage({ initialMode, onModeChange }: SearchPageProps) {
  const router = useRouter()
  const [currentMode, setCurrentMode] = useState<'CHAT' | 'ANALYZER' | null>(initialMode || null)
  const [currentInput, setCurrentInput] = useState<IntentInput | null>(null)
  const [sessionData, setSessionData] = useState<any>(null)
  const [showModeSelector, setShowModeSelector] = useState(false)

  const handleModeSelected = useCallback(async (mode: 'CHAT' | 'ANALYZER', input: IntentInput) => {
    console.log(`🎯 Mode selected: ${mode}`, input)

    setCurrentMode(mode)
    setCurrentInput(input)

    // Store session data for context
    setSessionData({
      initialInput: input,
      mode: mode,
      timestamp: new Date().toISOString(),
      userId: 'anonymous',
      chatId: `${mode.toLowerCase()}_${Date.now()}`
    })

    if (onModeChange) {
      onModeChange(mode, input)
      return
    }

    // If using the standalone page, stay on this page instead of routing
    // The unified experience keeps everything in one place
  }, [onModeChange])

  const handleClarificationNeeded = useCallback((result: IntentResult, input: IntentInput) => {
    // This will be handled by the IntentRouter component's modal
  }, [])

  const handleBackToSearch = useCallback(() => {
    setCurrentMode(null)
    setCurrentInput(null)
    setSessionData(null)
    setShowModeSelector(false)
  }, [])

  const handleModeSwitch = useCallback((newMode: 'CHAT' | 'ANALYZER') => {
    setCurrentMode(newMode)
    setShowModeSelector(false)

    if (onModeChange) {
      onModeChange(newMode, {})
    }
  }, [onModeChange])

  const renderModeHeader = () => {
    if (!currentMode) return null

    return (
      <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToSearch}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Search
          </Button>

          <div className="h-6 w-px bg-gray-300" />

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Mode:</span>
            <Badge
              variant={currentMode === 'CHAT' ? 'default' : 'secondary'}
              className="flex items-center gap-1"
            >
              {currentMode === 'CHAT' ? (
                <MessageCircle className="h-3 w-3" />
              ) : (
                <FileText className="h-3 w-3" />
              )}
              {currentMode === 'CHAT' ? 'Chat' : 'Analyzer'}
            </Badge>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowModeSelector(!showModeSelector)}
        >
          Switch Mode
        </Button>
      </div>
    )
  }

  const renderModeSelector = () => {
    if (!showModeSelector) return null

    return (
      <div className="mb-6 p-4 bg-white border rounded-lg shadow-sm">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Switch to:</h3>
        <div className="flex gap-2">
          <Button
            variant={currentMode === 'CHAT' ? 'secondary' : 'default'}
            size="sm"
            onClick={() => handleModeSwitch('CHAT')}
            className="flex items-center gap-2"
            disabled={currentMode === 'CHAT'}
          >
            <MessageCircle className="h-4 w-4" />
            Chat Mode
          </Button>
          <Button
            variant={currentMode === 'ANALYZER' ? 'secondary' : 'default'}
            size="sm"
            onClick={() => handleModeSwitch('ANALYZER')}
            className="flex items-center gap-2"
            disabled={currentMode === 'ANALYZER'}
          >
            <FileText className="h-4 w-4" />
            Analyzer Mode
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white px-4 py-3">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Logo className="text-lg" />
            <span className="text-xl font-bold text-primary">Wyng</span>
          </Link>
          <div className="text-sm text-gray-600">
            Your Healthcare Guardian Angel
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {!currentMode ? (
          // Search Landing Page
          <div className="container mx-auto py-12 sm:py-20">
            <div className="text-center mb-12">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
                Ask Wyng anything about
                <br />
                <span className="text-primary">health insurance</span>
              </h1>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Get instant answers about your coverage, analyze medical bills,
                and understand your insurance like never before.
              </p>
            </div>

            <SearchShell
              onIntent={handleModeSelected}
              onClarificationNeeded={handleClarificationNeeded}
            />

            <IntentRouter onModeSelected={handleModeSelected} />
          </div>
        ) : (
          // Mode-specific content
          <div className="container mx-auto py-8">
            {renderModeHeader()}
            {renderModeSelector()}

            <div className="bg-white rounded-lg shadow-sm border p-6">
              {currentMode === 'CHAT' && currentInput ? (
                <ChatInterface
                  initialInput={currentInput}
                  sessionData={sessionData}
                  onBackToSearch={handleBackToSearch}
                />
              ) : currentMode === 'ANALYZER' && currentInput ? (
                <AnalyzerInterface
                  initialInput={currentInput}
                  sessionData={sessionData}
                  onBackToSearch={handleBackToSearch}
                />
              ) : (
                <div className="text-center text-gray-500 py-12">
                  <p>Loading...</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center text-sm text-gray-500">
            <p className="mb-2">
              Wyng Lite provides general information, not legal or medical advice.
              Always verify information with your insurance company and healthcare providers.
            </p>
            <p className="text-xs">
              ✨ This is a free preview of Wyng's capabilities. Premium features coming soon!
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}