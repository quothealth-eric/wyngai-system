'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { InsuranceModal } from '@/components/features/insurance-modal'
import { LeadCapture } from '@/components/features/lead-capture'
import { EmailCapture, useEmailCapture } from '@/components/features/email-capture'
import { Logo } from '@/components/ui/logo'
import { Shield, Send, AlertTriangle, DollarSign, Heart, X, Upload, FileText } from 'lucide-react'
import { BenefitsData, LeadData, LLMResponse, leadSchema } from '@/lib/validations'
import { trackEvent } from '@/lib/analytics'

interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: Date
  llmResponse?: LLMResponse
}

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  status: 'uploading' | 'completed' | 'error'
  progress?: number
  ocrText?: string
}

export default function ChatPage() {
  const { hasEmail, userEmail, handleEmailSubmit } = useEmailCapture()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [benefits, setBenefits] = useState<BenefitsData>({})
  const [hasAgreedToTerms, setHasAgreedToTerms] = useState(false)
  const [showDonateButton, setShowDonateButton] = useState(false)
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  const [hasReceivedResponse, setHasReceivedResponse] = useState(false)
  const [showLeadCapturePrompt, setShowLeadCapturePrompt] = useState(false)
  const [leadCaptured, setLeadCaptured] = useState(false)
  const [leadFormData, setLeadFormData] = useState<LeadData>({
    email: '',
    name: '',
    phone: '',
    isInvestor: false
  })

  // Update leadFormData with userEmail when available
  useEffect(() => {
    if (userEmail && leadFormData.email !== userEmail) {
      setLeadFormData(prev => ({ ...prev, email: userEmail }))
    }
  }, [userEmail, leadFormData.email])
  const [leadFormErrors, setLeadFormErrors] = useState<Record<string, string>>({})
  const [isSubmittingLead, setIsSubmittingLead] = useState(false)
  const [showInsuranceModal, setShowInsuranceModal] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' })
      }
    }
  }

  const scrollToLatestAssistantMessage = () => {
    // Find the latest assistant message
    const assistantMessages = messages.filter(m => m.type === 'assistant')
    if (assistantMessages.length > 0 && scrollAreaRef.current) {
      const latestIndex = messages.findIndex(m => m.id === assistantMessages[assistantMessages.length - 1].id)
      const messageElement = document.getElementById(`message-${latestIndex}`)
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')

      if (messageElement && scrollContainer) {
        // On mobile, scroll to the top of the assistant message for better visibility
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }

  // Auto-scroll behavior
  useEffect(() => {
    if (hasUserInteracted && messages.length > 0) {
      const latestMessage = messages[messages.length - 1]
      if (latestMessage.type === 'assistant') {
        // For assistant messages, scroll to the top of the response
        setTimeout(() => scrollToLatestAssistantMessage(), 100)
      } else {
        // For user messages, scroll to bottom
        setTimeout(() => scrollToBottom(), 100)
      }
    }
  }, [messages, hasUserInteracted])

  // Add initial welcome message on component mount
  useEffect(() => {
    const welcomeMessage: Message = {
      id: 'welcome',
      type: 'assistant',
      content: `Welcome to Wyng Preview! I'm your healthcare guardian angel, here to help you understand confusing medical bills and insurance issues.

This is a preview version - You'll get one detailed response to showcase our capabilities. Our full application with unlimited conversations is coming soon!

To get started:
1. Check the consent box below to begin
2. Describe your situation - What happened with your medical bill or insurance claim?
3. Upload documents using the file button next to the text box (optional) - EOBs, medical bills, denial letters help me give better guidance
4. Add insurance details by clicking the Insurance Benefits button (optional) - Your plan information helps me provide more specific answers

I can help with:
• Understanding confusing medical bills
• Appeal letters for denied claims
• Billing error identification
• Insurance coverage questions
• Step-by-step guidance for next actions

What's your medical billing question today?`,
      timestamp: new Date()
    }

    setMessages([welcomeMessage])
  }, [])

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    // If user has already received a response, show lead capture prompt instead
    if (hasReceivedResponse) {
      trackEvent.leadCaptureModalOpened()
      setShowLeadCapturePrompt(true)
      return
    }

    // Mark that user has started interacting
    setHasUserInteracted(true)

    // Track message sent
    trackEvent.chatMessageSent(inputValue.length)

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)

    try {
      const completedFiles = uploadedFiles.filter(f => f.status === 'completed');
      const fileIds = completedFiles.map(f => f.id);

      console.log('🚀 Sending chat request:');
      console.log('   📄 Completed files:', completedFiles);
      console.log('   🆔 File IDs being sent:', fileIds);
      console.log('   💬 Message:', inputValue.substring(0, 100) + '...');

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputValue,
          benefits: benefits,
          fileIds: fileIds
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const result = await response.json()

      const assistantMessage: Message = {
        id: Date.now().toString() + '_assistant',
        type: 'assistant',
        content: result.narrative_summary || 'I apologize, but I encountered an issue processing your request. Please try again.',
        timestamp: new Date(),
        llmResponse: result
      }

      setMessages(prev => [...prev, assistantMessage])
      setHasReceivedResponse(true)
      setShowDonateButton(true)

      // Track response received
      trackEvent.chatResponseReceived()
    } catch (error) {
      console.error('Chat error:', error)

      const errorMessage: Message = {
        id: Date.now().toString() + '_error',
        type: 'assistant',
        content: 'I apologize, but I encountered an issue processing your request. Please try again or check back later.',
        timestamp: new Date()
      }

      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileUploaded = (file: UploadedFile) => {
    setUploadedFiles(prev => {
      const existing = prev.find(f => f.id === file.id)
      if (existing) {
        return prev.map(f => f.id === file.id ? file : f)
      }
      return [...prev, file]
    })
  }

  const handleFileRemoved = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId))
  }

  const handleLeadCaptured = (lead: LeadData) => {
    console.log('Lead captured:', lead)
    setLeadCaptured(true)
    // Redirect to main website after showing thank you message
    setTimeout(() => {
      window.open('https://www.mywyng.co/', '_blank')
      setShowLeadCapturePrompt(false)
      setLeadCaptured(false)
    }, 3000)
  }

  const handleCustomLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      // Validate form data
      const validatedData = leadSchema.parse(leadFormData)
      setLeadFormErrors({})
      setIsSubmittingLead(true)

      // Submit to API
      const response = await fetch('/api/lead', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validatedData),
      })

      if (!response.ok) {
        throw new Error('Failed to submit')
      }

      const result = await response.json()
      console.log('Lead captured:', result)
      setLeadCaptured(true)

      // Redirect to main website after showing thank you message
      setTimeout(() => {
        window.open('https://www.mywyng.co/', '_blank')
        setTimeout(() => {
          setShowLeadCapturePrompt(false)
          setLeadCaptured(false)
          setLeadFormData({ email: '', name: '', phone: '', isInvestor: false })
        }, 1000)
      }, 3000)

    } catch (error: any) {
      console.error('Lead capture error:', error)

      if (error.errors) {
        const fieldErrors: Record<string, string> = {}
        error.errors.forEach((err: any) => {
          if (err.path.length > 0) {
            fieldErrors[err.path[0]] = err.message
          }
        })
        setLeadFormErrors(fieldErrors)
      } else {
        setLeadFormErrors({ general: 'Failed to submit. Please try again.' })
      }
    } finally {
      setIsSubmittingLead(false)
    }
  }

  const handleDonate = () => {
    // Track donation click
    trackEvent.donateButtonClick('chat')
    // Open the dedicated donation page
    window.open('/donate', '_blank')
  }

  const renderLLMResponse = (llmResponse: LLMResponse) => {
    return (
      <div className="space-y-6">
        {/* Enhanced Extraction Table */}
        {(llmResponse as any).extraction_table && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              What We Read From Your Documents
            </h4>

            {/* Header Information */}
            {(llmResponse as any).extraction_table.header && Object.keys((llmResponse as any).extraction_table.header).some(key => (llmResponse as any).extraction_table.header[key]) && (
              <div className="mb-4">
                <h5 className="font-medium text-gray-800 mb-2">Document Information</h5>
                <div className="bg-white p-3 rounded border text-sm">
                  {(llmResponse as any).extraction_table.header.providerName && (
                    <div><strong>Provider:</strong> {(llmResponse as any).extraction_table.header.providerName}</div>
                  )}
                  {(llmResponse as any).extraction_table.header.serviceDates && (
                    <div><strong>Service Date(s):</strong> {(llmResponse as any).extraction_table.header.serviceDates}</div>
                  )}
                  {(llmResponse as any).extraction_table.header.claimId && (
                    <div><strong>Claim ID:</strong> {(llmResponse as any).extraction_table.header.claimId}</div>
                  )}
                  {(llmResponse as any).extraction_table.header.accountId && (
                    <div><strong>Account ID:</strong> {(llmResponse as any).extraction_table.header.accountId}</div>
                  )}
                </div>
              </div>
            )}

            {/* Totals */}
            {(llmResponse as any).extraction_table.totals && Object.keys((llmResponse as any).extraction_table.totals).some(key => (llmResponse as any).extraction_table.totals[key]) && (
              <div className="mb-4">
                <h5 className="font-medium text-gray-800 mb-2">Financial Summary</h5>
                <div className="bg-white p-3 rounded border text-sm grid grid-cols-2 gap-2">
                  {(llmResponse as any).extraction_table.totals.billed && (
                    <div><strong>Total Billed:</strong> ${(llmResponse as any).extraction_table.totals.billed.toLocaleString()}</div>
                  )}
                  {(llmResponse as any).extraction_table.totals.allowed && (
                    <div><strong>Allowed Amount:</strong> ${(llmResponse as any).extraction_table.totals.allowed.toLocaleString()}</div>
                  )}
                  {(llmResponse as any).extraction_table.totals.planPaid && (
                    <div><strong>Insurance Paid:</strong> ${(llmResponse as any).extraction_table.totals.planPaid.toLocaleString()}</div>
                  )}
                  {(llmResponse as any).extraction_table.totals.patientResp && (
                    <div><strong>Your Responsibility:</strong> ${(llmResponse as any).extraction_table.totals.patientResp.toLocaleString()}</div>
                  )}
                </div>
              </div>
            )}

            {/* Line Items */}
            {(llmResponse as any).extraction_table.lines && (llmResponse as any).extraction_table.lines.length > 0 && (
              <div className="mb-4">
                <h5 className="font-medium text-gray-800 mb-2">Line Items ({(llmResponse as any).extraction_table.lines.length})</h5>
                <div className="bg-white rounded border max-h-60 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2 border-b">Service</th>
                        <th className="text-left p-2 border-b">Code</th>
                        <th className="text-right p-2 border-b">Charge</th>
                        <th className="text-right p-2 border-b">Your Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(llmResponse as any).extraction_table.lines.map((line: any, index: number) => (
                        <tr key={index} className="border-b">
                          <td className="p-2">{line.description || 'Service'}</td>
                          <td className="p-2 font-mono">{line.code || '-'}</td>
                          <td className="p-2 text-right">{line.charge ? `$${line.charge.toLocaleString()}` : '-'}</td>
                          <td className="p-2 text-right">{line.patientResp ? `$${line.patientResp.toLocaleString()}` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Notes */}
            {(llmResponse as any).extraction_table.notes && (llmResponse as any).extraction_table.notes.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <h5 className="font-medium text-yellow-800 mb-1">Processing Notes</h5>
                {(llmResponse as any).extraction_table.notes.map((note: string, index: number) => (
                  <p key={index} className="text-yellow-700 text-xs">{note}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reassurance Message */}
        {llmResponse.reassurance_message && (
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
            <p className="text-blue-800">{llmResponse.reassurance_message}</p>
          </div>
        )}

        {/* Problem Summary */}
        {llmResponse.problem_summary && (
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">What We Found</h4>
            <p className="text-gray-700">{llmResponse.problem_summary}</p>
          </div>
        )}

        {/* Errors Detected */}
        {llmResponse.errors_detected.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Issues Detected
            </h4>
            <ul className="list-disc list-inside space-y-1">
              {llmResponse.errors_detected.map((error, index) => (
                <li key={index} className="text-red-800">{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* What You Should Owe */}
        {llmResponse.what_you_should_owe && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Estimated Cost
            </h4>
            <p className="text-green-800">{llmResponse.what_you_should_owe}</p>
          </div>
        )}

        {/* Enhanced Scripts and Letters */}
        {(llmResponse as any).scripts_and_letters && (
          <div className="space-y-4">
            {/* Phone Scripts */}
            {(llmResponse as any).scripts_and_letters.phoneScripts && (llmResponse as any).scripts_and_letters.phoneScripts.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">📞 Phone Scripts</h4>
                {(llmResponse as any).scripts_and_letters.phoneScripts.map((script: any, index: number) => (
                  <div key={index} className="mb-4 last:mb-0">
                    <h5 className="font-medium text-gray-800 mb-2">{script.title}</h5>
                    <p className="text-sm text-gray-600 mb-2 italic">{script.scenario}</p>
                    <div className="bg-white p-3 rounded border text-sm font-mono whitespace-pre-wrap">
                      {script.script}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Appeal Letters */}
            {(llmResponse as any).scripts_and_letters.appealLetters && (llmResponse as any).scripts_and_letters.appealLetters.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">📄 Appeal Letters</h4>
                {(llmResponse as any).scripts_and_letters.appealLetters.map((letter: any, index: number) => (
                  <div key={index} className="mb-4 last:mb-0">
                    <h5 className="font-medium text-gray-800 mb-2">{letter.title}</h5>
                    <div className="bg-white p-3 rounded border text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {letter.letterContent}
                    </div>
                    {letter.attachments && letter.attachments.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-600">Recommended attachments: {letter.attachments.join(', ')}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Fallback for legacy phone script and appeal letter */}
        {!((llmResponse as any).scripts_and_letters) && (
          <>
            {/* Phone Script */}
            {llmResponse.phone_script && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">📞 Phone Script</h4>
                <div className="bg-white p-3 rounded border text-sm font-mono whitespace-pre-wrap">
                  {llmResponse.phone_script}
                </div>
              </div>
            )}

            {/* Appeal Letter */}
            {llmResponse.appeal_letter && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">📄 Appeal Letter Template</h4>
                <div className="bg-white p-3 rounded border text-sm whitespace-pre-wrap">
                  {llmResponse.appeal_letter}
                </div>
              </div>
            )}
          </>
        )}

        {/* Enhanced Next Steps */}
        {(llmResponse as any).next_steps_detailed && (llmResponse as any).next_steps_detailed.length > 0 ? (
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">📋 Your Action Plan</h4>
            <div className="space-y-2">
              {(llmResponse as any).next_steps_detailed.map((step: any, index: number) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-blue-50 rounded border border-blue-200">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-blue-900">{step.label}</p>
                    {step.dueDateISO && (
                      <p className="text-xs text-blue-700 mt-1">
                        ⏰ Due by: {new Date(step.dueDateISO).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Fallback to legacy step by step */
          llmResponse.step_by_step.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Next Steps</h4>
              <ol className="list-decimal list-inside space-y-2">
                {llmResponse.step_by_step.map((step, index) => (
                  <li key={index} className="text-gray-700">{step}</li>
                ))}
              </ol>
            </div>
          )
        )}

        {/* Citations */}
        {llmResponse.citations.length > 0 && (
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">⚖️ Legal Basis</h4>
            <ul className="space-y-1">
              {llmResponse.citations.map((citation, index) => (
                <li key={index} className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                  <strong>{citation.label}:</strong> {citation.reference}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Enhanced Disclaimers */}
        {(llmResponse as any).disclaimers && (llmResponse as any).disclaimers.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-semibold text-yellow-800 mb-2">⚠️ Important Disclaimers</h4>
            <ul className="list-disc list-inside space-y-1">
              {(llmResponse as any).disclaimers.map((disclaimer: string, index: number) => (
                <li key={index} className="text-yellow-700 text-sm">{disclaimer}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Narrative Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2">Summary</h4>
          <div className="text-blue-800 whitespace-pre-line">
            {llmResponse.narrative_summary}
          </div>
        </div>
      </div>
    )
  }

  // Show email capture first
  if (!hasEmail) {
    return (
      <EmailCapture
        onEmailSubmit={handleEmailSubmit}
        title="Chat with Our AI Assistant"
        description="Enter your email to start chatting about insurance questions and healthcare guidance."
        buttonText="Start Chatting"
        featureName="chat assistance"
      />
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white px-4 py-2 sm:py-3 flex-shrink-0">
        <div className="flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Logo size="sm" />
            <span className="text-lg sm:text-xl font-bold text-primary">Wyng</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-sm text-gray-600">
              Healthcare Guardian Angel
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Disclaimer - smaller on mobile */}
          <div className="bg-yellow-50 border-b border-yellow-200 px-3 py-1 sm:px-4 sm:py-2 flex-shrink-0">
            <p className="text-xs sm:text-sm text-yellow-800 text-center">
              <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 inline mr-1" />
              General info only. Not insurance. Not legal advice.
            </p>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-2 sm:p-4" ref={scrollAreaRef}>
            <div className="max-w-4xl mx-auto space-y-2 sm:space-y-4">
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  id={message.type === 'assistant' ? `message-${index}` : undefined}
                >
                  <div
                    className={`max-w-3xl rounded-lg px-3 py-2 sm:px-4 ${
                      message.type === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-white border border-gray-200'
                    }`}
                  >
                    {message.type === 'assistant' && message.llmResponse ? (
                      renderLLMResponse(message.llmResponse)
                    ) : (
                      <div className="whitespace-pre-wrap">
                        {message.content.split('\n').map((line, index) => {
                          // Clean formatting for the welcome message
                          if (line === 'This is a preview version - You\'ll get one detailed response to showcase our capabilities. Our full application with unlimited conversations is coming soon!') {
                            return (
                              <p key={index} className="mb-1 text-gray-900">
                                <span className="font-bold">This is a preview version</span> - You'll get one detailed response to showcase our capabilities. Our full application with unlimited conversations is coming soon!
                              </p>
                            )
                          }
                          if (line === 'To get started:' || line === 'I can help with:') {
                            return <p key={index} className="font-bold text-teal-600 mb-2 mt-4">{line}</p>
                          }
                          if (line.startsWith('• ')) {
                            return <p key={index} className="ml-4 text-gray-700 mb-1">{line}</p>
                          }
                          if (/^\d+\./.test(line.trim())) {
                            // Handle numbered list items with bold keywords
                            const processedLine = line
                              .replace('Check the consent box below', '<span class="font-bold">Check the consent box below</span>')
                              .replace('Describe your situation', '<span class="font-bold">Describe your situation</span>')
                              .replace('Upload documents', '<span class="font-bold">Upload documents</span>')
                              .replace('Add insurance details', '<span class="font-bold">Add insurance details</span>')
                            return (
                              <p key={index} className="ml-4 text-gray-700 mb-1" dangerouslySetInnerHTML={{ __html: processedLine }} />
                            )
                          }
                          return <p key={index} className="mb-1 text-gray-900">{line}</p>
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 sm:px-4">
                    <p className="text-sm sm:text-base text-gray-500">Analyzing your situation...</p>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t bg-white p-3 sm:p-4 flex-shrink-0">
            <div className="max-w-4xl mx-auto">
              {!hasAgreedToTerms && (
                <div className="mb-3 sm:mb-4 p-2 sm:p-3 bg-gray-50 rounded border">
                  <label className="flex items-start space-x-2 text-xs sm:text-sm">
                    <input
                      type="checkbox"
                      checked={hasAgreedToTerms}
                      onChange={(e) => {
                        setHasAgreedToTerms(e.target.checked)
                        if (e.target.checked) {
                          trackEvent.chatConsentAgreed()
                        }
                      }}
                      className="mt-1"
                    />
                    <span>
                      I consent to sharing my information for guidance purposes and agree to the{' '}
                      <Link href="/legal/terms" className="text-primary hover:underline">
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link href="/legal/privacy" className="text-primary hover:underline">
                        Privacy Policy
                      </Link>
                      .
                    </span>
                  </label>
                </div>
              )}

              {hasReceivedResponse ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4">
                  <h4 className="font-semibold text-gray-900 mb-2 text-sm sm:text-base">Ready for the Full Wyng Experience?</h4>
                  <p className="text-gray-700 mb-3 sm:mb-4 text-sm sm:text-base">
                    You've just experienced Wyng Lite! Get early access to our complete platform featuring real-time cost estimates,
                    advanced AI Audit Angel, and WyngProtect financial safety net.
                  </p>
                  <Button
                    onClick={() => {
                      trackEvent.chatEarlyAccessClick()
                      setShowLeadCapturePrompt(true)
                    }}
                    className="w-full"
                  >
                    Get Early Access & Updates
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowInsuranceModal(true)}
                      disabled={!hasAgreedToTerms || isLoading}
                      className="bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2"
                    >
                      <Shield className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                      Insurance Benefits
                    </Button>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Textarea
                      placeholder="Describe what happened with your medical bill or insurance claim..."
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      disabled={!hasAgreedToTerms || isLoading}
                      className="flex-1 min-h-[80px] sm:min-h-[80px] text-sm sm:text-base"
                      rows={3}
                    />
                    <div className="flex gap-2 sm:gap-2 sm:flex-col">
                      <Button
                        variant="outline"
                        onClick={() => document.getElementById('file-upload')?.click()}
                        disabled={!hasAgreedToTerms || isLoading}
                        className="flex-1 sm:flex-none px-3 py-2 sm:px-4 text-sm min-h-[44px] sm:min-h-[40px]"
                        size="sm"
                      >
                        <Upload className="h-4 w-4 sm:h-4 sm:w-4 mr-2" />
                        <span>Upload</span>
                      </Button>
                      <Button
                        onClick={handleSendMessage}
                        disabled={!hasAgreedToTerms || !inputValue.trim() || isLoading}
                        className="flex-1 sm:flex-none sm:self-end px-3 py-2 sm:px-4 text-sm min-h-[44px] sm:min-h-[40px]"
                        size="sm"
                      >
                        <Send className="h-4 w-4 sm:h-4 sm:w-4 mr-2" />
                        <span>Send</span>
                      </Button>
                    </div>
                  </div>

                  {/* Hidden file input */}
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    multiple
                    accept=".jpg,.jpeg,.png,.pdf"
                    disabled={!hasAgreedToTerms || isLoading}
                    onChange={async (e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        for (const file of Array.from(e.target.files)) {
                          // Validate file type and size
                          if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
                            alert('Only JPEG, PNG, and PDF files are allowed')
                            continue
                          }

                          if (file.size > 10 * 1024 * 1024) { // 10MB
                            alert('File size must be less than 10MB')
                            continue
                          }

                          const uploadedFile: UploadedFile = {
                            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            status: 'uploading',
                            progress: 0
                          }

                          handleFileUploaded(uploadedFile)

                          // Upload file
                          try {
                            const formData = new FormData()
                            formData.append('file', file)

                            const response = await fetch('/api/upload', {
                              method: 'POST',
                              body: formData,
                            })

                            if (!response.ok) {
                              throw new Error('Upload failed')
                            }

                            const result = await response.json()

                            console.log('🎯 Upload API result:', result)
                            console.log('🎯 Using database ID:', result.id)

                            handleFileUploaded({
                              id: result.id, // Use the actual database ID from the response
                              name: file.name,
                              size: file.size,
                              type: file.type,
                              status: 'completed',
                              progress: 100,
                              ocrText: result.ocrText
                            })
                          } catch (error) {
                            console.error('Upload error:', error)
                            handleFileUploaded({
                              ...uploadedFile,
                              status: 'error',
                              progress: 0
                            })
                          }
                        }
                        // Reset input
                        e.target.value = ''
                      }
                    }}
                  />

                  {/* Show uploaded files if any */}
                  {uploadedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1 sm:gap-2">
                      {uploadedFiles.map((file) => (
                        <div key={file.id} className="flex items-center gap-1 sm:gap-2 bg-gray-100 rounded px-2 py-1 text-xs sm:text-sm">
                          <FileText className="h-3 w-3" />
                          <span className="truncate max-w-24 sm:max-w-32">{file.name}</span>
                          <button
                            onClick={() => handleFileRemoved(file.id)}
                            className="text-gray-500 hover:text-red-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Mobile-only donation prompt after response */}
              {showDonateButton && (
                <div className="sm:hidden mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-center">
                    <Heart className="h-4 w-4 text-green-600 mx-auto mb-1" />
                    <p className="text-xs text-green-700 mb-2">
                      Found this helpful? Consider supporting our development.
                    </p>
                    <Button onClick={handleDonate} size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-100 text-xs">
                      <DollarSign className="h-3 w-3 mr-1" />
                      Say Thanks
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Components - Support and Lead Capture - Hidden on mobile by default */}
          <div className="hidden sm:block bg-white border-t p-3 flex-shrink-0">
            <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Support Our Mission Card - More Compact */}
              <Card className="border-primary/20 bg-primary/5 border-2">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Heart className="h-5 w-5 text-primary" />
                      <div>
                        <h4 className="font-semibold text-gray-900 text-sm">Support Our Mission</h4>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          Fund continued development, AI queries, and infrastructure to scale our healthcare guidance tool
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={handleDonate}
                      size="sm"
                      className="bg-primary hover:bg-primary/90 text-white px-4 shadow-md"
                    >
                      <DollarSign className="h-3 w-3 mr-1" />
                      Donate
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Lead Capture Card - Compact */}
              <div>
                <LeadCapture
                  onLeadCaptured={handleLeadCaptured}
                  disabled={isLoading}
                  compact={true}
                />
              </div>
            </div>

            {/* Additional donation button for after responses - only on desktop */}
            {showDonateButton && (
              <div className="max-w-4xl mx-auto mt-3">
                <Card className="border-green-100 bg-green-50">
                  <CardContent className="pt-3 pb-3">
                    <div className="text-center">
                      <Heart className="h-5 w-5 text-green-600 mx-auto mb-1" />
                      <h4 className="font-medium text-green-900 text-sm mb-1">Found this helpful?</h4>
                      <p className="text-xs text-green-700 mb-2">
                        Consider supporting our development.
                      </p>
                      <Button onClick={handleDonate} size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-100">
                        <DollarSign className="h-3 w-3 mr-1" />
                        Say Thanks
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Insurance Modal */}
      <InsuranceModal
        isOpen={showInsuranceModal}
        onClose={() => setShowInsuranceModal(false)}
        benefits={benefits}
        onBenefitsChange={setBenefits}
        onSubmit={() => {
          // User completed insurance form, prompt them to describe their issue
          // You could show a toast or update the placeholder text
          console.log('Insurance benefits saved, user should now describe their issue')
        }}
      />


      {/* Lead Capture Modal */}
      {showLeadCapturePrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={(e) => {
          if (e.target === e.currentTarget) {
            trackEvent.leadCaptureModalClosed()
            setShowLeadCapturePrompt(false)
            setLeadCaptured(false)
            setLeadFormData({ email: '', name: '', phone: '', isInvestor: false })
            setLeadFormErrors({})
          }
        }}>
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">Continue Your Healthcare Journey</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    trackEvent.leadCaptureModalClosed()
                    setShowLeadCapturePrompt(false)
                    setLeadCaptured(false)
                    setLeadFormData({ email: '', name: '', phone: '', isInvestor: false })
                    setLeadFormErrors({})
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="mb-6">
                <p className="text-gray-700 mb-4">
                  <strong>You've just experienced Wyng Lite!</strong> This preview showcases what our AI Audit Angel can do. Ready for the full power?
                </p>

                <div className="bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 p-4 rounded-lg mb-4">
                  <h4 className="font-bold text-gray-900 mb-2">Coming Soon: The Complete Wyng Platform</h4>
                  <div className="space-y-3">
                    <div>
                      <h5 className="font-semibold text-primary">Real-Time Cost Estimates</h5>
                      <p className="text-sm text-gray-600">Get personalized cost predictions based on your specific insurance coverage before you receive care.</p>
                    </div>
                    <div>
                      <h5 className="font-semibold text-primary">AI Audit Angel (Wyng Lite's Big Brother)</h5>
                      <p className="text-sm text-gray-600">Advanced bill auditing with step-by-step guidance, custom appeal letters, and phone scripts for insurance calls.</p>
                    </div>
                    <div>
                      <h5 className="font-semibold text-primary">WyngProtect Financial Safety Net</h5>
                      <p className="text-sm text-gray-600">When all appeals fail and you're stuck with the bill, WyngProtect steps in as your financial backup.</p>
                    </div>
                  </div>
                </div>

                <p className="text-gray-700 mb-4">
                  <strong>Join our early access list now</strong> and be the first to experience the future of healthcare financial protection!
                </p>
              </div>

              {leadCaptured ? (
                <div className="text-center py-6">
                  <div className="mb-4">
                    <Heart className="h-12 w-12 text-primary mx-auto mb-3" />
                    <h3 className="text-2xl font-bold text-primary mb-2">Welcome to Wyng!</h3>
                    <p className="text-gray-700 mb-4">
                      Thank you for joining our early access list! You're now part of the future of healthcare financial protection.
                    </p>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                    <p className="text-gray-800 font-medium mb-2">Redirecting you to our main website...</p>
                    <p className="text-sm text-gray-600">
                      You'll be taken to <strong>www.mywyng.co</strong> where you can learn more about our complete platform and stay updated on our progress.
                    </p>
                  </div>
                  <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    <span>Opening in 3 seconds...</span>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCustomLeadSubmit} className="space-y-4">
                  {leadFormErrors.general && (
                    <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
                      {leadFormErrors.general}
                    </div>
                  )}

                  <div>
                    <Label htmlFor="modal-email">Email Address *</Label>
                    <Input
                      id="modal-email"
                      type="email"
                      placeholder="your@email.com"
                      value={leadFormData.email}
                      onChange={(e) => setLeadFormData(prev => ({ ...prev, email: e.target.value }))}
                      disabled={isSubmittingLead}
                      required
                    />
                    {leadFormErrors.email && (
                      <p className="text-sm text-red-600 mt-1">{leadFormErrors.email}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="modal-name">Name (Optional)</Label>
                    <Input
                      id="modal-name"
                      type="text"
                      placeholder="Your name"
                      value={leadFormData.name}
                      onChange={(e) => setLeadFormData(prev => ({ ...prev, name: e.target.value }))}
                      disabled={isSubmittingLead}
                    />
                    {leadFormErrors.name && (
                      <p className="text-sm text-red-600 mt-1">{leadFormErrors.name}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="modal-phone">Phone (Optional)</Label>
                    <Input
                      id="modal-phone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={leadFormData.phone}
                      onChange={(e) => setLeadFormData(prev => ({ ...prev, phone: e.target.value }))}
                      disabled={isSubmittingLead}
                    />
                    {leadFormErrors.phone && (
                      <p className="text-sm text-red-600 mt-1">{leadFormErrors.phone}</p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="modal-investor-interest"
                      checked={leadFormData.isInvestor}
                      onCheckedChange={(checked) => setLeadFormData(prev => ({ ...prev, isInvestor: !!checked }))}
                      disabled={isSubmittingLead}
                    />
                    <Label
                      htmlFor="modal-investor-interest"
                      className="text-sm cursor-pointer"
                    >
                      I'm interested in learning about investment opportunities
                    </Label>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmittingLead || !leadFormData.email}
                  >
                    {isSubmittingLead ? 'Submitting...' : 'Join Early Access List'}
                  </Button>

                  <p className="text-xs text-gray-500 text-center">
                    We respect your privacy. Unsubscribe at any time.
                  </p>
                </form>
              )}

              {/* Donation Option in Modal */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="text-center">
                  <Heart className="h-6 w-6 text-red-500 mx-auto mb-2" />
                  <h4 className="font-semibold text-gray-900 mb-2">Love what we're building?</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    Support Wyng's development with a pay-what-you-want donation. Every contribution helps us build better healthcare guidance tools.
                  </p>
                  <Button
                    onClick={handleDonate}
                    variant="outline"
                    className="w-full border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    <DollarSign className="h-4 w-4 mr-2" />
                    Support Our Mission
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}