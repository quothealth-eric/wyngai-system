'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BenefitsData, benefitsSchema } from '@/lib/validations'
import { commonInsurers, commonPlanTypes } from '@/lib/benefits'
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
      onBenefitsChange(updatedBenefits) // Still update to show user input
    }
  }

  const handleInputChange = (field: keyof BenefitsData, value: string) => {
    const updatedBenefits = { ...benefits }

    if (field === 'insurerName' || field === 'planType') {
      updatedBenefits[field] = value || undefined
      // Track insurance/plan selection
      if (value) {
        if (field === 'insurerName') {
          trackEvent('benefitsInsuranceSelected', { value })
        } else if (field === 'planType') {
          trackEvent('benefitsPlanTypeSelected', { value })
        }
      }
    } else if (field === 'deductibleMet') {
      updatedBenefits[field] = value as 'not_met' | 'partially_met' | 'fully_met' | 'unknown' | undefined
    } else {
      // Numeric fields
      const numValue = value === '' ? undefined : parseFloat(value)
      if (field === 'deductible' || field === 'coinsurance' || field === 'copay' || field === 'oopMax' || field === 'amountPaidToDeductible') {
        updatedBenefits[field] = numValue
      }
      // Track when deductible is entered
      if (field === 'deductible' && numValue) {
        trackEvent('benefitsDeductibleEntered')
      }
    }

    validateAndUpdateBenefits(updatedBenefits)

    // Check if form is completed (has insurer and at least one benefit value)
    if (updatedBenefits.insurerName &&
        (updatedBenefits.deductible || updatedBenefits.oopMax || updatedBenefits.coinsurance || updatedBenefits.copay)) {
      trackEvent('benefitsFormCompleted')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Insurance Benefits</CardTitle>
        <CardDescription>
          Optional: Add your insurance benefits for more accurate cost estimates
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="insurer">Insurance Company</Label>
            <select
              id="insurer"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={benefits.insurerName || ''}
              onChange={(e) => handleInputChange('insurerName', e.target.value)}
              disabled={disabled}
            >
              <option value="">Select insurer...</option>
              {commonInsurers.map((insurer) => (
                <option key={insurer} value={insurer}>
                  {insurer}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="planType">Plan Type</Label>
            <select
              id="planType"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={benefits.planType || ''}
              onChange={(e) => handleInputChange('planType', e.target.value)}
              disabled={disabled}
            >
              <option value="">Select plan type...</option>
              {commonPlanTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="deductible">Annual Deductible ($)</Label>
            <Input
              id="deductible"
              type="number"
              placeholder="e.g., 1500"
              value={benefits.deductible?.toString() || ''}
              onChange={(e) => handleInputChange('deductible', e.target.value)}
              disabled={disabled}
            />
            {errors.deductible && (
              <p className="text-sm text-red-600 mt-1">{errors.deductible}</p>
            )}
          </div>

          <div>
            <Label htmlFor="deductibleMet">Deductible Status</Label>
            <select
              id="deductibleMet"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={benefits.deductibleMet || ''}
              onChange={(e) => handleInputChange('deductibleMet', e.target.value)}
              disabled={disabled}
            >
              <option value="">Select status...</option>
              <option value="not_met">Not met yet</option>
              <option value="partially_met">Partially met</option>
              <option value="fully_met">Fully met</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="oopMax">Out-of-Pocket Max ($)</Label>
            <Input
              id="oopMax"
              type="number"
              placeholder="e.g., 8000"
              value={benefits.oopMax?.toString() || ''}
              onChange={(e) => handleInputChange('oopMax', e.target.value)}
              disabled={disabled}
            />
            {errors.oopMax && (
              <p className="text-sm text-red-600 mt-1">{errors.oopMax}</p>
            )}
          </div>

          <div>
            <Label htmlFor="amountPaidToDeductible">Amount Already Paid to Deductible ($)</Label>
            <Input
              id="amountPaidToDeductible"
              type="number"
              placeholder="e.g., 500"
              value={benefits.amountPaidToDeductible?.toString() || ''}
              onChange={(e) => handleInputChange('amountPaidToDeductible', e.target.value)}
              disabled={disabled}
            />
            {errors.amountPaidToDeductible && (
              <p className="text-sm text-red-600 mt-1">{errors.amountPaidToDeductible}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="coinsurance">Coinsurance (%)</Label>
            <Input
              id="coinsurance"
              type="number"
              placeholder="e.g., 20"
              min="0"
              max="100"
              value={benefits.coinsurance?.toString() || ''}
              onChange={(e) => handleInputChange('coinsurance', e.target.value)}
              disabled={disabled}
            />
            {errors.coinsurance && (
              <p className="text-sm text-red-600 mt-1">{errors.coinsurance}</p>
            )}
          </div>

          <div>
            <Label htmlFor="copay">Copay ($)</Label>
            <Input
              id="copay"
              type="number"
              placeholder="e.g., 30"
              value={benefits.copay?.toString() || ''}
              onChange={(e) => handleInputChange('copay', e.target.value)}
              disabled={disabled}
            />
            {errors.copay && (
              <p className="text-sm text-red-600 mt-1">{errors.copay}</p>
            )}
          </div>
        </div>

        <div className="text-xs text-gray-500 space-y-1">
          <p>• Deductible: Amount you pay before insurance coverage begins</p>
          <p>• Deductible Status: Whether your deductible has been met this year</p>
          <p>• Amount Paid to Deductible: How much you've already paid toward your deductible</p>
          <p>• Coinsurance: Your percentage of costs after deductible (e.g., 20%)</p>
          <p>• Copay: Fixed amount for specific services (alternative to coinsurance)</p>
          <p>• Out-of-pocket max: Maximum you'll pay in a year</p>
        </div>
      </CardContent>
    </Card>
  )
}