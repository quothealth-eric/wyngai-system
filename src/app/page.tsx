'use client'

import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Wyng Lite</h1>
          <p className="text-xl text-gray-600 mb-8">QAKB-Powered Healthcare Assistant</p>

          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <Link
              href="/chat"
              className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow"
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Chat Assistant</h2>
              <p className="text-gray-600">
                Get help with healthcare questions, billing issues, and insurance coverage using our QAKB system.
              </p>
            </Link>

            <Link
              href="/analyzer"
              className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow"
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Bill Analyzer</h2>
              <p className="text-gray-600">
                Upload and analyze your medical bills and EOBs with our comprehensive detection system.
              </p>
            </Link>
          </div>

          <div className="mt-12 text-sm text-gray-500">
            <p>Features:</p>
            <ul className="mt-2 space-y-1">
              <li>• 91 canonical answer cards with policy citations</li>
              <li>• No Surprises Act detection and guidance</li>
              <li>• Multi-document processing and analysis</li>
              <li>• Personalized checklists and phone scripts</li>
              <li>• Authority-ordered citations (Federal → CMS → State → Payer)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}