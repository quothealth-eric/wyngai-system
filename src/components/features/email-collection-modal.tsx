'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Heart, Mail, User, Loader2 } from 'lucide-react'

interface EmailCollectionModalProps {
  isOpen: boolean
  onClose: () => void
  uploadedFiles: any[]
  description: string
  benefits: any
}

export function EmailCollectionModal({
  isOpen,
  onClose,
  uploadedFiles,
  description,
  benefits
}: EmailCollectionModalProps) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [subscribeToUpdates, setSubscribeToUpdates] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; name?: string }>({})

  const validateForm = () => {
    const newErrors: { email?: string; name?: string } = {}

    if (!email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!name.trim()) {
      newErrors.name = 'Name is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) return

    setIsSubmitting(true)

    try {
      // Store the submission data (this could be sent to your backend)
      const submissionData = {
        email: email.trim(),
        name: name.trim(),
        subscribeToUpdates,
        uploadedFiles: uploadedFiles.map(f => ({
          name: f.name,
          size: f.size,
          type: f.type
        })),
        description,
        benefits,
        timestamp: new Date().toISOString()
      }

      console.log('📤 Submitting analysis request:', submissionData)

      // TODO: Send to your backend API to queue the analysis
      // await fetch('/api/analysis-queue', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(submissionData)
      // })

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Redirect to company website
      window.location.href = 'https://www.mywyng.co'

    } catch (error) {
      console.error('❌ Submission failed:', error)
      // Handle error - you might want to show an error message instead of redirecting
      alert('There was an error submitting your request. Please try again.')
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <Heart className="h-12 w-12 text-primary" />
              <div className="absolute -top-1 -right-1">
                <Mail className="h-5 w-5 text-accent bg-white rounded-full p-0.5" />
              </div>
            </div>
          </div>
          <DialogTitle className="text-2xl font-bold text-gray-900">
            Almost Done!
          </DialogTitle>
          <DialogDescription className="text-base text-gray-600">
            We'll analyze your {uploadedFiles.length} document{uploadedFiles.length !== 1 ? 's' : ''} and send you a detailed report via email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-6">
          {/* Name Input */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <User className="h-4 w-4" />
              Your Name
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="Enter your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={errors.name ? 'border-red-500' : ''}
              disabled={isSubmitting}
            />
            {errors.name && (
              <p className="text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          {/* Email Input */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={errors.email ? 'border-red-500' : ''}
              disabled={isSubmitting}
            />
            {errors.email && (
              <p className="text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          {/* Newsletter Subscription */}
          <div className="flex items-start space-x-3 p-3 bg-secondary/50 rounded-lg">
            <Checkbox
              id="subscribe"
              checked={subscribeToUpdates}
              onCheckedChange={(checked) => setSubscribeToUpdates(checked === true)}
              disabled={isSubmitting}
            />
            <div className="space-y-1 leading-none">
              <Label
                htmlFor="subscribe"
                className="text-sm font-medium cursor-pointer"
              >
                Stay updated with Wyng
              </Label>
              <p className="text-xs text-gray-600">
                Get updates on new features and medical billing insights. Unsubscribe anytime.
              </p>
            </div>
          </div>

          {/* Analysis Summary */}
          <div className="bg-gray-50 p-4 rounded-lg text-sm">
            <h4 className="font-medium text-gray-900 mb-2">What happens next?</h4>
            <ul className="space-y-1 text-gray-600">
              <li>• We'll analyze your documents for billing errors</li>
              <li>• You'll receive a detailed report via email</li>
              <li>• Get phone scripts and appeal letters if needed</li>
              <li>• Processing typically takes 24-48 hours</li>
            </ul>
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full btn-wyng-gradient text-lg py-3"
            size="lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Send My Analysis
                <Mail className="h-5 w-5 ml-2" />
              </>
            )}
          </Button>

          <p className="text-xs text-center text-gray-500">
            By submitting, you agree to receive your analysis results via email.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}