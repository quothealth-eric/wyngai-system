import { EOBAnalyzer } from '@/components/features/eob-analyzer'
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