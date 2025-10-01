/**
 * Enhanced RAG Integration for Healthcare Chatbot
 * Provides citation-based responses from authoritative sources
 */

interface Citation {
  source_id: string
  title: string
  url: string
  authority_rank: number
  excerpt: string
  section_path: string[]
}

interface EnhancedRAGResponse {
  answer: string
  confidence: number
  citations: Citation[]
  authority_sources: string[]
  legal_basis: string[]
  guidance_summary: string
  requires_professional_review: boolean
}

interface RAGContext {
  lawBasis: string[]
  policyGuidance: string[]
  enhancedGuidance: string[]
  citations: Citation[]
}

export class EnhancedRAGService {
  private ragEndpoint: string

  constructor() {
    // Use local RAG service in development, can be configured for production
    this.ragEndpoint = process.env.RAG_ENDPOINT || 'http://localhost:8000'
  }

  /**
   * Query the enhanced RAG service for authoritative healthcare guidance
   */
  async getAuthoritativeGuidance(
    question: string,
    context?: string,
    maxSources: number = 5
  ): Promise<EnhancedRAGResponse | null> {
    try {
      const response = await fetch(`${this.ragEndpoint}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context,
          max_sources: maxSources,
          authority_threshold: 0.7
        })
      })

      if (!response.ok) {
        console.error('RAG service error:', response.statusText)
        return null
      }

      return await response.json() as EnhancedRAGResponse
    } catch (error) {
      console.error('Failed to query RAG service:', error)
      return null
    }
  }

  /**
   * Build enhanced RAG context from response
   */
  buildRAGContext(ragResponse: EnhancedRAGResponse | null): RAGContext {
    if (!ragResponse) {
      return {
        lawBasis: [],
        policyGuidance: [],
        enhancedGuidance: [],
        citations: []
      }
    }

    return {
      lawBasis: ragResponse.legal_basis || [],
      policyGuidance: ragResponse.authority_sources?.map(source =>
        `According to ${source}: Review applicable guidance`
      ) || [],
      enhancedGuidance: [ragResponse.guidance_summary].filter(Boolean),
      citations: ragResponse.citations || []
    }
  }

  /**
   * Format RAG context for LLM consumption
   */
  formatRAGContextForLLM(context: RAGContext) {
    return {
      lawBasis: context.lawBasis.join('\n'),
      policyGuidance: context.policyGuidance.join('\n'),
      enhancedGuidance: context.enhancedGuidance.join('\n'),
      citations: context.citations
    }
  }

  /**
   * Generate citation-backed response
   */
  formatCitationResponse(ragResponse: EnhancedRAGResponse): string {
    const parts = []

    // Add main answer
    parts.push(ragResponse.answer)

    // Add citations section
    if (ragResponse.citations?.length > 0) {
      parts.push('\n\n**Sources:**')
      ragResponse.citations.forEach((citation, idx) => {
        parts.push(`${idx + 1}. ${citation.title}`)
        if (citation.url) {
          parts.push(`   URL: ${citation.url}`)
        }
        if (citation.section_path?.length > 0) {
          parts.push(`   Section: ${citation.section_path.join(' > ')}`)
        }
      })
    }

    // Add professional review notice if needed
    if (ragResponse.requires_professional_review) {
      parts.push('\n\n⚠️ **Important:** This situation may require professional review. Consider consulting with a healthcare advocate or attorney specializing in healthcare law.')
    }

    // Add confidence indicator
    if (ragResponse.confidence < 0.7) {
      parts.push('\n\n📊 **Confidence:** Moderate - Additional research may be beneficial')
    }

    return parts.join('\n')
  }
}

// Default instance for use in API routes
export const enhancedRAG = new EnhancedRAGService()

/**
 * Fallback responses for when RAG is unavailable
 */
export const fallbackResponses = {
  noAuthoritativeSources: {
    reassurance_message: "I understand you're looking for healthcare guidance.",
    problem_summary: "I cannot provide specific guidance without access to authoritative sources.",
    missing_info: ["Unable to access healthcare regulations database"],
    errors_detected: [],
    insurer_specific_guidance: [],
    law_basis: [],
    citations: [],
    step_by_step: [
      "Contact your insurance company directly for plan-specific information",
      "Request written documentation of any coverage decisions",
      "Consider seeking help from a patient advocate"
    ],
    if_no_then: ["Contact your state insurance department for assistance"],
    needs_appeal: false,
    final_checklist: ["Keep all documentation", "Note dates and reference numbers"],
    links_citations: [],
    narrative_summary: "While I cannot access specific regulations at this moment, healthcare billing issues often have established resolution paths. Your insurance company and state insurance department are primary resources for assistance.",
    confidence: 20
  }
}

/**
 * Integrate RAG citations into existing response format
 */
export function enrichResponseWithCitations(
  baseResponse: any,
  ragResponse: EnhancedRAGResponse | null
): any {
  if (!ragResponse) {
    return baseResponse
  }

  // Enhance the response with RAG citations
  const enriched = {
    ...baseResponse,
    // Add authoritative law basis
    law_basis: [
      ...baseResponse.law_basis || [],
      ...ragResponse.legal_basis || []
    ],
    // Add citations with proper formatting
    citations: [
      ...baseResponse.citations || [],
      ...ragResponse.citations?.map(c => ({
        title: c.title,
        url: c.url,
        authority: c.authority_rank,
        excerpt: c.excerpt
      })) || []
    ],
    // Add authority sources
    authority_sources: ragResponse.authority_sources || [],
    // Update confidence based on RAG
    confidence: Math.max(
      baseResponse.confidence || 50,
      (ragResponse.confidence || 0) * 100
    ),
    // Add professional review flag
    requires_professional_review: ragResponse.requires_professional_review,
    // Enhance narrative with citation info
    narrative_summary: ragResponse.guidance_summary
      ? `${ragResponse.guidance_summary}\n\n${baseResponse.narrative_summary}`
      : baseResponse.narrative_summary
  }

  return enriched
}