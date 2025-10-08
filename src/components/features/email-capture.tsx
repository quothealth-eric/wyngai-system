import * as React from "react"
import { useState, useEffect } from "react"
import { Shield, Mail, ChevronRight, AlertCircle } from "lucide-react"

export interface EmailCaptureProps {
  onSubmit?: (email: string) => void
  title?: string
  subtitle?: string
}

export const EmailCapture: React.FC<EmailCaptureProps> = ({
  onSubmit,
  title = "Welcome to Wyng Lite",
  subtitle = "Your Healthcare Guardian Angel"
}) => {
  const [email, setEmail] = useState("")
  const [isValidating, setIsValidating] = useState(false)
  const [error, setError] = useState("")
  const [showReturnUserMessage, setShowReturnUserMessage] = useState(false)

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      setError("Please enter your email address")
      return
    }

    if (!validateEmail(email)) {
      setError("Please enter a valid email address")
      return
    }

    setIsValidating(true)
    setError("")

    try {
      // Check email gate
      const response = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim() })
      })

      const result = await response.json()

      if (!result.emailOk) {
        setShowReturnUserMessage(true)
        return
      }

      // Email is valid and allowed, proceed
      onSubmit?.(email.toLowerCase().trim())
    } catch (error) {
      console.error('Email validation error:', error)
      // Fail open - allow access if validation fails
      onSubmit?.(email.toLowerCase().trim())
    } finally {
      setIsValidating(false)
    }
  }

  if (showReturnUserMessage) {
    return (
      <div className="min-h-screen bg-wyng-light-gradient flex items-center justify-center p-4">
        <div className="guardian-card max-w-md w-full p-8 text-center fade-in">
          <div className="p-4 bg-yellow-50 rounded-xl mb-6 inline-flex">
            <AlertCircle className="h-8 w-8 text-yellow-600" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome Back!</h2>

          <p className="text-gray-700 mb-8">
            You've already used the Wyng Lite free experience. You can sign up for the full version to unlock unlimited access.
          </p>

          <div className="space-y-4">
            <button
              onClick={() => window.open('https://www.mywyng.co', '_blank')}
              className="btn-wyng-gradient w-full px-6 py-3 inline-flex items-center justify-center"
            >
              Get Full Wyng Access
              <ChevronRight className="h-4 w-4 ml-2" />
            </button>

            <button
              onClick={() => setShowReturnUserMessage(false)}
              className="w-full px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Try Different Email
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-wyng-light-gradient flex items-center justify-center p-4">
      <div className="guardian-card max-w-md w-full p-8 fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Shield className="h-8 w-8 text-wyng mr-3" />
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          </div>
          <p className="text-gray-600">{subtitle}</p>
        </div>

        {/* Description */}
        <div className="mb-8">
          <p className="text-gray-700 text-center mb-4">
            Enter your email to access our AI-powered healthcare tools and get clear guidance on medical bills and insurance coverage.
          </p>

          <div className="bg-wyng-light rounded-lg p-4">
            <div className="flex items-center text-sm text-gray-600 mb-2">
              <ChevronRight className="h-4 w-4 text-wyng mr-2" />
              <span>AI Bill Analyzer with OCR detection</span>
            </div>
            <div className="flex items-center text-sm text-gray-600 mb-2">
              <ChevronRight className="h-4 w-4 text-wyng mr-2" />
              <span>Healthcare Chat Assistant</span>
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <ChevronRight className="h-4 w-4 text-wyng mr-2" />
              <span>Policy citations & appeal letters</span>
            </div>
          </div>
        </div>

        {/* Email Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError("")
                }}
                placeholder="Enter your email address"
                className={`w-full pl-10 pr-3 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-wyng focus:border-transparent transition-colors ${
                  error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'
                }`}
                disabled={isValidating}
                required
              />
            </div>
            {error && (
              <div className="mt-2 flex items-center text-sm text-red-600">
                <AlertCircle className="h-4 w-4 mr-1" />
                {error}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isValidating || !email.trim()}
            className="btn-wyng-gradient w-full px-6 py-3 inline-flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isValidating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Validating...
              </>
            ) : (
              <>
                Access Wyng Lite
                <ChevronRight className="h-4 w-4 ml-2" />
              </>
            )}
          </button>
        </form>

        {/* Privacy Note */}
        <p className="text-xs text-gray-500 text-center mt-6">
          We respect your privacy. Your email is only used to prevent abuse and will not be shared.
          By continuing, you agree to our{' '}
          <a href="/legal/terms" className="text-wyng hover:underline" target="_blank">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/legal/privacy" className="text-wyng hover:underline" target="_blank">
            Privacy Policy
          </a>.
        </p>
      </div>
    </div>
  )
}

export const useEmailCapture = () => {
  const [hasEmail, setHasEmail] = useState(false)
  const [userEmail, setUserEmail] = useState("")

  // Check for stored email on mount
  useEffect(() => {
    const storedEmail = sessionStorage.getItem('wyng-lite-email')
    if (storedEmail) {
      setUserEmail(storedEmail)
      setHasEmail(true)
    }
  }, [])

  const handleEmailSubmit = (email: string) => {
    setUserEmail(email)
    setHasEmail(true)
    // Store in session storage for this session
    sessionStorage.setItem('wyng-lite-email', email)
  }

  const clearEmail = () => {
    setUserEmail("")
    setHasEmail(false)
    sessionStorage.removeItem('wyng-lite-email')
  }

  return {
    hasEmail,
    userEmail,
    handleEmailSubmit,
    clearEmail
  }
}

