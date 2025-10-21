/**
 * Enhanced Answer Composer
 * Generates structured, cited responses from RAG retrieval results
 */

import OpenAI from 'openai'
import { RetrievalResult, ChatResponse, ExtractedEntities, ChatContext, Citation, Script, Form, ActionableLink } from '../types/rag'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

interface ComposerContext {
  query: string
  entities: ExtractedEntities
  retrievalResult: RetrievalResult
  chatContext: ChatContext
}

export class EnhancedAnswerComposer {
  /**
   * Main answer composition method
   */
  async composeAnswer(
    query: string,
    entities: ExtractedEntities,
    retrievalResult: RetrievalResult,
    chatContext: ChatContext
  ): Promise<ChatResponse> {
    const context: ComposerContext = {
      query,
      entities,
      retrievalResult,
      chatContext
    }

    try {
      // Generate the main answer using OpenAI
      const answer = await this.generateAnswer(context)

      // Extract citations from retrieval results
      const citations = this.generateCitations(retrievalResult)

      // Generate actionable next steps
      const nextSteps = this.generateNextSteps(context)

      // Generate call scripts
      const scripts = this.generateScripts(context)

      // Generate relevant forms
      const forms = this.generateForms(context)

      // Generate actionable links
      const actionableLinks = this.generateActionableLinks(context)

      // Generate jargon explanations
      const jargonExplanations = this.generateJargonExplanations(query, answer)

      // Calculate confidence based on source quality and answer completeness
      const confidence = this.calculateConfidence(retrievalResult, answer)

      return {
        answer,
        citations,
        nextSteps,
        scripts,
        forms,
        confidence,
        authorities_used: retrievalResult.authorities_used,
        actionableLinks,
        jargonExplanations
      }

    } catch (error) {
      console.error('Answer composition failed:', error)
      throw error
    }
  }

  /**
   * Generate the main answer using OpenAI with RAG context
   */
  private async generateAnswer(context: ComposerContext): Promise<string> {
    const { query, entities, retrievalResult, chatContext } = context

    // Build context from retrieved sections
    const sourceContext = retrievalResult.sections
      .map((section, index) => {
        const doc = section.document
        return `[Source ${index + 1}: ${doc.authority.toUpperCase()} - ${doc.title}]
${section.section.text}

`
      })
      .join('\n')

    // Build user context
    const userContext = this.buildUserContext(entities, chatContext)

    const systemPrompt = `You are WyngAI, a healthcare guardian angel that provides authoritative, accurate guidance on health insurance questions. Your responses must be:

1. **Authoritative**: Base answers strictly on the provided sources
2. **Practical**: Focus on actionable guidance
3. **Empathetic**: Use a warm, supportive tone like a caring advocate
4. **Comprehensive**: Address the core question and related concerns
5. **Cited**: Reference specific sources when making claims

Guidelines:
- Always prioritize federal regulations and CMS guidance over other sources
- When state-specific, clearly indicate which state's rules apply
- Include specific time limits, deadlines, and requirements
- Mention both member rights and responsibilities
- Explain complex terms in plain English
- If information conflicts between sources, note the hierarchy (federal > CMS > state > payer)

Format your response in clear paragraphs with actionable guidance.`

    const userPrompt = `Based on the authoritative sources provided below, answer this health insurance question:

**Question**: ${query}

**User Context**: ${userContext}

**Authoritative Sources**:
${sourceContext}

**Instructions**:
- Provide a clear, actionable answer based on the sources
- Use plain English and explain any complex terms
- Include specific requirements, deadlines, or limitations mentioned in sources
- If the answer varies by state or plan type, clearly explain the differences
- Focus on what the person should do next and their rights/options

Answer:`

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 1500
      })

      return response.choices[0]?.message?.content || 'I apologize, but I was unable to generate a response. Please try rephrasing your question.'

    } catch (error) {
      console.error('OpenAI API error:', error)
      throw new Error('Failed to generate answer')
    }
  }

  /**
   * Build user context string from entities and chat context
   */
  private buildUserContext(entities: ExtractedEntities, chatContext: ChatContext): string {
    const contextParts: string[] = []

    if (entities.planType) {
      contextParts.push(`Plan Type: ${entities.planType}`)
    }

    if (entities.state) {
      contextParts.push(`State: ${entities.state}`)
    }

    if (chatContext.planInputs?.planName) {
      contextParts.push(`Plan: ${chatContext.planInputs.planName}`)
    }

    if (chatContext.planInputs?.deductible) {
      contextParts.push(`Deductible: $${chatContext.planInputs.deductible.individual} individual / $${chatContext.planInputs.deductible.family} family`)
    }

    if (entities.date_of_service) {
      contextParts.push(`Date of Service: ${entities.date_of_service}`)
    }

    return contextParts.length > 0 ? contextParts.join('; ') : 'No specific context provided'
  }

  /**
   * Generate citations from retrieval results
   */
  private generateCitations(retrievalResult: RetrievalResult): Citation[] {
    return retrievalResult.sections.map((section, index) => {
      const doc = section.document

      return {
        authority: doc.authority,
        title: doc.title,
        section_or_policy_id: section.section.section_path,
        eff_date: doc.eff_date,
        url: doc.url,
        excerpt: section.highlighted_text || section.section.text.slice(0, 200) + '...'
      }
    })
  }

  /**
   * Generate actionable next steps based on query type and context
   */
  private generateNextSteps(context: ComposerContext): string[] {
    const { entities } = context
    const steps: string[] = []

    // Determine next steps based on query intent and entities
    if (entities.intent?.includes('enrollment')) {
      steps.push('Check your eligibility for Special Enrollment Period if outside Open Enrollment')
      steps.push('Gather required documents (pay stubs, tax returns, current coverage info)')
      steps.push('Compare plan options on your state marketplace or Healthcare.gov')
    } else if (entities.intent?.includes('prior_auth')) {
      steps.push('Contact your insurance company using the number on your ID card')
      steps.push('Ask your provider to submit the prior authorization request')
      steps.push('Follow up within 14 days if no response received')
    } else if (entities.intent?.includes('appeal')) {
      steps.push('File your appeal within the required timeframe (usually 60 days)')
      steps.push('Gather all relevant medical records and documentation')
      steps.push('Consider requesting an expedited review if urgent')
    } else {
      // Generic next steps
      steps.push('Review your plan documents for specific coverage details')
      steps.push('Contact your insurance company customer service for clarification')
      steps.push('Keep detailed records of all communications')
    }

    return steps
  }

  /**
   * Generate call scripts for different scenarios
   */
  private generateScripts(context: ComposerContext): Script[] {
    const { entities } = context
    const scripts: Script[] = []

    // Payer call script
    scripts.push({
      channel: 'payer',
      purpose: 'Get information about your coverage',
      body: `"Hi, I'm calling about my health insurance coverage. My member ID is [YOUR_ID]. I have a question about ${this.getScriptTopic(entities)}. Can you help me understand my benefits and any requirements I need to follow?"`,
      estimated_duration: '10-15 minutes'
    })

    // Provider call script if relevant
    if (entities.intent?.includes('prior_auth') || entities.intent?.includes('referral')) {
      scripts.push({
        channel: 'provider',
        purpose: 'Request provider assistance',
        body: `"I need help with ${entities.intent?.includes('prior_auth') ? 'getting prior authorization' : 'getting a referral'} for [DESCRIBE SERVICE]. My insurance requires this, and I want to make sure we follow the correct process. Can you help me with the paperwork?"`,
        estimated_duration: '5-10 minutes'
      })
    }

    // State DOI script for appeals/complaints
    if (entities.intent?.includes('appeal') || entities.intent?.includes('complaint')) {
      scripts.push({
        channel: 'state_doi',
        purpose: 'File complaint with state insurance department',
        body: `"I need to file a complaint about my health insurance company. They ${this.getComplaintReason(entities)}. I've already tried working with them directly. Can you help me file a formal complaint?"`,
        estimated_duration: '15-20 minutes'
      })
    }

    return scripts
  }

  /**
   * Generate relevant forms based on context
   */
  private generateForms(context: ComposerContext): Form[] {
    const { entities } = context
    const forms: Form[] = []

    if (entities.intent?.includes('appeal')) {
      forms.push({
        name: 'Health Insurance Appeal Form',
        description: 'Standard form for filing an internal appeal',
        required_info: ['Member ID', 'Claim number', 'Date of service', 'Reason for appeal']
      })
    }

    if (entities.intent?.includes('prior_auth')) {
      forms.push({
        name: 'Prior Authorization Request',
        description: 'Medical provider form for requesting prior authorization',
        required_info: ['Provider information', 'Member information', 'Requested service/medication', 'Medical justification']
      })
    }

    if (entities.intent?.includes('external_review')) {
      forms.push({
        name: 'External Review Request',
        description: 'Independent review request form for denied claims',
        required_info: ['Completed internal appeals', 'Medical records', 'Denial letters', 'Request within 60 days']
      })
    }

    return forms
  }

  /**
   * Generate actionable links based on user context
   */
  private generateActionableLinks(context: ComposerContext): ActionableLink[] {
    const { entities } = context
    const links: ActionableLink[] = []

    // Healthcare.gov or state marketplace
    if (entities.state) {
      const isStateBased = this.isStateBasedMarketplace(entities.state)
      if (isStateBased) {
        links.push({
          text: `${entities.state} State Marketplace`,
          url: this.getStateMarketplaceUrl(entities.state),
          description: `Official ${entities.state} health insurance marketplace`
        })
      } else {
        links.push({
          text: 'Healthcare.gov',
          url: 'https://www.healthcare.gov',
          description: 'Federal health insurance marketplace'
        })
      }
    }

    // State Department of Insurance
    if (entities.state) {
      links.push({
        text: `${entities.state} Department of Insurance`,
        url: this.getStateDOIUrl(entities.state),
        description: `File complaints and get help with insurance issues in ${entities.state}`
      })
    }

    // Patient advocacy resources
    links.push({
      text: 'Patient Advocate Foundation',
      url: 'https://www.patientadvocate.org/connect-with-services/',
      description: 'Free assistance from trained patient advocates'
    })

    links.push({
      text: 'Healthcare Financial Hardship',
      url: 'https://www.patientadvocate.org/explore-our-resources/patient-resource-center/',
      description: 'Resources for managing healthcare costs and bills'
    })

    return links
  }

  /**
   * Generate jargon explanations for complex terms
   */
  private generateJargonExplanations(query: string, answer: string): Array<{ term: string; definition: string; example?: string }> {
    const jargonTerms = [
      {
        term: 'Prior Authorization',
        definition: 'Approval from your insurance company before receiving certain medical services or medications',
        example: 'Your doctor needs prior authorization before scheduling an MRI'
      },
      {
        term: 'Special Enrollment Period',
        definition: 'A time outside of Open Enrollment when you can sign up for health insurance due to qualifying life events',
        example: 'Losing your job, getting married, or moving to a new state'
      },
      {
        term: 'Network',
        definition: 'The group of doctors, hospitals, and other healthcare providers that work with your insurance plan',
        example: 'Going to an in-network doctor costs less than out-of-network'
      },
      {
        term: 'EOB',
        definition: 'Explanation of Benefits - a statement from your insurance showing what they paid and what you owe',
        example: 'The EOB shows your insurance paid $800 and you owe $200'
      },
      {
        term: 'External Review',
        definition: 'An independent review of your insurance company\'s decision by neutral medical experts',
        example: 'If your internal appeal is denied, you can request an external review'
      }
    ]

    // Find terms mentioned in query or answer
    const combinedText = (query + ' ' + answer).toLowerCase()
    return jargonTerms.filter(term =>
      combinedText.includes(term.term.toLowerCase()) ||
      combinedText.includes(term.term.toLowerCase().replace(/\s+/g, ''))
    )
  }

  /**
   * Calculate confidence score based on source quality and completeness
   */
  private calculateConfidence(retrievalResult: RetrievalResult, answer: string): number {
    let confidence = 0.5 // Base confidence

    // Authority quality boost
    const authorities = retrievalResult.authorities_used
    if (authorities.includes('federal')) confidence += 0.3
    if (authorities.includes('cms')) confidence += 0.2
    if (authorities.includes('state_doi')) confidence += 0.1

    // Number of sources boost
    const sourceCount = retrievalResult.sections.length
    confidence += Math.min(sourceCount * 0.05, 0.2)

    // Answer completeness boost
    if (answer.length > 500) confidence += 0.1
    if (answer.includes('deadline') || answer.includes('within')) confidence += 0.05
    if (answer.includes('specific') || answer.includes('required')) confidence += 0.05

    // Semantic match quality (average of top 3 scores)
    const topScores = retrievalResult.sections
      .slice(0, 3)
      .map(s => s.score)
    if (topScores.length > 0) {
      const avgScore = topScores.reduce((sum, score) => sum + score, 0) / topScores.length
      confidence += avgScore * 0.2
    }

    return Math.min(confidence, 1.0)
  }

  /**
   * Helper methods for scripts and links
   */
  private getScriptTopic(entities: ExtractedEntities): string {
    if (entities.intent?.includes('prior_auth')) return 'prior authorization requirements'
    if (entities.intent?.includes('coverage')) return 'my coverage benefits'
    if (entities.intent?.includes('claim')) return 'a claim issue'
    if (entities.intent?.includes('appeal')) return 'filing an appeal'
    return 'my benefits and coverage'
  }

  private getComplaintReason(entities: ExtractedEntities): string {
    if (entities.intent?.includes('denied')) return 'improperly denied my claim'
    if (entities.intent?.includes('delay')) return 'delayed processing my claim'
    if (entities.intent?.includes('prior_auth')) return 'unfairly denied prior authorization'
    return 'not followed proper procedures'
  }

  private isStateBasedMarketplace(state: string): boolean {
    const stateBased = ['CA', 'CO', 'CT', 'DC', 'ID', 'MA', 'MD', 'MN', 'NV', 'NY', 'PA', 'RI', 'VT', 'WA']
    return stateBased.includes(state.toUpperCase())
  }

  private getStateMarketplaceUrl(state: string): string {
    const stateUrls: Record<string, string> = {
      'CA': 'https://www.coveredca.com',
      'CO': 'https://connectforhealthco.com',
      'CT': 'https://www.accesshealthct.com',
      'DC': 'https://dchealthlink.com',
      'ID': 'https://www.yourhealthidaho.org',
      'MA': 'https://www.mahealthconnector.org',
      'MD': 'https://www.marylandhealthconnection.gov',
      'MN': 'https://www.mnsure.org',
      'NV': 'https://www.nevadahealthlink.com',
      'NY': 'https://nystateofhealth.ny.gov',
      'PA': 'https://www.pennie.com',
      'RI': 'https://www.healthsourceri.com',
      'VT': 'https://www.vermonthealthconnect.gov',
      'WA': 'https://www.wahealthplanfinder.org'
    }
    return stateUrls[state.toUpperCase()] || 'https://www.healthcare.gov'
  }

  private getStateDOIUrl(state: string): string {
    // This would be a comprehensive mapping of state DOI URLs
    // For now, returning a generic NAIC link
    return `https://content.naic.org/consumer/contact-your-state-insurance-regulator`
  }
}