'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { AlertCircle, Bot, Copy, ExternalLink, FileText, Mail, MessageSquare, Phone, User } from 'lucide-react'
import Image from 'next/image'

interface ChatResponse {
  version: string
  theme: string
  plain_english_explanation: string
  key_assumptions: string[]
  citations: Array<{
    authority: 'Federal' | 'CMS' | 'StateDOI' | 'PayerPolicy'
    source: string
    effective_date: string
    url?: string
  }>
  phone_scripts: Array<{
    who: 'Insurer' | 'Provider' | 'State DOI' | 'Facility Billing'
    goal: string
    script_lines: string[]
  }>
  appeal: {
    recommended: boolean
    letter_title?: string
    letter_body?: string
  }
  checklist: string[]
  summary: string[]
  disclaimer: string
}

export default function ChatV2Page() {
  const [email, setEmail] = useState('')
  const [question, setQuestion] = useState('')
  const [stateHint, setStateHint] = useState('')
  const [payerHint, setPayerHint] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [response, setResponse] = useState<ChatResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const states = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ]

  const payers = [
    'Aetna', 'UnitedHealthcare', 'Cigna', 'Anthem/Elevance', 'Humana',
    'Blue Cross Blue Shield', 'Kaiser Permanente', 'Medicare', 'Medicaid'
  ]

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      if (selectedFile.size > 20 * 1024 * 1024) {
        alert('File size must be under 20MB')
        return
      }
      setFile(selectedFile)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResponse(null)

    if (!email || !question) {
      setError('Email and question are required')
      return
    }

    if (question.length < 20) {
      setError('Please provide a more detailed question (at least 20 characters)')
      return
    }

    setIsSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('email', email)
      formData.append('question', question)
      if (stateHint) formData.append('state_hint', stateHint)
      if (payerHint) formData.append('payer_hint', payerHint)
      if (file) formData.append('file', file)

      const res = await fetch('/api/chat/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          question,
          state_hint: stateHint || undefined,
          payer_hint: payerHint || undefined,
          file: file ? 'present' : undefined // Simplified for now
        })
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 429) {
          setError(data.message || 'Rate limit exceeded')
          return
        }
        throw new Error(data.error || 'Failed to get response')
      }

      setResponse(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
  }

  const emailResponse = () => {
    if (!response) return

    const subject = `Wyng Lite: ${response.theme.replace('_', ' ')} - Your Healthcare Billing Analysis`
    const body = `
Your Healthcare Billing Analysis

${response.plain_english_explanation}

Phone Scripts:
${response.phone_scripts.map(script => `
${script.who}: ${script.goal}
${script.script_lines.map(line => `• ${line}`).join('\n')}
`).join('\n')}

Next Steps:
${response.checklist.map((item, i) => `${i + 1}. ${item}`).join('\n')}

Summary:
${response.summary.join('\n')}

${response.disclaimer}
    `.trim()

    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Image src="/images/wyng-logo.svg" alt="Wyng" width={32} height={32} />
            <span className="text-2xl font-bold text-primary">Wyng Lite</span>
            <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full">AI Chat v2</span>
          </div>
          <div className="text-sm text-gray-500">
            One detailed question free
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {!response ? (
          // Question Form
          <div>
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <Bot className="h-16 w-16 text-primary" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                AI Healthcare Billing Assistant
              </h1>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Get expert analysis of your healthcare billing issue with legal citations, phone scripts, and step-by-step guidance. One detailed question free.
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Describe Your Healthcare Billing Issue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <Label htmlFor="email" className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email Address *
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your.email@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="mt-1"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      We'll use this to track your one free question and can email you the response
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="question" className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Your Question *
                    </Label>
                    <Textarea
                      id="question"
                      placeholder="Describe your healthcare billing issue in detail. For example: 'I received a surprise bill from an out-of-network anesthesiologist during my surgery at an in-network hospital in California. My insurance is Blue Cross PPO and they paid the hospital but not the anesthesiologist...'"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      className="min-h-[120px] mt-1"
                      required
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      {question.length}/500 characters • Be specific about dates, providers, insurance, and what happened
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="state">Your State (Optional)</Label>
                      <select
                        id="state"
                        value={stateHint}
                        onChange={(e) => setStateHint(e.target.value)}
                        className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                      >
                        <option value="">Select state...</option>
                        {states.map(state => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="payer">Insurance Company (Optional)</Label>
                      <select
                        id="payer"
                        value={payerHint}
                        onChange={(e) => setPayerHint(e.target.value)}
                        className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                      >
                        <option value="">Select insurer...</option>
                        {payers.map(payer => (
                          <option key={payer} value={payer}>{payer}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="file" className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Upload Document (Optional)
                    </Label>
                    <input
                      id="file"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.tiff"
                      onChange={handleFileChange}
                      className="mt-1 w-full"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Upload your EOB, bill, or denial letter (PDF, JPG, PNG, TIFF • Max 20MB)
                    </p>
                    {file && (
                      <p className="text-sm text-green-600 mt-1">
                        Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                      </p>
                    )}
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-4">
                      <div className="flex items-center gap-2 text-red-800">
                        <AlertCircle className="h-4 w-4" />
                        <span className="font-medium">Error</span>
                      </div>
                      <p className="text-red-700 mt-1">{error}</p>
                    </div>
                  )}

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">What you'll get:</h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Plain-English explanation of your situation</li>
                      <li>• Legal citations and regulatory references</li>
                      <li>• Phone scripts for calling your insurer/provider</li>
                      <li>• Appeal letter template if needed</li>
                      <li>• Step-by-step action plan</li>
                      <li>• Concise summary of key resolution paths</li>
                    </ul>
                  </div>

                  <Button
                    type="submit"
                    disabled={!email || !question || question.length < 20 || isSubmitting}
                    className="w-full btn-wyng-gradient text-white text-lg py-3"
                    size="lg"
                  >
                    {isSubmitting ? 'Analyzing...' : 'Get My Analysis'}
                  </Button>

                  <p className="text-xs text-center text-gray-500">
                    By submitting, you agree to receive analysis results. Educational information only, not legal advice.
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : (
          // Response Display
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Your Healthcare Billing Analysis</h1>
                <p className="text-gray-600">Theme: {response.theme.replace('_', ' ')}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => copyToClipboard(JSON.stringify(response, null, 2))} variant="outline" size="sm">
                  <Copy className="h-4 w-4 mr-1" />
                  Copy All
                </Button>
                <Button onClick={emailResponse} variant="outline" size="sm">
                  <Mail className="h-4 w-4 mr-1" />
                  Email Me This
                </Button>
              </div>
            </div>

            {/* Explanation */}
            <Card>
              <CardHeader>
                <CardTitle>Explanation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">{response.plain_english_explanation}</p>
                {response.key_assumptions.length > 0 && (
                  <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-md p-3">
                    <p className="font-medium text-yellow-800 text-sm">Key Assumptions:</p>
                    <ul className="text-sm text-yellow-700 mt-1 space-y-1">
                      {response.key_assumptions.map((assumption, i) => (
                        <li key={i}>• {assumption}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Citations */}
            <Card>
              <CardHeader>
                <CardTitle>Legal Citations & Sources</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {response.citations.map((citation, i) => (
                    <div key={i} className="border-l-4 border-blue-500 pl-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-900">{citation.source}</p>
                          <p className="text-sm text-gray-600">{citation.authority} • Effective: {citation.effective_date}</p>
                        </div>
                        {citation.url && (
                          <a href={citation.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Phone Scripts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Phone Scripts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {response.phone_scripts.map((script, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900">{script.who}</h4>
                      <p className="text-sm text-gray-600 mb-3">Goal: {script.goal}</p>
                      <div className="space-y-2">
                        {script.script_lines.map((line, j) => (
                          <p key={j} className="text-sm bg-white p-2 rounded border-l-2 border-green-400">
                            "{line}"
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Appeal Letter */}
            {response.appeal.recommended && (
              <Card>
                <CardHeader>
                  <CardTitle>Appeal Letter</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">{response.appeal.letter_title}</h4>
                    <p className="text-gray-700 whitespace-pre-line">{response.appeal.letter_body}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Checklist */}
            <Card>
              <CardHeader>
                <CardTitle>Action Checklist</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {response.checklist.map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm flex items-center justify-center mt-0.5">
                        {i + 1}
                      </div>
                      <p className="text-gray-700">{item}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Key Takeaways</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {response.summary.map((point, i) => (
                    <li key={i} className="text-gray-700">{point}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Disclaimer */}
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
              <p className="text-sm text-gray-600">{response.disclaimer}</p>
            </div>

            <div className="text-center">
              <Button onClick={() => setResponse(null)} variant="outline">
                Ask Another Question
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}