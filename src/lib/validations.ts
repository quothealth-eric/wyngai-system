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