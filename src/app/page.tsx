'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { MessageCircle, FileText, HelpCircle, User, LogOut } from 'lucide-react'
import { SearchShell } from '@/components/SearchShell'
import { AuthModal } from '@/components/AuthModal'
import { useAuth } from '@/contexts/AuthContext'

export default function HomePage() {
  const { user, isAuthenticated, signOut } = useAuth()
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white px-4 py-3">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Logo className="text-lg" />
            <span className="text-xl font-bold text-primary">WyngAI</span>
          </Link>

          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600 hidden sm:block">
              Your Healthcare Guardian Angel
            </div>

            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4" />
                  <span className="text-gray-600">{user?.email}</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-1" />
                  Sign Out
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAuthMode('signin')
                    setAuthModalOpen(true)
                  }}
                >
                  Sign In
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setAuthMode('signup')
                    setAuthModalOpen(true)
                  }}
                >
                  Sign Up
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        mode={authMode}
        onSuccess={() => setAuthModalOpen(false)}
      />

      {/* Main Content */}
      <main className="flex-1">
        <div className="container mx-auto py-12 sm:py-20">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
              Ask Wyng anything about
              <br />
              <span className="text-primary">health insurance</span>
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Get instant answers about your coverage, analyze medical bills,
              and understand your insurance like never before.
            </p>
          </div>

          {/* Unified Search Interface */}
          <SearchShell className="mb-12" />

          {/* New Features Spotlight */}
          <div className="max-w-5xl mx-auto mt-12">
            <div className="text-center mb-8">
              <Badge variant="default" className="mb-4">✨ NEW FEATURES</Badge>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                WyngAI Phase 1 - Now Available
              </h3>
              <p className="text-gray-600">
                Six powerful new tools to simplify your healthcare experience
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Quick Explainer</h4>
                <p className="text-sm text-gray-600">
                  Get 3-bullet insights from any medical bill or EOB in under 10 seconds
                </p>
              </div>

              <div className="p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                  <HelpCircle className="h-5 w-5 text-green-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Coverage Wizard</h4>
                <p className="text-sm text-gray-600">
                  Smart guidance for choosing between employer and marketplace insurance
                </p>
              </div>

              <div className="p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                <div className="h-10 w-10 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <MessageCircle className="h-5 w-5 text-purple-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Policy Pulse</h4>
                <p className="text-sm text-gray-600">
                  Stay updated with "what changed this week?" in healthcare policy
                </p>
              </div>

              <div className="p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                <div className="h-10 w-10 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                  <User className="h-5 w-5 text-orange-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Network Finder</h4>
                <p className="text-sm text-gray-600">
                  Find in-network providers with NPI-aware search and call scripts
                </p>
              </div>

              <div className="p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                <div className="h-10 w-10 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                  <FileText className="h-5 w-5 text-red-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Appeal Studio</h4>
                <p className="text-sm text-gray-600">
                  Generate professional appeal letters for claim denials
                </p>
              </div>

              <div className="p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                <div className="h-10 w-10 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
                  <FileText className="h-5 w-5 text-teal-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Case Locker</h4>
                <p className="text-sm text-gray-600">
                  Save and organize your healthcare documents with magic links
                </p>
              </div>
            </div>
          </div>

          {/* Getting Started Guide */}
          <div className="max-w-3xl mx-auto mt-16 p-8 bg-blue-50 rounded-xl border border-blue-200">
            <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">
              🚀 How to Get Started
            </h3>
            <div className="space-y-4">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">1</div>
                <div>
                  <h4 className="font-semibold text-gray-900">Ask Any Question</h4>
                  <p className="text-sm text-gray-600">Type insurance questions like "What's my deductible?" or "Is this covered?"</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
                <div>
                  <h4 className="font-semibold text-gray-900">Upload Documents</h4>
                  <p className="text-sm text-gray-600">Drag & drop medical bills, EOBs, or insurance cards for instant analysis</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">3</div>
                <div>
                  <h4 className="font-semibold text-gray-900">Get Actionable Results</h4>
                  <p className="text-sm text-gray-600">Receive detailed explanations, error detection, and next steps to save money</p>
                </div>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="max-w-4xl mx-auto mt-20">
            <div className="text-center mb-12">
              <HelpCircle className="h-12 w-12 text-primary mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-lg text-gray-600">
                Get quick answers to common healthcare insurance questions
              </p>
            </div>

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="what-is-wyng">
                <AccordionTrigger className="text-left">
                  What is WyngAI and how can it help me?
                </AccordionTrigger>
                <AccordionContent>
                  WyngAI is your healthcare guardian angel - an AI-powered assistant that helps you understand your health insurance, analyze medical bills, and navigate healthcare costs. We provide instant answers about coverage, detect billing errors, and help you save money on healthcare expenses.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="bill-analysis">
                <AccordionTrigger className="text-left">
                  How does the medical bill analysis work?
                </AccordionTrigger>
                <AccordionContent>
                  Simply upload your medical bills, EOBs, or insurance statements. Our AI analyzes them using 18 comprehensive rules to detect errors, overcharges, duplicate services, and coding mistakes. We'll show you potential savings and provide actionable recommendations to dispute incorrect charges.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="accuracy">
                <AccordionTrigger className="text-left">
                  How accurate is the information provided?
                </AccordionTrigger>
                <AccordionContent>
                  Our AI is trained on authoritative healthcare and insurance sources, but we always recommend verifying information with your insurance company and healthcare providers. WyngAI provides general guidance, not legal or medical advice, and should be used as a starting point for your research.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="data-security">
                <AccordionTrigger className="text-left">
                  Is my personal and medical information secure?
                </AccordionTrigger>
                <AccordionContent>
                  Yes, we take data security seriously. All uploaded documents are processed securely and we follow strict privacy protocols. We don't store your personal medical information permanently and use encryption to protect your data during processing.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="cost">
                <AccordionTrigger className="text-left">
                  Is WyngAI free to use?
                </AccordionTrigger>
                <AccordionContent>
                  WyngAI Lite is currently free to use as a preview of our capabilities. You can ask questions about insurance and analyze medical bills without any cost. Premium features with advanced analytics and personalized guidance will be available soon.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="insurance-types">
                <AccordionTrigger className="text-left">
                  What types of insurance plans does WyngAI support?
                </AccordionTrigger>
                <AccordionContent>
                  WyngAI works with all major insurance plan types including HMO, PPO, EPO, POS, and High Deductible Health Plans (HDHP). We can help with Medicare, Medicaid, marketplace plans, and employer-sponsored insurance across all states.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="savings">
                <AccordionTrigger className="text-left">
                  How much money can I save using WyngAI?
                </AccordionTrigger>
                <AccordionContent>
                  Savings vary by case, but our users commonly find billing errors worth hundreds or thousands of dollars. We've helped people identify overcharges, duplicate services, incorrect coding, and out-of-network charges that shouldn't apply. Even finding one error can pay for itself many times over.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="getting-started">
                <AccordionTrigger className="text-left">
                  How do I get started with WyngAI?
                </AccordionTrigger>
                <AccordionContent>
                  Simply type any insurance question in the search box above or upload medical bills for analysis. You can ask about coverage, deductibles, prior authorization, or any healthcare cost question. For bill analysis, just drag and drop your documents or take photos with your phone.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center text-sm text-gray-500">
            <p className="mb-2">
              WyngAI provides general information, not legal or medical advice.
              Always verify information with your insurance company and healthcare providers.
            </p>
            <p className="text-xs">
              ✨ This is a free preview of WyngAI's capabilities. Premium features coming soon!
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}