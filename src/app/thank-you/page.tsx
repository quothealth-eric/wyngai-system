'use client'

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Shield, Heart, CheckCircle, ArrowRight } from "lucide-react"

// Force dynamic rendering to avoid static generation timeout
export const dynamic = 'force-dynamic'

export default function ThankYouPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="flex items-center space-x-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold text-primary">Wyng Lite</span>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center">
          {/* Success Icon */}
          <div className="flex justify-center mb-8">
            <div className="relative">
              <Heart className="h-24 w-24 text-green-500" />
              <CheckCircle className="h-8 w-8 text-green-600 absolute -bottom-1 -right-1 bg-white rounded-full" />
            </div>
          </div>

          {/* Main Message */}
          <h1 className="text-4xl font-bold text-gray-900 mb-6">
            Thank You!
          </h1>

          <p className="text-xl text-gray-600 mb-8">
            Your support helps us continue developing Wyng Lite and providing free healthcare guidance
            to people who need it most.
          </p>

          {/* What Happens Next */}
          <Card className="mb-8">
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">What happens next?</h2>
              <div className="space-y-4 text-left">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700">
                    You'll receive an email confirmation with your donation receipt
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700">
                    Your donation will be used to improve Wyng Lite and develop new features
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700">
                    You can continue using Wyng Lite anytime for free healthcare guidance
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Impact Message */}
          <div className="bg-blue-50 rounded-lg p-6 mb-8">
            <h3 className="text-lg font-semibold text-blue-900 mb-3">Your Impact</h3>
            <p className="text-blue-800 leading-relaxed">
              Healthcare billing affects millions of Americans every year. Your donation helps us build
              better tools to make healthcare more transparent and accessible for everyone.
              Together, we're making a difference. ❤️
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/chat">
              <Button size="lg" className="w-full sm:w-auto">
                Continue Using Wyng Lite
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                Back to Home
              </Button>
            </Link>
          </div>

          {/* Social Sharing (Optional) */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-4">
              Help others discover Wyng Lite
            </p>
            <div className="flex justify-center space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const text = "Just used Wyng Lite to understand my medical bill - it's free and really helpful!"
                  const url = window.location.origin
                  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`)
                }}
              >
                Share on Twitter
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: 'Wyng Lite - Healthcare Guardian Angel',
                      text: 'Free tool to understand medical bills and insurance claims',
                      url: window.location.origin,
                    })
                  } else {
                    navigator.clipboard.writeText(window.location.origin)
                    alert('Link copied to clipboard!')
                  }
                }}
              >
                Share Link
              </Button>
            </div>
          </div>

          {/* Footer Message */}
          <div className="mt-16">
            <p className="text-sm text-gray-500">
              Questions about your donation? Email us at support@quothealth.com
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}