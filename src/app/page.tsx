'use client'

import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { Badge } from '@/components/ui/badge'
import { MessageCircle, FileText } from 'lucide-react'
import { SearchShell } from '@/components/SearchShell'

export default function HomePage() {

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

          {/* Unified Search Interface */}
          <SearchShell className="mb-12" />

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