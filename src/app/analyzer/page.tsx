'use client'

import Link from 'next/link'

// Inline analyzer fallback
const EOBAnalyzer = () => (
  <div className="container mx-auto p-6">
    <div className="border rounded-lg p-8 text-center">
      <h1 className="text-2xl font-bold mb-4">Medical Bill Analyzer</h1>
      <p className="text-gray-600 mb-6">
        Our dual-vendor OCR consensus system is being deployed. This will provide enhanced accuracy for medical bill analysis.
      </p>
      <Link
        href="/"
        className="inline-block px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
      >
        Return to Home
      </Link>
    </div>
  </div>
)

export default function AnalyzerPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <EOBAnalyzer />
    </div>
  )
}