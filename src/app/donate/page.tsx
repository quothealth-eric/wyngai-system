'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Logo } from '@/components/ui/logo'
import { Heart, DollarSign, ArrowLeft } from 'lucide-react'

export default function DonatePage() {
  const [amount, setAmount] = useState<number>(5)
  const [email, setEmail] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const presetAmounts = [5, 10, 25, 50, 100]

  const handleDonate = async () => {
    if (amount < 1) {
      setError('Minimum donation amount is $1')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/donate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          email: email || undefined
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create donation session')
      }

      const result = await response.json()

      if (result.checkoutUrl) {
        // Redirect to Stripe checkout
        window.location.href = result.checkoutUrl
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (err) {
      console.error('Donation error:', err)
      setError('Sorry, there was an issue setting up the donation. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white px-4 py-3">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Logo size="sm" />
            <span className="text-xl font-bold text-primary">Wyng</span>
          </Link>
          <Link href="/chat" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            Back to Chat
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <Heart className="h-12 w-12 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Support Wyng's Mission</h1>
          <p className="text-lg text-gray-600">
            Help us continue developing AI-powered healthcare guidance tools that make medical billing transparent and accessible for everyone.
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-center">Choose Your Contribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Preset Amounts */}
            <div>
              <Label className="text-base font-medium mb-3 block">Quick Select</Label>
              <div className="grid grid-cols-5 gap-2">
                {presetAmounts.map((preset) => (
                  <Button
                    key={preset}
                    variant={amount === preset ? "default" : "outline"}
                    onClick={() => setAmount(preset)}
                    className="h-12"
                  >
                    ${preset}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom Amount */}
            <div>
              <Label htmlFor="amount" className="text-base font-medium">Custom Amount</Label>
              <div className="relative mt-2">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="amount"
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="pl-10 text-lg h-12"
                  placeholder="Enter amount"
                />
              </div>
            </div>

            {/* Email (Optional) */}
            <div>
              <Label htmlFor="email" className="text-base font-medium">Email (Optional)</Label>
              <p className="text-sm text-gray-500 mb-2">
                We'll send you updates about Wyng's development and early access to new features.
              </p>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12"
                placeholder="your@email.com"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {/* Donate Button */}
            <Button
              onClick={handleDonate}
              disabled={isLoading || amount < 1}
              className="w-full h-12 text-lg"
              size="lg"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Processing...
                </>
              ) : (
                <>
                  <Heart className="h-4 w-4 mr-2" />
                  Donate ${amount}
                </>
              )}
            </Button>

            {/* Security Notice */}
            <div className="text-center text-sm text-gray-500">
              <p>Secure payment powered by Stripe</p>
              <p>Your payment information is encrypted and secure</p>
            </div>
          </CardContent>
        </Card>

        {/* What Your Donation Supports */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">What Your Donation Supports</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="bg-blue-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <DollarSign className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">AI Development</h3>
              <p className="text-sm text-gray-600">
                Fund the AI models and infrastructure that power our healthcare guidance tools.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-green-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <Heart className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Free Access</h3>
              <p className="text-sm text-gray-600">
                Keep our tools free and accessible to everyone who needs healthcare guidance.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-purple-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <ArrowLeft className="h-6 w-6 text-purple-600 transform rotate-45" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Platform Growth</h3>
              <p className="text-sm text-gray-600">
                Expand our platform with new features like real-time cost estimates and financial protection.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}