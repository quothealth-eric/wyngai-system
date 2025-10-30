'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MessageCircle, FileText, HelpCircle } from 'lucide-react'
import { type Intent } from '@/lib/intent/router'

interface ClarifierAction {
  label: string
  value: Intent
  description: string
}

interface ClarifierProps {
  suggestions: ClarifierAction[]
  onChoice: (intent: Intent) => void
  reason?: string
}

export function Clarifier({ suggestions, onChoice, reason }: ClarifierProps) {
  const getActionIcon = (intent: Intent) => {
    switch (intent) {
      case 'insurance':
        return <MessageCircle className="h-5 w-5 text-blue-500" />
      case 'legislation':
        return <FileText className="h-5 w-5 text-green-500" />
      case 'file_analysis':
        return <FileText className="h-5 w-5 text-purple-500" />
      case 'mixed':
      default:
        return <HelpCircle className="h-5 w-5 text-yellow-500" />
    }
  }

  const getActionColor = (intent: Intent) => {
    switch (intent) {
      case 'insurance':
        return 'border-blue-200 hover:border-blue-300 hover:bg-blue-50'
      case 'legislation':
        return 'border-green-200 hover:border-green-300 hover:bg-green-50'
      case 'file_analysis':
        return 'border-purple-200 hover:border-purple-300 hover:bg-purple-50'
      case 'mixed':
      default:
        return 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
    }
  }

  return (
    <Card className="w-full border-yellow-200 bg-yellow-50">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <HelpCircle className="h-6 w-6 text-yellow-600" />
            <div>
              <h3 className="font-semibold text-gray-900">
                What would you like to do?
              </h3>
              {reason && (
                <p className="text-sm text-gray-600 mt-1">
                  {reason}
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {suggestions.map((action, index) => (
              <Button
                key={index}
                variant="outline"
                onClick={() => onChoice(action.value)}
                className={`h-auto p-4 text-left justify-start ${getActionColor(action.value)}`}
              >
                <div className="flex items-start gap-3 w-full">
                  <div className="flex-shrink-0 mt-0.5">
                    {getActionIcon(action.value)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900">
                      {action.label}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {action.description}
                    </div>
                  </div>
                </div>
              </Button>
            ))}
          </div>

          {/* Helper text */}
          <div className="text-xs text-gray-500 text-center pt-2 border-t border-yellow-200">
            You can also continue typing to refine your request
          </div>
        </div>
      </CardContent>
    </Card>
  )
}