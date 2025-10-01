import { LLMResponse } from './validations'
import { ChatContext } from './anthropic'

interface WyngAIAskRequest {
  question: string
  max_results?: number
  alpha?: number
  require_citations?: boolean
}

interface WyngAIAskResponse {
  answer: string
  citations: Array<{
    text: string
    url: string
    citation?: string
    authority_rank: number
    section_path: string[]
  }>
  search_results: Array<{
    rank: number
    score: number
    title: string
    text_preview: string
    authority_rank: number
    explanation: string
  }>
  query_id: string
  processing_time_ms: number
}

interface WyngAISearchResult {
  query: string
  results: Array<{
    rank: number
    score: number
    chunk_id: string
    text: string
    section_path: string[]
    authority_rank: number
    citations: string[]
    explanation: string
  }>
}

/**
 * WyngAI RAG client for healthcare question answering
 */
export class WyngAIClient {
  private baseUrl: string
  private timeout: number

  constructor(baseUrl?: string, timeout = 30000) {
    // In production, use internal API route; in development, use external service
    const defaultUrl = process.env.NODE_ENV === 'production'
      ? '/api/wyngai'
      : 'http://localhost:8000'

    this.baseUrl = baseUrl || process.env.WYNGAI_RAG_ENDPOINT || defaultUrl
    this.timeout = timeout
  }

  /**
   * Ask a healthcare question using WyngAI RAG
   */
  async ask(request: WyngAIAskRequest): Promise<WyngAIAskResponse> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      // Convert to new WyngAI API format
      const newRequest = {
        question: request.question,
        max_results: request.max_results || 5,
        include_citations: request.require_citations !== false
      }

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newRequest),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`WyngAI RAG API error: ${response.status} ${response.statusText}`)
      }

      const newResponse = await response.json()

      console.log('🔥 WyngAI: Raw API response:', JSON.stringify({
        hasAnswer: !!newResponse.answer,
        sourcesCount: newResponse.sources?.length || 0,
        metadata: newResponse.metadata
      }))

      // Validate API response
      if (!newResponse.answer) {
        throw new Error('No answer received from WyngAI API')
      }

      if (!newResponse.sources || !Array.isArray(newResponse.sources)) {
        throw new Error('Invalid sources format in WyngAI API response')
      }

      // Convert new API response to expected format
      return {
        answer: newResponse.answer,
        citations: newResponse.sources.map((source: any) => ({
          text: source.excerpt || source.text || 'No excerpt available',
          url: '', // Not provided in new API
          citation: Array.isArray(source.citations) ? source.citations.join('; ') : (source.citations || 'No citation'),
          authority_rank: source.authority_rank || 0.8,
          section_path: Array.isArray(source.section_path) ? source.section_path : ['Unknown Section']
        })),
        search_results: newResponse.sources.map((source: any, index: number) => ({
          rank: index + 1,
          score: source.authority_rank || 0.8,
          title: Array.isArray(source.section_path) ? source.section_path.join(' > ') : 'Unknown Section',
          text_preview: source.excerpt || source.text || 'No preview available',
          authority_rank: source.authority_rank || 0.8,
          explanation: `Authority: ${((source.authority_rank || 0.8) * 100).toFixed(0)}%`
        })),
        query_id: `query_${Date.now()}`,
        processing_time_ms: 100 // Estimated
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`WyngAI RAG request timeout after ${this.timeout}ms`)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Direct search for chunks (useful for debugging)
   */
  async search(query: string, k = 10, alpha = 0.5): Promise<WyngAISearchResult> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, k, alpha }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`WyngAI search API error: ${response.status} ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`WyngAI search request timeout after ${this.timeout}ms`)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Health check for the RAG service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch {
      return false
    }
  }
}

// Global WyngAI client instance
const wyngAIClient = new WyngAIClient()

/**
 * Generate WyngAI response from chat context
 * This is the main function called by the anthropic.ts integration
 */
export async function generateWyngAIResponse(context: ChatContext): Promise<LLMResponse> {
  console.log('🔥 WyngAI: Generating response for healthcare question...')
  console.log('🔥 WyngAI: Context received:', JSON.stringify({
    userQuestion: context.userQuestion,
    hasOcrTexts: !!context.ocrTexts?.length,
    hasBenefits: !!context.benefits,
    hasLawBasis: !!context.lawBasis?.length
  }))

  try {
    // Extract the user's question from context
    let question = context.userQuestion || ''

    // If no explicit question, try to extract from OCR texts (uploaded documents)
    if (!question && context.ocrTexts && context.ocrTexts.length > 0) {
      // Look for question-like patterns in OCR text
      const ocrText = context.ocrTexts.join(' ')
      if (ocrText.length > 10) {
        question = ocrText.substring(0, 200) + '...' // Use first part of OCR as context
      }
    }

    // Fallback
    if (!question) {
      question = 'General healthcare regulation question'
    }

    console.log(`🔥 WyngAI: Processing question: "${question}"`)

    // Validate question is meaningful
    if (!question || question.length < 3) {
      throw new Error('Question is too short or empty')
    }

    // Call WyngAI RAG system
    const wyngAIResponse = await wyngAIClient.ask({
      question,
      max_results: 5,
      require_citations: true
    })

    console.log(`🔥 WyngAI: Successfully generated answer with ${wyngAIResponse.citations.length} citations`)

    // Check if we got meaningful results
    if (wyngAIResponse.citations.length === 0) {
      console.log('🔥 WyngAI: No citations found - question may be outside healthcare regulation scope')
      throw new Error('No relevant healthcare regulation information found for this question')
    }

    // Calculate confidence from citations
    const avgAuthority = wyngAIResponse.citations.length > 0
      ? wyngAIResponse.citations.reduce((sum, citation) => sum + citation.authority_rank, 0) / wyngAIResponse.citations.length
      : 0.8 // Default fallback

    console.log(`🔥 WyngAI: Calculated average authority: ${(avgAuthority * 100).toFixed(0)}%`)

    // Check if authority is too low (indicates poor match)
    if (avgAuthority < 0.3) {
      console.log('🔥 WyngAI: Low authority score indicates poor match')
      throw new Error(`Low confidence match (${(avgAuthority * 100).toFixed(0)}%) - question may be outside healthcare regulation scope`)
    }

    // Convert WyngAI response to LLMResponse format
    const llmResponse: LLMResponse = {
      reassurance_message: "This information is provided based on healthcare regulations and policies.",
      problem_summary: wyngAIResponse.answer.substring(0, 300) + "...",
      missing_info: [],
      benefit_snapshot: {},
      what_you_should_owe: "Based on the analysis provided above",
      errors_detected: [],
      insurer_specific_guidance: [],
      law_basis: [],
      citations: wyngAIResponse.citations.map(citation => ({
        label: citation.section_path.join(' > '),
        reference: citation.citation || 'Healthcare Regulation'
      })),
      step_by_step: [],
      if_no_then: [],
      needs_appeal: false,
      appeal_letter: null,
      phone_script: null,
      final_checklist: [],
      links_citations: wyngAIResponse.citations.map(citation => ({
        text: citation.text.substring(0, 100) + '...',
        url: citation.url || ''
      })),
      narrative_summary: wyngAIResponse.answer,
      confidence: Math.min(100, Math.max(70, avgAuthority * 100))
    }

    console.log(`🔥 WyngAI: Response generated successfully with confidence ${llmResponse.confidence.toFixed(0)}%`)

    return llmResponse

  } catch (error) {
    console.error('🔥 WyngAI: Error generating response:', error)
    throw new Error(`WyngAI failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}