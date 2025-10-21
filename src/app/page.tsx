'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Upload, MessageCircle, FileText, Search } from 'lucide-react'

export default function HomePage() {
  const router = useRouter()
  const [searchInput, setSearchInput] = useState('')
  const [dragActive, setDragActive] = useState(false)

  const handleSearch = useCallback(() => {
    if (!searchInput.trim()) return

    // Simple keyword-based routing
    const text = searchInput.toLowerCase()
    const isAnalyzerKeyword = text.includes('bill') || text.includes('analyze') || text.includes('eob') || text.includes('statement')

    if (isAnalyzerKeyword) {
      router.push(`/analyzer?q=${encodeURIComponent(searchInput)}`)
    } else {
      router.push(`/chat?q=${encodeURIComponent(searchInput)}`)
    }
  }, [searchInput, router])

  const handleFileUpload = useCallback((files: FileList) => {
    if (files.length > 0) {
      // Route to analyzer for file uploads
      router.push('/analyzer')
    }
  }, [router])

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

    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files)
    }
  }, [handleFileUpload])

  const exampleQueries = [
    { text: 'Analyze my medical bill', icon: FileText, route: '/analyzer' },
    { text: 'Explain my insurance coverage', icon: MessageCircle, route: '/chat' },
    { text: 'What is a deductible?', icon: MessageCircle, route: '/chat' },
    { text: 'Check my EOB for errors', icon: FileText, route: '/analyzer' }
  ]

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

          {/* Search Interface */}
          <div className="max-w-3xl mx-auto mb-12">
            <Card
              className={`transition-all duration-200 ${
                dragActive ? 'border-primary shadow-lg' : 'border-gray-200'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <CardContent className="p-6">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      placeholder="Ask about insurance or upload medical bills..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleSearch()
                        }
                      }}
                      className="text-lg py-3"
                    />
                  </div>
                  <Button
                    onClick={handleSearch}
                    disabled={!searchInput.trim()}
                    size="lg"
                    className="px-6"
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>

                {/* File Upload Area */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-center">
                    <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      Drag and drop medical bills here, or{' '}
                      <label className="text-primary cursor-pointer hover:underline">
                        browse files
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.png,.jpg,.jpeg,.tiff"
                          multiple
                          onChange={(e) => {
                            if (e.target.files) {
                              handleFileUpload(e.target.files)
                            }
                          }}
                        />
                      </label>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Example Queries */}
          <div className="max-w-4xl mx-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
              Try these examples:
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {exampleQueries.map((example, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="h-auto p-4 text-left justify-start"
                  onClick={() => router.push(`${example.route}?q=${encodeURIComponent(example.text)}`)}
                >
                  <example.icon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="text-sm">{example.text}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Mode Indicators */}
          <div className="max-w-2xl mx-auto mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="text-center p-6 bg-white rounded-lg border border-gray-200">
              <MessageCircle className="h-12 w-12 text-blue-500 mx-auto mb-4" />
              <h4 className="font-semibold text-gray-900 mb-2">Chat Mode</h4>
              <p className="text-sm text-gray-600">
                Ask questions about insurance coverage, benefits, and healthcare costs.
              </p>
              <Badge variant="secondary" className="mt-2">
                Questions & Answers
              </Badge>
            </div>
            <div className="text-center p-6 bg-white rounded-lg border border-gray-200">
              <FileText className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h4 className="font-semibold text-gray-900 mb-2">Analyzer Mode</h4>
              <p className="text-sm text-gray-600">
                Upload medical bills and EOBs for detailed analysis and error detection.
              </p>
              <Badge variant="secondary" className="mt-2">
                Document Analysis
              </Badge>
            </div>
          </div>
        </div>
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