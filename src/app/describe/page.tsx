'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Image from 'next/image'

export default function DescribePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const caseId = searchParams.get('caseId')

  const [description, setDescription] = useState('')
  const [insurance, setInsurance] = useState({
    planType: '',
    network: '',
    deductible: '',
    coinsurance: '',
    memberIdMasked: '',
    groupNumber: '',
    bin: '',
    pcn: ''
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
      const response = await fetch('/api/case/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          description: description.trim(),
          insurance: {
            planType: insurance.planType || null,
            network: insurance.network || null,
            deductible: insurance.deductible || null,
            coinsurance: insurance.coinsurance || null,
            memberIdMasked: insurance.memberIdMasked || null,
            groupNumber: insurance.groupNumber || null,
            bin: insurance.bin || null,
            pcn: insurance.pcn || null
          }
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error)
      }

      console.log('✅ Case submitted successfully:', result)
      router.push(`/email?caseId=${caseId}`)

    } catch (error) {
      console.error('Submit failed:', error)
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
              <CardTitle>Insurance Information (Optional)</CardTitle>
              <p className="text-sm text-gray-600">
                Providing insurance details helps us give more accurate analysis. All information is kept confidential.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="planType">Plan Type</Label>
                  <Select value={insurance.planType} onValueChange={(value) => setInsurance(prev => ({...prev, planType: value}))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select plan type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hmo">HMO</SelectItem>
                      <SelectItem value="ppo">PPO</SelectItem>
                      <SelectItem value="epo">EPO</SelectItem>
                      <SelectItem value="pos">POS</SelectItem>
                      <SelectItem value="hdhp">High Deductible Health Plan</SelectItem>
                      <SelectItem value="medicare">Medicare</SelectItem>
                      <SelectItem value="medicaid">Medicaid</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="network">Provider Network</Label>
                  <Select value={insurance.network} onValueChange={(value) => setInsurance(prev => ({...prev, network: value}))}>
                    <SelectTrigger>
                      <SelectValue placeholder="In or out of network" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in-network">In Network</SelectItem>
                      <SelectItem value="out-of-network">Out of Network</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="deductible">Annual Deductible</Label>
                  <Input
                    id="deductible"
                    type="text"
                    placeholder="e.g., $1,500"
                    value={insurance.deductible}
                    onChange={(e) => setInsurance(prev => ({...prev, deductible: e.target.value}))}
                  />
                </div>

                <div>
                  <Label htmlFor="coinsurance">Coinsurance</Label>
                  <Input
                    id="coinsurance"
                    type="text"
                    placeholder="e.g., 20%"
                    value={insurance.coinsurance}
                    onChange={(e) => setInsurance(prev => ({...prev, coinsurance: e.target.value}))}
                  />
                </div>

                <div>
                  <Label htmlFor="memberIdMasked">Member ID (last 4 digits)</Label>
                  <Input
                    id="memberIdMasked"
                    type="text"
                    placeholder="e.g., ****1234"
                    maxLength={8}
                    value={insurance.memberIdMasked}
                    onChange={(e) => setInsurance(prev => ({...prev, memberIdMasked: e.target.value}))}
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
                  <Label htmlFor="bin">BIN</Label>
                  <Input
                    id="bin"
                    type="text"
                    placeholder="Bank Identification Number"
                    value={insurance.bin}
                    onChange={(e) => setInsurance(prev => ({...prev, bin: e.target.value}))}
                  />
                </div>

                <div>
                  <Label htmlFor="pcn">PCN</Label>
                  <Input
                    id="pcn"
                    type="text"
                    placeholder="Processor Control Number"
                    value={insurance.pcn}
                    onChange={(e) => setInsurance(prev => ({...prev, pcn: e.target.value}))}
                  />
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