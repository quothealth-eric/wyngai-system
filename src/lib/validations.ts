import { z } from 'zod'

export const leadSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  name: z.string().optional(),
  phone: z.string().optional(),
  isInvestor: z.boolean().default(false),
})

export const benefitsSchema = z.object({
  deductible: z.number().min(0).optional(),
  coinsurance: z.number().min(0).max(100).optional(),
  copay: z.number().min(0).optional(),
  oopMax: z.number().min(0).optional(),
  insurerName: z.string().optional(),
  planType: z.string().optional(),
  deductibleMet: z.enum(['not_met', 'partially_met', 'fully_met', 'unknown']).optional(),
  amountPaidToDeductible: z.number().min(0).optional(),
})

export const chatMessageSchema = z.object({
  message: z.string().min(1, 'Please enter a message'),
  benefits: benefitsSchema.optional(),
  fileIds: z.array(z.string()).optional(),
})

export const fileUploadSchema = z.object({
  file: z.any().refine(
    (file) => {
      if (!file || typeof file !== 'object') return false
      return file.size <= 10 * 1024 * 1024 // 10MB
    },
    'File size must be less than 10MB'
  ).refine(
    (file) => {
      if (!file || typeof file !== 'object') return false
      const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']
      return allowedTypes.includes(file.type)
    },
    'File must be JPEG, PNG, or PDF'
  ),
})

export const donationSchema = z.object({
  amount: z.number().min(1, 'Minimum donation is $1'),
  email: z.string().email().optional(),
})

// LLM Response Schema - matches the spec requirements
export const llmResponseSchema = z.object({
  reassurance_message: z.string(),
  problem_summary: z.string(),
  missing_info: z.array(z.string()),
  benefit_snapshot: z.object({
    deductible: z.string().optional(),
    coinsurance: z.string().optional(),
    copay: z.string().optional(),
    oop_max: z.string().optional(),
  }).optional(),
  what_you_should_owe: z.string().optional(),
  errors_detected: z.array(z.string()),
  insurer_specific_guidance: z.array(z.string()),
  law_basis: z.array(z.string()),
  citations: z.array(z.object({
    label: z.string(),
    reference: z.string(),
  })),
  step_by_step: z.array(z.string()),
  if_no_then: z.array(z.string()),
  needs_appeal: z.boolean(),
  appeal_letter: z.string().nullable().optional(),
  phone_script: z.string().nullable().optional(),
  final_checklist: z.array(z.string()),
  links_citations: z.array(z.object({
    text: z.string(),
    url: z.string(),
  })),
  narrative_summary: z.string(),
  confidence: z.number().min(0).max(100),
})

export type LeadData = z.infer<typeof leadSchema>
export type BenefitsData = z.infer<typeof benefitsSchema>
export type ChatMessageData = z.infer<typeof chatMessageSchema>
export type FileUploadData = z.infer<typeof fileUploadSchema>
export type DonationData = z.infer<typeof donationSchema>
export type LLMResponse = z.infer<typeof llmResponseSchema>

// Utility function to redact sensitive information
export function redactSensitiveInfo(text: string): string {
  // Redact email addresses
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
  text = text.replace(emailRegex, '[EMAIL_REDACTED]')

  // Redact phone numbers (various formats)
  const phoneRegex = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g
  text = text.replace(phoneRegex, '[PHONE_REDACTED]')

  // Redact SSN patterns
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g
  text = text.replace(ssnRegex, '[SSN_REDACTED]')

  return text
}