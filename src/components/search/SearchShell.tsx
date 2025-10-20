'use client'

import React, { useState, useRef, useCallback } from 'react'
import { Upload, Search, FileText, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { intentRouter, IntentInput, IntentResult } from '@/lib/intent/router'

interface SearchShellProps {
  onIntent: (input: IntentInput, result: IntentResult) => void;
  onClarificationNeeded: (result: IntentResult, input: IntentInput) => void;
}

export function SearchShell({ onIntent, onClarificationNeeded }: SearchShellProps) {
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const examples = intentRouter.getExamples()
  const allExamples = [...examples.chat, ...examples.analyzer]

  const handleSubmit = useCallback(async (input: IntentInput) => {
    setIsProcessing(true)

    try {
      const result = intentRouter.classify(input)

      if (result.needsClarification) {
        onClarificationNeeded(result, input)
      } else {
        onIntent(input, result)
      }
    } catch (error) {
      console.error('Error classifying intent:', error)
    } finally {
      setIsProcessing(false)
    }
  }, [onIntent, onClarificationNeeded])

  const handleSearch = useCallback(() => {
    if (!query.trim() && files.length === 0) return

    handleSubmit({
      text: query.trim() || undefined,
      files: files.length > 0 ? files : undefined
    })
  }, [query, files, handleSubmit])

  const handleExampleClick = useCallback((example: string) => {
    setQuery(example)
    handleSubmit({
      text: example,
      hints: {
        userClickedChat: examples.chat.includes(example),
        userClickedUpload: examples.analyzer.includes(example)
      }
    })
  }, [examples, handleSubmit])

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || [])
    setFiles(prev => [...prev, ...selectedFiles])
  }, [])

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)

    const droppedFiles = Array.from(event.dataTransfer.files)
    setFiles(prev => [...prev, ...droppedFiles])
  }, [])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleQuickAction = useCallback((action: 'upload' | 'chat') => {
    if (action === 'upload') {
      handleSubmit({
        text: query.trim() || undefined,
        files: files.length > 0 ? files : undefined,
        hints: { userClickedUpload: true }
      })
    } else {
      handleSubmit({
        text: query.trim() || undefined,
        hints: { userClickedChat: true }
      })
    }
  }, [query, files, handleSubmit])

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      {/* Main Search Input */}
      <div className="relative mb-6">
        <div
          className={`relative border-2 rounded-lg transition-colors ${
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-gray-200 hover:border-gray-300 focus-within:border-primary'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask Wyng anything about health insurance or upload a bill for review…"
            className="w-full min-h-[80px] resize-none border-0 focus:ring-0 text-base sm:text-lg p-4 pr-16"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSearch()
              }
            }}
          />

          {/* Search Button */}
          <Button
            onClick={handleSearch}
            disabled={!query.trim() && files.length === 0 || isProcessing}
            className="absolute right-3 bottom-3 p-2 h-auto"
            size="sm"
          >
            <Search className="h-5 w-5" />
          </Button>

          {/* Drag Overlay */}
          {isDragOver && (
            <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center">
              <div className="text-center">
                <Upload className="h-8 w-8 mx-auto text-primary mb-2" />
                <p className="text-primary font-medium">Drop your bill or EOB here</p>
              </div>
            </div>
          )}
        </div>

        {/* File Upload Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.heic,.heif"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Uploaded Files Display */}
        {files.length > 0 && (
          <div className="mt-3 space-y-2">
            {files.map((file, index) => (
              <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded border">
                <FileText className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-700 flex-1">{file.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(index)}
                  className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Example Chips */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2 justify-center">
          {allExamples.map((example, index) => (
            <button
              key={index}
              onClick={() => handleExampleClick(example)}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
              disabled={isProcessing}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex justify-center gap-4 mb-8">
        <Button
          variant="outline"
          onClick={handleUploadClick}
          disabled={isProcessing}
          className="flex items-center gap-2"
        >
          <Upload className="h-4 w-4" />
          Upload Bill/EOB
        </Button>
        <Button
          variant="outline"
          onClick={() => handleQuickAction('chat')}
          disabled={isProcessing}
          className="flex items-center gap-2"
        >
          <MessageCircle className="h-4 w-4" />
          Ask a Question
        </Button>
      </div>

      {/* Drag-and-Drop Hint */}
      <div className="text-center text-sm text-gray-500 mb-4">
        You can also drag and drop bills or EOBs anywhere on this page
      </div>

      {/* Privacy Line */}
      <div className="text-center text-xs text-gray-400">
        We never sell your data. Documents encrypted. Not legal advice.
      </div>
    </div>
  )
}