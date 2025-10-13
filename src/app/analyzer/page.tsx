'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AnalyzerPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to new upload flow
    router.replace('/upload')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Redirecting to new upload flow...</h2>
        <p className="text-gray-600">You'll be taken to our improved document upload process.</p>
      </div>
    </div>
  )
}