'use client'

import Link from 'next/link'
import { Shield, FileText, MessageCircle, ChevronRight } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-wyng-light-gradient">
      {/* Header */}
      <div className="guardian-header py-6">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center">
            <div className="flex items-center justify-center mb-4">
              <Shield className="h-8 w-8 text-wyng mr-3" />
              <h1 className="text-4xl font-bold text-gray-900">Wyng Lite</h1>
            </div>
            <p className="text-xl text-gray-700 mb-2">Your Healthcare Guardian Angel</p>
            <p className="text-base text-gray-600">Get clear, plain-English guidance on confusing medical bills and insurance coverage</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid lg:grid-cols-2 gap-8 mb-16">
          {/* Bill Analyzer Module */}
          <div className="guardian-card card-hover p-8 fade-in">
            <div className="flex items-center mb-6">
              <div className="p-3 bg-wyng-gradient rounded-xl mr-4">
                <FileText className="h-8 w-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">AI Bill Analyzer</h2>
                <p className="text-gray-600">OCR & Rules Engine</p>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <p className="text-gray-700">
                Upload your medical bills or EOBs for comprehensive analysis with our state-of-the-art detection system.
              </p>

              <div className="space-y-2">
                <div className="flex items-center text-sm text-gray-600">
                  <ChevronRight className="h-4 w-4 text-wyng mr-2" />
                  <span>Robust OCR extraction (PDF, images)</span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <ChevronRight className="h-4 w-4 text-wyng mr-2" />
                  <span>Detect 12+ common billing errors</span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <ChevronRight className="h-4 w-4 text-wyng mr-2" />
                  <span>Phone scripts & appeal letters</span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <ChevronRight className="h-4 w-4 text-wyng mr-2" />
                  <span>No Surprises Act compliance</span>
                </div>
              </div>
            </div>

            <Link href="/analyzer" className="btn-wyng-gradient px-6 py-3 inline-flex items-center">
              <FileText className="h-5 w-5 mr-2" />
              Analyze Documents
              <ChevronRight className="h-4 w-4 ml-2" />
            </Link>
          </div>

          {/* AI Chat Bot Module */}
          <div className="guardian-card card-hover p-8 fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center mb-6">
              <div className="p-3 bg-wyng-gradient rounded-xl mr-4">
                <MessageCircle className="h-8 w-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">AI Chat Assistant</h2>
                <p className="text-gray-600">120+ Healthcare Topics</p>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <p className="text-gray-700">
                Get instant answers to healthcare questions with our comprehensive knowledge base and semantic search.
              </p>

              <div className="space-y-2">
                <div className="flex items-center text-sm text-gray-600">
                  <ChevronRight className="h-4 w-4 text-wyng mr-2" />
                  <span>91 canonical answer cards</span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <ChevronRight className="h-4 w-4 text-wyng mr-2" />
                  <span>Multi-document context understanding</span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <ChevronRight className="h-4 w-4 text-wyng mr-2" />
                  <span>Policy citations & authorities</span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <ChevronRight className="h-4 w-4 text-wyng mr-2" />
                  <span>Actionable checklists</span>
                </div>
              </div>
            </div>

            <Link href="/chat" className="btn-wyng-gradient px-6 py-3 inline-flex items-center">
              <MessageCircle className="h-5 w-5 mr-2" />
              Start Chatting
              <ChevronRight className="h-4 w-4 ml-2" />
            </Link>
          </div>
        </div>

        {/* Features Section */}
        <div className="guardian-card p-8 fade-in" style={{ animationDelay: '0.4s' }}>
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Comprehensive Healthcare Guidance</h3>
            <p className="text-gray-600 max-w-3xl mx-auto">
              Our platform combines cutting-edge AI with deep healthcare policy knowledge to provide clear,
              actionable guidance on complex medical billing and insurance issues.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="p-4 bg-wyng-light rounded-xl mb-4 inline-flex">
                <Shield className="h-8 w-8 text-wyng" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Policy Authority</h4>
              <p className="text-sm text-gray-600">
                Citations from Federal regulations, CMS guidelines, State DOI policies, and payer contracts
              </p>
            </div>

            <div className="text-center">
              <div className="p-4 bg-wyng-light rounded-xl mb-4 inline-flex">
                <FileText className="h-8 w-8 text-wyng" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Document Analysis</h4>
              <p className="text-sm text-gray-600">
                Advanced OCR and rules engine to detect billing errors and compliance issues
              </p>
            </div>

            <div className="text-center">
              <div className="p-4 bg-wyng-light rounded-xl mb-4 inline-flex">
                <MessageCircle className="h-8 w-8 text-wyng" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Plain English</h4>
              <p className="text-sm text-gray-600">
                Complex healthcare regulations explained in clear, actionable language
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center mt-12 fade-in" style={{ animationDelay: '0.6s' }}>
          <p className="text-sm text-gray-500 mb-4">
            Experience the power of AI-driven healthcare advocacy
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/analyzer" className="btn-wyng-gradient px-8 py-3 inline-flex items-center justify-center">
              Try Bill Analyzer
            </Link>
            <Link href="/chat" className="bg-white border-2 border-wyng text-wyng px-8 py-3 rounded-xl font-medium hover:bg-wyng-light transition-colors inline-flex items-center justify-center">
              Ask a Question
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}