'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BenefitsData, benefitsSchema } from '@/lib/validations'
import { trackEvent } from '@/lib/analytics'

interface BenefitsFormProps {
  benefits: BenefitsData
  onBenefitsChange: (benefits: BenefitsData) => void
  disabled?: boolean
}

export function BenefitsForm({ benefits, onBenefitsChange, disabled }: BenefitsFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateAndUpdateBenefits = (updatedBenefits: BenefitsData) => {
    try {
      const validated = benefitsSchema.parse(updatedBenefits)
      setErrors({})
      onBenefitsChange(validated)
    } catch (error: any) {
      const fieldErrors: Record<string, string> = {}
      if (error.errors) {
        error.errors.forEach((err: any) => {
          if (err.path.length > 0) {
            fieldErrors[err.path[0]] = err.message
          }
        })
      }
      setErrors(fieldErrors)
      onBenefitsChange(updatedBenefits)
    }
  }

  const handleInputChange = (field: keyof BenefitsData, value: string) => {
    const updatedBenefits = { ...benefits }

    if (field === 'insurerName' || field === 'planType' || field === 'network') {
      updatedBenefits[field] = value || undefined
      if (value) {
        trackEvent('benefits_field_updated', { field, value })
      }
    } else if (field === 'coinsurance') {
      const numValue = value === '' ? undefined : parseFloat(value)
      updatedBenefits[field] = numValue
    } else if (field === 'priorAuthRequired' || field === 'referralRequired') {
      updatedBenefits[field] = value === 'true'
    }

    validateAndUpdateBenefits(updatedBenefits)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Insurance Benefits</CardTitle>
        <CardDescription>
          Enter your insurance information to get personalized guidance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="insurerName">Insurance Company</Label>
            <Input
              id="insurerName"
              value={benefits.insurerName || ''}
              onChange={(e) => handleInputChange('insurerName', e.target.value)}
              disabled={disabled}
              placeholder="e.g. Blue Cross Blue Shield"
            />
            {errors.insurerName && (
              <p className="text-sm text-red-500">{errors.insurerName}</p>
            )}
          </div>

          <div>
            <Label htmlFor="planType">Plan Type</Label>
            <Input
              id="planType"
              value={benefits.planType || ''}
              onChange={(e) => handleInputChange('planType', e.target.value)}
              disabled={disabled}
              placeholder="e.g. PPO, HMO, HDHP"
            />
            {errors.planType && (
              <p className="text-sm text-red-500">{errors.planType}</p>
            )}
          </div>

          <div>
            <Label htmlFor="network">Network</Label>
            <Input
              id="network"
              value={benefits.network || ''}
              onChange={(e) => handleInputChange('network', e.target.value)}
              disabled={disabled}
              placeholder="e.g. In-network, Out-of-network"
            />
            {errors.network && (
              <p className="text-sm text-red-500">{errors.network}</p>
            )}
          </div>

          <div>
            <Label htmlFor="coinsurance">Coinsurance (%)</Label>
            <Input
              id="coinsurance"
              type="number"
              min="0"
              max="100"
              value={benefits.coinsurance || ''}
              onChange={(e) => handleInputChange('coinsurance', e.target.value)}
              disabled={disabled}
              placeholder="e.g. 20"
            />
            {errors.coinsurance && (
              <p className="text-sm text-red-500">{errors.coinsurance}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="priorAuthRequired">Prior Authorization Required</Label>
            <select
              id="priorAuthRequired"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              value={benefits.priorAuthRequired?.toString() || ''}
              onChange={(e) => handleInputChange('priorAuthRequired', e.target.value)}
              disabled={disabled}
            >
              <option value="">Select...</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
            {errors.priorAuthRequired && (
              <p className="text-sm text-red-500">{errors.priorAuthRequired}</p>
            )}
          </div>

          <div>
            <Label htmlFor="referralRequired">Referral Required</Label>
            <select
              id="referralRequired"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              value={benefits.referralRequired?.toString() || ''}
              onChange={(e) => handleInputChange('referralRequired', e.target.value)}
              disabled={disabled}
            >
              <option value="">Select...</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
            {errors.referralRequired && (
              <p className="text-sm text-red-500">{errors.referralRequired}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}