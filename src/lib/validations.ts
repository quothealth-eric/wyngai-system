import { z } from "zod"

export interface BenefitsData {
  insurerName?: string
  planType?: string
  network?: string
  deductible?: number | {
    individual?: number
    family?: number
    met?: number
  }
  deductibleMet?: 'fully_met' | 'not_met' | 'partially_met' | 'unknown'
  amountPaidToDeductible?: number
  coinsurance?: number
  copay?: number
  oopMax?: number
  copays?: Record<string, number>
  priorAuthRequired?: boolean
  referralRequired?: boolean
}

export interface LeadData {
  email?: string
  phone?: string
  name?: string
}

export interface LLMResponse {
  answer: string
  confidence: number
  sources?: Array<{
    title: string
    authority: string
    citation: string
  }>
}

export const leadSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  name: z.string().optional(),
  isInvestor: z.boolean().optional()
})

export const chatMessageSchema = z.object({
  message: z.string(),
  benefits: z.object({
    planType: z.string().optional(),
    network: z.string().optional(),
    deductible: z.object({
      individual: z.number().optional(),
      family: z.number().optional(),
      met: z.number().optional()
    }).optional(),
    coinsurance: z.number().optional(),
    copays: z.record(z.number()).optional(),
    priorAuthRequired: z.boolean().optional(),
    referralRequired: z.boolean().optional()
  }).optional(),
  fileIds: z.array(z.string()).optional()
})

export const donationSchema = z.object({
  amount: z.number().positive(),
  email: z.string().email(),
  name: z.string().optional()
})

export const benefitsSchema = z.object({
  insurerName: z.string().optional(),
  planType: z.string().optional(),
  network: z.string().optional(),
  deductible: z.union([
    z.number(),
    z.object({
      individual: z.number().optional(),
      family: z.number().optional(),
      met: z.number().optional()
    })
  ]).optional(),
  deductibleMet: z.enum(['fully_met', 'not_met', 'partially_met', 'unknown']).optional(),
  amountPaidToDeductible: z.number().optional(),
  coinsurance: z.number().optional(),
  copay: z.number().optional(),
  oopMax: z.number().optional(),
  copays: z.record(z.number()).optional(),
  priorAuthRequired: z.boolean().optional(),
  referralRequired: z.boolean().optional()
})

export const llmResponseSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
  sources: z.array(z.object({
    title: z.string(),
    authority: z.string(),
    citation: z.string()
  })).optional()
})

export const redactSensitiveInfo = (text: string): string => {
  // Simple redaction function - in production this would be more sophisticated
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '***-**-****')  // SSN
    .replace(/\b\d{16}\b/g, '****************')         // Credit card
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, '**** **** **** ****') // Credit card with spaces
}

