'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Mail, Shield, ArrowRight } from 'lucide-react'

interface EmailCaptureProps {
  onEmailSubmit: (email: string) => void
  title?: string
  description?: string
  buttonText?: string
  featureName?: string
  isLoading?: boolean
}

export function EmailCapture({
  onEmailSubmit,
  title = "Get Started - It's Free",
  description = "Enter your email to access our healthcare guidance tools.",
  buttonText = "Continue",
  featureName = "this feature",
  isLoading = false
}: EmailCaptureProps) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      setError('Please enter your email address')
      return
    }

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address')
      return
    }

    setError('')

    try {
      // Check if email has been used before
      const response = await fetch('/api/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim() }),
      })

      const result = await response.json()

      if (!result.emailOk) {
        // User has already used the system - show redirect message
        setError(result.message || "You've already used this service.")

        // Redirect to main website after 3 seconds
        setTimeout(() => {
          window.location.href = result.redirectUrl || 'https://getwyng.co'
        }, 3000)
        return
      }

      // Email is allowed - proceed
      onEmailSubmit(email.trim())

    } catch (error) {
      console.error('Email check failed:', error)
      // On error, allow access (fail open)
      onEmailSubmit(email.trim())
    }
  }

  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  return (
    <div className="min-h-screen bg-wyng-light-gradient flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 p-3 rounded-full">
              <Mail className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">{title}</CardTitle>
          <p className="text-gray-600 mt-2">{description}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={error ? 'border-red-300' : ''}
                disabled={isLoading}
                required
              />
              {error && (
                <p className="text-red-600 text-sm mt-1">{error}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full btn-wyng-gradient"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  {buttonText}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Shield className="h-4 w-4 text-green-600" />
              <span>Your privacy is protected</span>
            </div>

            <div className="text-xs text-gray-500 space-y-1">
              <p>• We'll only use your email to provide {featureName} results</p>
              <p>• No spam, just helpful healthcare guidance</p>
              <p>• You can unsubscribe anytime</p>
            </div>

            <div className="border-t pt-4 mt-4">
              <p className="text-xs text-gray-500 text-center">
                ✨ This is <strong>Wyng Lite</strong> - a free preview of our platform.
                <br />
                <a
                  href="https://getwyng.co"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Get the full Wyng experience →
                </a>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Hook for managing email capture state
export function useEmailCapture() {
  const [hasEmail, setHasEmail] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  const handleEmailSubmit = (email: string) => {
    setUserEmail(email)
    setHasEmail(true)
  }

  const resetEmailCapture = () => {
    setHasEmail(false)
    setUserEmail('')
  }

  return {
    hasEmail,
    userEmail,
    handleEmailSubmit,
    resetEmailCapture
  }
}