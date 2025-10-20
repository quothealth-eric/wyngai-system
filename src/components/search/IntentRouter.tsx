'use client'

import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MessageCircle, FileText, HelpCircle } from 'lucide-react'
import { IntentInput, IntentResult } from '@/lib/intent/router'

interface IntentRouterProps {
  onModeSelected: (mode: 'CHAT' | 'ANALYZER', input: IntentInput) => void;
}

interface ClarificationModalProps {
  result: IntentResult;
  input: IntentInput;
  onSelect: (mode: 'CHAT' | 'ANALYZER') => void;
  onCancel: () => void;
}

function ClarificationModal({ result, input, onSelect, onCancel }: ClarificationModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <HelpCircle className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">How can I help you?</h3>
          </div>

          <p className="text-gray-600 mb-6">
            I need to understand what type of help you're looking for:
          </p>

          <div className="space-y-3">
            {result.clarificationOptions?.map((option, index) => (
              <Button
                key={index}
                variant="outline"
                className="w-full p-4 h-auto text-left flex items-start gap-3"
                onClick={() => onSelect(option.value)}
              >
                {option.value === 'ANALYZER' ? (
                  <FileText className="h-5 w-5 mt-0.5 text-primary" />
                ) : (
                  <MessageCircle className="h-5 w-5 mt-0.5 text-primary" />
                )}
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{option.label}</div>
                  <div className="text-sm text-gray-500 mt-1">{option.description}</div>
                </div>
              </Button>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t">
            <Button variant="ghost" onClick={onCancel} className="w-full">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function IntentRouter({ onModeSelected }: IntentRouterProps) {
  const [clarification, setClarification] = useState<{
    result: IntentResult;
    input: IntentInput;
  } | null>(null)

  const handleClarificationNeeded = useCallback((result: IntentResult, input: IntentInput) => {
    setClarification({ result, input })
  }, [])

  const handleClarificationSelect = useCallback((mode: 'CHAT' | 'ANALYZER') => {
    if (clarification) {
      onModeSelected(mode, clarification.input)
      setClarification(null)
    }
  }, [clarification, onModeSelected])

  const handleClarificationCancel = useCallback(() => {
    setClarification(null)
  }, [])

  const handleDirectIntent = useCallback((input: IntentInput, result: IntentResult) => {
    onModeSelected(result.mode, input)
  }, [onModeSelected])

  return (
    <>
      {/* Main content would be handled by parent */}

      {/* Clarification Modal */}
      {clarification && (
        <ClarificationModal
          result={clarification.result}
          input={clarification.input}
          onSelect={handleClarificationSelect}
          onCancel={handleClarificationCancel}
        />
      )}
    </>
  )
}