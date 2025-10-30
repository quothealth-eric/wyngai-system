'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Sparkles, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export default function PolicyPulsePage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to enhanced version
    router.push('/policy-pulse/enhanced')
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-teal-50">
      <div className="container mx-auto px-4 py-16">
        <Card className="max-w-2xl mx-auto border-teal-100 shadow-lg">
          <CardContent className="p-12 text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-gradient-to-r from-teal-600 to-emerald-600 rounded-full flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-white" />
            </div>

            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-600 to-emerald-600 bg-clip-text text-transparent mb-3">
                Policy Pulse Enhanced
              </h1>
              <p className="text-gray-600 text-lg">
                Redirecting to the enhanced Policy Pulse experience with AI-powered bill analysis and interactive features.
              </p>
            </div>

            <div className="flex items-center justify-center space-x-6 text-sm text-gray-500">
              <div className="flex items-center">
                <TrendingUp className="h-4 w-4 mr-2 text-teal-600" />
                Enhanced Analysis
              </div>
              <div className="flex items-center">
                <Sparkles className="h-4 w-4 mr-2 text-teal-600" />
                Interactive Chat
              </div>
            </div>

            <div className="pt-6">
              <Link href="/policy-pulse/enhanced">
                <Button className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-3">
                  Continue to Enhanced Policy Pulse
                </Button>
              </Link>
            </div>

            <div className="pt-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-gray-600 hover:text-teal-600">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Home
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}