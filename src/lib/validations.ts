import { z } from "zod"

export interface BenefitsData {
  planType?: string
  network?: string
  deductible?: {
    individual?: number
    family?: number
    met?: number
  }
  coinsurance?: number
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
  name: z.string().optional()
})

