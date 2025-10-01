'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { X } from 'lucide-react'
import { BenefitsData, benefitsSchema } from '@/lib/validations'
import { commonInsurers, commonPlanTypes } from '@/lib/benefits'
import { trackEvent } from '@/lib/analytics'

interface InsuranceModalProps {
  isOpen: boolean
  onClose: () => void
  benefits: BenefitsData
  onBenefitsChange: (benefits: BenefitsData) => void
  onSubmit: () => void
}

export function InsuranceModal({ isOpen, onClose, benefits, onBenefitsChange, onSubmit }: InsuranceModalProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})

  if (!isOpen) return null

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
          trackEvent.benefitsInsuranceSelected(value)
        } else if (field === 'planType') {
          trackEvent.benefitsPlanTypeSelected(value)
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
        trackEvent.benefitsDeductibleEntered()
      }
    }

    validateAndUpdateBenefits(updatedBenefits)

    // Check if form is completed (has insurer and at least one benefit value)
    if (updatedBenefits.insurerName &&
        (updatedBenefits.deductible || updatedBenefits.oopMax || updatedBenefits.coinsurance || updatedBenefits.copay)) {
      trackEvent.benefitsFormCompleted()
    }
  }

  const handleSubmit = () => {
    onSubmit()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={(e) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    }}>
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Insurance Benefits</h3>
              <p className="text-sm text-gray-600 mt-1">Add your insurance information for more accurate cost estimates</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="modal-insurer">Insurance Company</Label>
                <select
                  id="modal-insurer"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={benefits.insurerName || ''}
                  onChange={(e) => handleInputChange('insurerName', e.target.value)}
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
                <Label htmlFor="modal-planType">Plan Type</Label>
                <select
                  id="modal-planType"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={benefits.planType || ''}
                  onChange={(e) => handleInputChange('planType', e.target.value)}
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
                <Label htmlFor="modal-deductible">Annual Deductible ($)</Label>
                <Input
                  id="modal-deductible"
                  type="number"
                  placeholder="e.g., 1500"
                  value={benefits.deductible?.toString() || ''}
                  onChange={(e) => handleInputChange('deductible', e.target.value)}
                />
                {errors.deductible && (
                  <p className="text-sm text-red-600 mt-1">{errors.deductible}</p>
                )}
              </div>

              <div>
                <Label htmlFor="modal-oopMax">Out-of-Pocket Max ($)</Label>
                <Input
                  id="modal-oopMax"
                  type="number"
                  placeholder="e.g., 8000"
                  value={benefits.oopMax?.toString() || ''}
                  onChange={(e) => handleInputChange('oopMax', e.target.value)}
                />
                {errors.oopMax && (
                  <p className="text-sm text-red-600 mt-1">{errors.oopMax}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="modal-coinsurance">Coinsurance (%)</Label>
                <Input
                  id="modal-coinsurance"
                  type="number"
                  placeholder="e.g., 20"
                  min="0"
                  max="100"
                  value={benefits.coinsurance?.toString() || ''}
                  onChange={(e) => handleInputChange('coinsurance', e.target.value)}
                />
                {errors.coinsurance && (
                  <p className="text-sm text-red-600 mt-1">{errors.coinsurance}</p>
                )}
              </div>

              <div>
                <Label htmlFor="modal-copay">Copay ($)</Label>
                <Input
                  id="modal-copay"
                  type="number"
                  placeholder="e.g., 30"
                  value={benefits.copay?.toString() || ''}
                  onChange={(e) => handleInputChange('copay', e.target.value)}
                />
                {errors.copay && (
                  <p className="text-sm text-red-600 mt-1">{errors.copay}</p>
                )}
              </div>
            </div>

            <div className="text-xs text-gray-500 space-y-1 bg-gray-50 p-3 rounded">
              <p><strong>Deductible:</strong> Amount you pay before insurance coverage begins</p>
              <p><strong>Coinsurance:</strong> Your percentage of costs after deductible (e.g., 20%)</p>
              <p><strong>Copay:</strong> Fixed amount for specific services (alternative to coinsurance)</p>
              <p><strong>Out-of-pocket max:</strong> Maximum you'll pay in a year</p>
            </div>

            <div className="flex gap-3 pt-4">
              <Button onClick={handleSubmit} className="flex-1">
                Save & Continue
              </Button>
              <Button variant="outline" onClick={onClose} className="flex-1">
                Skip for Now
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}