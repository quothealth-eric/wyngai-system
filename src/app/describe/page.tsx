'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import Image from 'next/image'

export default function DescribePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const caseId = searchParams.get('caseId')

  const [description, setDescription] = useState('')
  const [insurance, setInsurance] = useState({
    carrierName: '',
    planName: '',
    memberId: '',
    groupNumber: '',
    effectiveDate: '',
    planType: '',
    inNetworkDeductible: '',
    outOfNetworkDeductible: '',
    inNetworkCoinsurance: '',
    outOfNetworkCoinsurance: '',
    copayPrimary: '',
    copaySpecialist: '',
    copayUrgentCare: '',
    copayER: '',
    outOfPocketMax: '',
    // Legacy fields for backward compatibility
    network: '',
    deductible: '',
    coinsurance: '',
    memberIdMasked: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!caseId) {
      router.push('/upload')
    }
  }, [caseId, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!caseId) {
      alert('No case session found')
      return
    }

    if (description.trim().length < 10) {
      alert('Please provide a description of at least 10 characters')
      return
    }

    setIsSubmitting(true)

    try {
      const payload = {
        caseId,
        description: description.trim(),
        insurance: {
          // New comprehensive insurance plan fields
          carrierName: insurance.carrierName || null,
          planName: insurance.planName || null,
          memberId: insurance.memberId || null,
          groupNumber: insurance.groupNumber || null,
          effectiveDate: insurance.effectiveDate || null,
          planType: insurance.planType || null,
          inNetworkDeductible: insurance.inNetworkDeductible ? parseInt(insurance.inNetworkDeductible) * 100 : null, // Convert to cents
          outOfNetworkDeductible: insurance.outOfNetworkDeductible ? parseInt(insurance.outOfNetworkDeductible) * 100 : null,
          inNetworkCoinsurance: insurance.inNetworkCoinsurance ? parseFloat(insurance.inNetworkCoinsurance) : null,
          outOfNetworkCoinsurance: insurance.outOfNetworkCoinsurance ? parseFloat(insurance.outOfNetworkCoinsurance) : null,
          copayPrimary: insurance.copayPrimary ? parseInt(insurance.copayPrimary) * 100 : null,
          copaySpecialist: insurance.copaySpecialist ? parseInt(insurance.copaySpecialist) * 100 : null,
          copayUrgentCare: insurance.copayUrgentCare ? parseInt(insurance.copayUrgentCare) * 100 : null,
          copayER: insurance.copayER ? parseInt(insurance.copayER) * 100 : null,
          outOfPocketMax: insurance.outOfPocketMax ? parseInt(insurance.outOfPocketMax) * 100 : null,
          // Legacy fields for backward compatibility
          network: insurance.network || null,
          deductible: insurance.deductible || null,
          coinsurance: insurance.coinsurance || null,
          memberIdMasked: insurance.memberIdMasked || null
        }
      }

      console.log('📝 Submitting case profile data:', JSON.stringify(payload, null, 2))

      const response = await fetch('/api/case/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      console.log('📝 Submit response status:', response.status, response.statusText)

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        console.error('Non-JSON response from submit API:', text)
        throw new Error(`Server error: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      console.log('📝 Submit API response:', result)

      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}`)
      }

      console.log('✅ Case submitted successfully:', result)
      router.push(`/email?caseId=${caseId}`)

    } catch (error) {
      console.error('❌ Submit failed:', error)
      alert('Submission failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
      setIsSubmitting(false)
    }
  }

  if (!caseId) {
    return <div>Redirecting...</div>
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
            Step 2 of 3: Describe Your Issue
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Tell Us About Your Issue
          </h1>
          <p className="text-lg text-gray-600">
            Help our analysts understand your billing concerns and insurance details for the most accurate analysis.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Problem Description */}
          <Card>
            <CardHeader>
              <CardTitle>Describe Your Problem *</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Please describe what seems wrong with your medical bill or EOB. For example: 'I was charged for services I didn't receive', 'My insurance didn't pay what I expected', 'The bill amounts don't match my EOB', etc."
                className="min-h-[120px]"
                required
              />
              <p className="text-sm text-gray-500 mt-2">
                {description.length}/500 characters • Minimum 10 characters required
              </p>
            </CardContent>
          </Card>

          {/* Insurance Information */}
          <Card>
            <CardHeader>
              <CardTitle>Insurance Plan Information (Optional)</CardTitle>
              <p className="text-sm text-gray-600">
                If you don't have an EOB or want to provide manual insurance details, fill out these fields. This helps us calculate allowed-basis savings more accurately.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Basic Plan Info */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Basic Plan Information</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="carrierName">Insurance Carrier</Label>
                    <Input
                      id="carrierName"
                      type="text"
                      placeholder="e.g., Blue Cross Blue Shield, Aetna, Cigna"
                      value={insurance.carrierName}
                      onChange={(e) => setInsurance(prev => ({...prev, carrierName: e.target.value}))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="planName">Plan Name</Label>
                    <Input
                      id="planName"
                      type="text"
                      placeholder="e.g., Silver Plan, Bronze Plan"
                      value={insurance.planName}
                      onChange={(e) => setInsurance(prev => ({...prev, planName: e.target.value}))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="memberId">Member ID (last 4 digits)</Label>
                    <Input
                      id="memberId"
                      type="text"
                      placeholder="e.g., ****1234"
                      maxLength={8}
                      value={insurance.memberId}
                      onChange={(e) => setInsurance(prev => ({...prev, memberId: e.target.value}))}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Only enter the last few digits for security
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="groupNumber">Group Number</Label>
                    <Input
                      id="groupNumber"
                      type="text"
                      placeholder="Group/Policy number"
                      value={insurance.groupNumber}
                      onChange={(e) => setInsurance(prev => ({...prev, groupNumber: e.target.value}))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="planType">Plan Type</Label>
                    <select
                      id="planType"
                      value={insurance.planType}
                      onChange={(e) => setInsurance(prev => ({...prev, planType: e.target.value}))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">Select plan type</option>
                      <option value="HMO">HMO</option>
                      <option value="PPO">PPO</option>
                      <option value="EPO">EPO</option>
                      <option value="POS">POS</option>
                      <option value="HDHP">High Deductible Health Plan</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="effectiveDate">Plan Effective Date</Label>
                    <Input
                      id="effectiveDate"
                      type="date"
                      value={insurance.effectiveDate}
                      onChange={(e) => setInsurance(prev => ({...prev, effectiveDate: e.target.value}))}
                    />
                  </div>
                </div>
              </div>

              {/* Deductibles */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Deductibles</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="inNetworkDeductible">In-Network Deductible ($)</Label>
                    <Input
                      id="inNetworkDeductible"
                      type="number"
                      placeholder="e.g., 1500"
                      value={insurance.inNetworkDeductible}
                      onChange={(e) => setInsurance(prev => ({...prev, inNetworkDeductible: e.target.value}))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="outOfNetworkDeductible">Out-of-Network Deductible ($)</Label>
                    <Input
                      id="outOfNetworkDeductible"
                      type="number"
                      placeholder="e.g., 3000"
                      value={insurance.outOfNetworkDeductible}
                      onChange={(e) => setInsurance(prev => ({...prev, outOfNetworkDeductible: e.target.value}))}
                    />
                  </div>
                </div>
              </div>

              {/* Coinsurance */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Coinsurance (%)</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="inNetworkCoinsurance">In-Network Coinsurance</Label>
                    <Input
                      id="inNetworkCoinsurance"
                      type="number"
                      placeholder="e.g., 20"
                      min="0"
                      max="100"
                      value={insurance.inNetworkCoinsurance}
                      onChange={(e) => setInsurance(prev => ({...prev, inNetworkCoinsurance: e.target.value}))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="outOfNetworkCoinsurance">Out-of-Network Coinsurance</Label>
                    <Input
                      id="outOfNetworkCoinsurance"
                      type="number"
                      placeholder="e.g., 40"
                      min="0"
                      max="100"
                      value={insurance.outOfNetworkCoinsurance}
                      onChange={(e) => setInsurance(prev => ({...prev, outOfNetworkCoinsurance: e.target.value}))}
                    />
                  </div>
                </div>
              </div>

              {/* Copays */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Copays ($)</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="copayPrimary">Primary Care Copay</Label>
                    <Input
                      id="copayPrimary"
                      type="number"
                      placeholder="e.g., 25"
                      value={insurance.copayPrimary}
                      onChange={(e) => setInsurance(prev => ({...prev, copayPrimary: e.target.value}))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="copaySpecialist">Specialist Copay</Label>
                    <Input
                      id="copaySpecialist"
                      type="number"
                      placeholder="e.g., 50"
                      value={insurance.copaySpecialist}
                      onChange={(e) => setInsurance(prev => ({...prev, copaySpecialist: e.target.value}))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="copayUrgentCare">Urgent Care Copay</Label>
                    <Input
                      id="copayUrgentCare"
                      type="number"
                      placeholder="e.g., 75"
                      value={insurance.copayUrgentCare}
                      onChange={(e) => setInsurance(prev => ({...prev, copayUrgentCare: e.target.value}))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="copayER">Emergency Room Copay</Label>
                    <Input
                      id="copayER"
                      type="number"
                      placeholder="e.g., 200"
                      value={insurance.copayER}
                      onChange={(e) => setInsurance(prev => ({...prev, copayER: e.target.value}))}
                    />
                  </div>
                </div>
              </div>

              {/* Out of Pocket Maximum */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Other Limits</h4>
                <div className="grid md:grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor="outOfPocketMax">Out-of-Pocket Maximum ($)</Label>
                    <Input
                      id="outOfPocketMax"
                      type="number"
                      placeholder="e.g., 7500"
                      value={insurance.outOfPocketMax}
                      onChange={(e) => setInsurance(prev => ({...prev, outOfPocketMax: e.target.value}))}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="text-center">
            <Button
              type="submit"
              disabled={description.trim().length < 10 || isSubmitting}
              className="btn-wyng-gradient text-white text-lg py-3 px-8"
              size="lg"
            >
              {isSubmitting ? 'Submitting...' : 'Analyze My Bill'}
            </Button>

            <p className="text-sm text-gray-500 mt-4">
              Next, we'll collect your email to send you the detailed analysis within 24-48 hours.
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}