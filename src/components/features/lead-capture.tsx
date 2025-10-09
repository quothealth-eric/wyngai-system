'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LeadData, leadSchema } from '@/lib/validations'
import { Mail, Heart } from 'lucide-react'
import { trackEvent } from '@/lib/analytics'

interface LeadCaptureProps {
  onLeadCaptured: (lead: LeadData) => void
  disabled?: boolean
  compact?: boolean
}

export function LeadCapture({ onLeadCaptured, disabled, compact = false }: LeadCaptureProps) {
  const source = compact ? 'compact_form' : 'full_form'
  const [formData, setFormData] = useState<LeadData>({
    email: '',
    name: '',
    phone: '',
    isInvestor: false
  })
  const [hasTrackedStart, setHasTrackedStart] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      // Track lead capture submission
      trackEvent.leadCaptureSubmitted(source, !!formData.name, !!formData.phone, formData.isInvestor)

      // Validate form data
      const validatedData = leadSchema.parse(formData)
      setErrors({})
      setIsSubmitting(true)

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
      onLeadCaptured(result)
      setIsSubmitted(true)

      // Track successful lead capture
      trackEvent.leadCaptureCompleted(source)
    } catch (error: any) {
      console.error('Lead capture error:', error)

      if (error.errors) {
        const fieldErrors: Record<string, string> = {}
        error.errors.forEach((err: any) => {
          if (err.path.length > 0) {
            fieldErrors[err.path[0]] = err.message
          }
        })
        setErrors(fieldErrors)
      } else {
        setErrors({ general: 'Failed to submit. Please try again.' })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = (field: keyof LeadData, value: any) => {
    // Track lead capture start on first interaction
    if (!hasTrackedStart) {
      trackEvent.leadCaptureStarted(source)
      setHasTrackedStart(true)
    }

    setFormData(prev => ({ ...prev, [field]: value }))

    // Track field interactions
    if (field === 'email' && value && !formData.email) {
      trackEvent.leadCaptureEmailEntered(source)
    } else if (field === 'name' && value && !formData.name) {
      trackEvent.leadCaptureNameEntered(source)
    } else if (field === 'phone' && value && !formData.phone) {
      trackEvent.leadCapturePhoneEntered(source)
    } else if (field === 'isInvestor' && value) {
      trackEvent.leadCaptureInvestorChecked(source)
    }

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  if (isSubmitted) {
    return (
      <Card>
        <CardContent className={compact ? "pt-3" : "pt-6"}>
          <div className="text-center">
            <Heart className={`${compact ? 'h-6 w-6' : 'h-12 w-12'} text-green-500 mx-auto ${compact ? 'mb-2' : 'mb-4'}`} />
            <h3 className={`${compact ? 'text-base' : 'text-lg'} font-semibold text-green-700 mb-2`}>Thank You!</h3>
            <p className="text-sm text-gray-600">
              You'll receive updates about Wyng and healthcare guidance tips.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (compact) {
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="h-4 w-4" />
            <h3 className="text-base font-semibold">Stay Connected</h3>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            {errors.general && (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                {errors.general}
              </div>
            )}

            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  disabled={disabled || isSubmitting}
                  required
                />
                {errors.email && (
                  <p className="text-xs text-red-600 mt-1">{errors.email}</p>
                )}
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={disabled || isSubmitting || !formData.email}
              >
                {isSubmitting ? 'Joining...' : 'Join'}
              </Button>
            </div>

            {/* Hidden fields for compact form */}
            <input type="hidden" name="name" value={formData.name} />
            <input type="hidden" name="phone" value={formData.phone} />
            <input type="hidden" name="isInvestor" value={formData.isInvestor.toString()} />

            <p className="text-xs text-gray-500">
              Get updates on new features and healthcare guidance tips
            </p>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Stay Connected
        </CardTitle>
        <CardDescription>
          Get updates on new features and healthcare guidance tips
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.general && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
              {errors.general}
            </div>
          )}

          <div>
            <Label htmlFor="lead-email">Email Address *</Label>
            <Input
              id="lead-email"
              type="email"
              placeholder="your@email.com"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              disabled={disabled || isSubmitting}
              required
            />
            {errors.email && (
              <p className="text-sm text-red-600 mt-1">{errors.email}</p>
            )}
          </div>

          <div>
            <Label htmlFor="lead-name">Name (Optional)</Label>
            <Input
              id="lead-name"
              type="text"
              placeholder="Your name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              disabled={disabled || isSubmitting}
            />
            {errors.name && (
              <p className="text-sm text-red-600 mt-1">{errors.name}</p>
            )}
          </div>

          <div>
            <Label htmlFor="lead-phone">Phone (Optional)</Label>
            <Input
              id="lead-phone"
              type="tel"
              placeholder="(555) 123-4567"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              disabled={disabled || isSubmitting}
            />
            {errors.phone && (
              <p className="text-sm text-red-600 mt-1">{errors.phone}</p>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="investor-interest"
              checked={formData.isInvestor}
              onCheckedChange={(checked) => handleInputChange('isInvestor', checked)}
              disabled={disabled || isSubmitting}
            />
            <Label
              htmlFor="investor-interest"
              className="text-sm cursor-pointer"
            >
              I'm interested in learning about investment opportunities
            </Label>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={disabled || isSubmitting || !formData.email}
          >
            {isSubmitting ? 'Submitting...' : 'Join Our List'}
          </Button>

          <p className="text-xs text-gray-500 text-center">
            We respect your privacy. Unsubscribe at any time.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}