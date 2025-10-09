// Inline analyzer fallback
const EOBAnalyzer = () => (
  <div className="container mx-auto p-6">
    <div className="border rounded-lg p-8 text-center">
      <h1 className="text-2xl font-bold mb-4">Medical Bill Analyzer</h1>
      <p className="text-gray-600 mb-6">
        Our dual-vendor OCR consensus system is being deployed. This will provide enhanced accuracy for medical bill analysis.
      </p>
      <button
        onClick={() => window.location.href = '/'}
        className="px-4 py-2 rounded bg-blue-600 text-white"
      >
        Return to Home
      </button>
    </div>
  </div>
)
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'EOB & Medical Bill Analyzer | Wyng Lite',
  description: 'Upload your medical bills or EOBs for detailed analysis, error detection, and actionable guidance. Get phone scripts and appeal letters.',
  keywords: 'medical bill analyzer, EOB analysis, healthcare billing, insurance claims, No Surprises Act',
}

export default function AnalyzerPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <EOBAnalyzer />
    </div>
  )
}