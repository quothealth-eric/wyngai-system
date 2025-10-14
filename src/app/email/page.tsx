'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Heart, Mail, CheckCircle, Clock } from 'lucide-react'
import Image from 'next/image'

export default function EmailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const caseId = searchParams.get('caseId')

  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!caseId) {
      router.push('/upload')
    }
  }, [caseId, router])

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!caseId) {
      alert('No case session found')
      return
    }

    if (!email || !validateEmail(email)) {
      alert('Please enter a valid email address')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/case/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          email: email.trim()
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error)
      }

      console.log('✅ Email captured successfully:', result)
      setSubmitted(true)

      // Redirect after 3 seconds
      setTimeout(() => {
        window.location.href = 'https://www.mywyng.co'
      }, 3000)

    } catch (error) {
      console.error('Email capture failed:', error)
      alert('Failed to save email: ' + (error instanceof Error ? error.message : 'Unknown error'))
      setIsSubmitting(false)
    }
  }

  if (!caseId) {
    return <div>Redirecting...</div>
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-wyng-light-gradient flex items-center justify-center">
        <div className="container mx-auto px-4 py-8 max-w-md text-center">
          <Card className="border-2 border-primary shadow-xl">
            <CardContent className="pt-8 pb-8">
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <CheckCircle className="h-16 w-16 text-green-500" />
                  <div className="absolute -top-2 -right-2">
                    <Heart className="h-6 w-6 text-primary animate-pulse" />
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Thank You!
              </h2>

              <div className="space-y-4 text-gray-600">
                <p className="flex items-center justify-center gap-2">
                  <Clock className="h-4 w-4" />
                  Your analysis will be completed within 24-48 hours
                </p>

                <p className="flex items-center justify-center gap-2">
                  <Mail className="h-4 w-4" />
                  Results will be sent to: {email}
                </p>

                <div className="bg-primary/10 p-4 rounded-lg">
                  <p className="text-sm font-medium text-primary">
                    What happens next:
                  </p>
                  <ul className="text-sm mt-2 space-y-1">
                    <li>• Our medical billing experts will review your documents</li>
                    <li>• We'll identify errors, overcharges, and billing violations</li>
                    <li>• You'll receive a detailed report with action steps</li>
                    <li>• Phone scripts and appeal letters will be provided if needed</li>
                  </ul>
                </div>
              </div>

              <div className="text-sm text-gray-500 mt-6">
                Redirecting to mywyng.co in 3 seconds...
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Image src="/images/wyng-logo.svg" alt="Wyng" width={32} height={32} />
            <span className="text-2xl font-bold text-primary">Wyng Lite</span>
          </div>
          <div className="text-sm text-gray-500">
            Step 3 of 3: Get Your Results
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <Heart className="h-16 w-16 text-primary" />
              <div className="absolute -top-1 -right-1">
                <Mail className="h-6 w-6 text-accent bg-white rounded-full p-1" />
              </div>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Almost Done!
          </h1>
          <p className="text-lg text-gray-600">
            We'll analyze your documents and send you a detailed report via email within 24-48 hours.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Where should we send your results?</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Address *
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>

              <div className="bg-gray-50 p-4 rounded-lg text-sm">
                <h4 className="font-medium text-gray-900 mb-2">What you'll receive:</h4>
                <ul className="space-y-1 text-gray-600">
                  <li>• Detailed analysis of billing errors and overcharges</li>
                  <li>• Explanation of insurance processing issues</li>
                  <li>• Phone scripts for calling providers and insurers</li>
                  <li>• Appeal letter templates if needed</li>
                  <li>• Step-by-step action plan</li>
                </ul>
              </div>

              <Button
                type="submit"
                disabled={!email || !validateEmail(email) || isSubmitting}
                className="w-full btn-wyng-gradient text-white text-lg py-3"
                size="lg"
              >
                {isSubmitting ? 'Sending...' : 'Send My Analysis'}
              </Button>

              <p className="text-xs text-center text-gray-500">
                By submitting, you agree to receive your analysis results via email.
                We'll never spam you or share your information.
              </p>
            </form>
          </CardContent>
        </Card>

        <div className="text-center mt-6">
          <p className="text-sm text-gray-600">
            Want the full Wyng experience?{' '}
            <a
              href="https://www.mywyng.co"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 font-medium"
            >
              Visit mywyng.co →
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}