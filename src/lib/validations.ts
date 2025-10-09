// Temporary validation fallbacks
export interface BenefitsData {
  [key: string]: any
}

export interface LeadData {
  [key: string]: any
}

export interface LLMResponse {
  [key: string]: any
}

export const leadSchema = {
  parse: (data: any) => data
}

export const benefitsSchema = {
  parse: (data: any) => data
}

export const llmResponseSchema = {
  parse: (data: any) => data
}