import { CanonicalIntentClassifier, IntentClassificationV2 } from './canonical-intent-classifier'
import { HybridRetrieval, HybridRetrievalContext } from './hybrid-retrieval'
import { GroundedAnswerSynthesis, GroundedAnswer } from './grounded-answer-synthesis'
import { WyngCitationSystem } from './wyng-citation-system'
import { SafetyComplianceEngine, SafetyComplianceResult } from './safety-compliance'
import { EvaluationGatesEngine, QualityAssessment, FeatureFlags } from './evaluation-gates'
import { MultiDocumentProcessor, ExtractedDocumentData, SessionContext } from './multi-document-processor'

export interface EnhancedChatRequest {
  message: string
  fileIds?: string[]
  benefits?: any
  userLocation?: string
  productContext?: string
  sessionId?: string
}

export interface EnhancedChatResponse {
  // New enhanced fields
  groundedAnswer: GroundedAnswer
  intentClassification: IntentClassificationV2
  retrievalContext: HybridRetrievalContext
  safetyResult: SafetyComplianceResult
  qualityAssessment: QualityAssessment

  // Legacy compatibility fields
  reassurance_message: string
  problem_summary: string
  missing_info: string[]
  errors_detected: string[]
  step_by_step: string[]
  phone_script?: string
  appeal_letter?: string
  citations: Array<{ label: string; reference: string }>
  narrative_summary: string
  confidence: number

  // Enhanced metadata
  processingMetadata: {
    usedEnhancedPipeline: boolean
    fallbackReason?: string
    processingTime: number
    systemVersion: string
  }
}

export class EnhancedChatEngine {
  private static initialized = false
  private static sessionContexts = new Map<string, SessionContext>()

  static async initialize(customFlags?: Partial<FeatureFlags>): Promise<void> {
    if (this.initialized) return

    console.log('🚀 Initializing Enhanced Chat Engine')

    // Initialize all subsystems
    CanonicalIntentClassifier.initialize()
    HybridRetrieval.initialize()
    WyngCitationSystem.initialize()
    EvaluationGatesEngine.initialize(customFlags)

    this.initialized = true
    console.log('✅ Enhanced Chat Engine initialized successfully')
  }

  static async processRequest(request: EnhancedChatRequest): Promise<EnhancedChatResponse> {
    const startTime = Date.now()

    if (!this.initialized) {
      await this.initialize()
    }

    try {
      console.log('🔥 Processing enhanced chat request')
      console.log(`   📝 Message: ${request.message.substring(0, 100)}...`)
      console.log(`   📄 Files: ${request.fileIds?.length || 0}`)
      console.log(`   🌍 Location: ${request.userLocation || 'unknown'}`)
      console.log(`   💼 Product: ${request.productContext || 'unknown'}`)

      // Step 1: Check if enhanced pipeline should be used
      const useEnhanced = this.shouldUseEnhancedPipeline(request)

      if (!useEnhanced.enabled) {
        console.log(`⚠️ Falling back to legacy pipeline: ${useEnhanced.reason}`)
        return this.createLegacyCompatibleResponse(
          await this.processLegacyFallback(request),
          useEnhanced.reason,
          Date.now() - startTime
        )
      }

      // Step 2: Process uploaded documents if any
      let sessionContext: SessionContext | undefined
      let uploadedDocuments: any[] = []

      if (request.fileIds && request.fileIds.length > 0) {
        const documentResult = await this.processUploadedDocuments(request.fileIds, request.sessionId)
        sessionContext = documentResult.sessionContext
        uploadedDocuments = documentResult.processedDocuments
      }

      // Step 3: Classify intent using canonical questions
      const intentClassification = CanonicalIntentClassifier.classifyIntent(
        request.message,
        uploadedDocuments,
        request.userLocation,
        request.productContext
      )

      console.log(`🎯 Intent classified: ${intentClassification.primaryIntent.theme} (confidence: ${Math.round(intentClassification.confidence * 100)}%)`)

      // Step 4: Perform hybrid retrieval
      const retrievalContext = await HybridRetrieval.retrieveWithHybridSearch(
        request.message,
        sessionContext?.documents.map(d => d.rawText) || [],
        request.userLocation,
        request.productContext,
        uploadedDocuments
      )

      console.log(`🔍 Retrieved ${retrievalContext.fusedResults.length} relevant sources`)

      // Step 5: Generate grounded answer
      const groundedAnswer = GroundedAnswerSynthesis.synthesizeGroundedAnswer(
        retrievalContext,
        request.message,
        uploadedDocuments
      )

      console.log(`📝 Generated grounded answer with ${groundedAnswer.citations.length} citations`)

      // Step 6: Safety and compliance checks
      const safetyResult = SafetyComplianceEngine.checkSafetyCompliance(
        groundedAnswer,
        intentClassification,
        request.message
      )

      console.log(`🛡️ Safety check: ${safetyResult.overallSafe ? 'PASSED' : 'FAILED'}`)

      // Step 7: Quality evaluation gates
      const qualityAssessment = EvaluationGatesEngine.evaluateResponse(
        groundedAnswer,
        intentClassification,
        retrievalContext,
        safetyResult,
        request.message
      )

      console.log(`📊 Quality assessment: ${Math.round(qualityAssessment.overallScore * 100)}% (gates: ${qualityAssessment.gatePassed ? 'PASSED' : 'FAILED'})`)

      // Step 8: Handle safety blocks or quality failures
      if (safetyResult.blockedResponse) {
        console.log('🚫 Response blocked due to safety concerns')
        const emergencyResponse = SafetyComplianceEngine.generateEmergencyResponse()
        return this.createEnhancedResponse(
          emergencyResponse,
          intentClassification,
          retrievalContext,
          safetyResult,
          qualityAssessment,
          Date.now() - startTime
        )
      }

      if (!qualityAssessment.allowedToRespond) {
        console.log('⚠️ Quality gates failed, falling back to legacy pipeline')
        return this.createLegacyCompatibleResponse(
          await this.processLegacyFallback(request),
          'Quality gates failed',
          Date.now() - startTime
        )
      }

      // Step 9: Use modified answer if safety/compliance required changes
      const finalAnswer = safetyResult.modifiedAnswer || groundedAnswer

      // Step 10: Update session context if we have one
      if (sessionContext && request.sessionId) {
        this.sessionContexts.set(request.sessionId, sessionContext)
      }

      // Step 11: Create enhanced response
      return this.createEnhancedResponse(
        finalAnswer,
        intentClassification,
        retrievalContext,
        safetyResult,
        qualityAssessment,
        Date.now() - startTime
      )

    } catch (error) {
      console.error('❌ Enhanced chat processing failed:', error)

      // Fallback to legacy system
      try {
        const legacyResponse = await this.processLegacyFallback(request)
        return this.createLegacyCompatibleResponse(
          legacyResponse,
          `Enhanced processing failed: ${error}`,
          Date.now() - startTime
        )
      } catch (legacyError) {
        console.error('❌ Legacy fallback also failed:', legacyError)

        // Ultimate fallback
        return this.createErrorResponse(
          'System temporarily unavailable',
          Date.now() - startTime
        )
      }
    }
  }

  private static shouldUseEnhancedPipeline(request: EnhancedChatRequest): { enabled: boolean; reason?: string } {
    // Check feature flags
    if (!EvaluationGatesEngine.isFeatureEnabled('CHAT_INTENTS_V2')) {
      return { enabled: false, reason: 'Intent classification v2 disabled' }
    }

    if (!EvaluationGatesEngine.isFeatureEnabled('GROUNDED_CITATIONS')) {
      return { enabled: false, reason: 'Grounded citations disabled' }
    }

    // Check for healthcare-related content (enhanced pipeline is for healthcare)
    const healthcareKeywords = [
      'insurance', 'medical', 'bill', 'eob', 'claim', 'coverage', 'deductible',
      'copay', 'appeal', 'denial', 'hospital', 'doctor', 'provider'
    ]

    const hasHealthcareContent = healthcareKeywords.some(keyword =>
      request.message.toLowerCase().includes(keyword)
    )

    if (!hasHealthcareContent && (!request.fileIds || request.fileIds.length === 0)) {
      return { enabled: false, reason: 'Non-healthcare request without documents' }
    }

    return { enabled: true }
  }

  private static async processUploadedDocuments(
    fileIds: string[],
    sessionId?: string
  ): Promise<{ sessionContext: SessionContext; processedDocuments: any[] }> {

    console.log(`📄 Processing ${fileIds.length} uploaded documents`)

    // For this implementation, we'll simulate document processing
    // In a real system, this would fetch actual files from storage
    const processedDocuments: ExtractedDocumentData[] = []

    // Simulate processing each file
    for (const fileId of fileIds) {
      // This would normally fetch the file and process it
      // For now, create a mock processed document
      processedDocuments.push({
        documentType: 'EOB',
        entities: [],
        codes: {},
        planIdentifiers: {},
        dates: {},
        amounts: {},
        networkInfo: {},
        rawText: `Processed document ${fileId}`,
        confidence: 0.8
      })
    }

    // Build or update session context
    const currentSessionId = sessionId || `session_${Date.now()}`
    const existingContext = this.sessionContexts.get(currentSessionId)

    const sessionContext = existingContext ?
      MultiDocumentProcessor.mergeDocumentContext(existingContext, processedDocuments) :
      MultiDocumentProcessor.buildSessionContext(processedDocuments, currentSessionId)

    return {
      sessionContext,
      processedDocuments: processedDocuments as any[]
    }
  }

  private static async processLegacyFallback(request: EnhancedChatRequest): Promise<any> {
    // Import and use the existing generateResponse function
    const { generateResponse } = await import('./anthropic')

    return generateResponse({
      userQuestion: request.message,
      benefits: request.benefits,
      ocrTexts: [], // Would need to fetch OCR texts from fileIds
      lawBasis: [],
      policyGuidance: [],
      enhancedGuidance: []
    })
  }

  private static createEnhancedResponse(
    groundedAnswer: GroundedAnswer,
    intentClassification: IntentClassificationV2,
    retrievalContext: HybridRetrievalContext,
    safetyResult: SafetyComplianceResult,
    qualityAssessment: QualityAssessment,
    processingTime: number
  ): EnhancedChatResponse {

    // Extract phone script and appeal letter from actionable steps if available
    const phoneScript = groundedAnswer.actionableSteps.find(step =>
      step.toLowerCase().includes('call') || step.toLowerCase().includes('phone')
    )

    const appealLetter = groundedAnswer.actionableSteps.find(step =>
      step.toLowerCase().includes('appeal') || step.toLowerCase().includes('letter')
    )

    // Format citations for legacy compatibility
    const legacyCitations = groundedAnswer.citations.map(citation => ({
      label: citation.title,
      reference: citation.source
    }))

    return {
      // Enhanced fields
      groundedAnswer,
      intentClassification,
      retrievalContext,
      safetyResult,
      qualityAssessment,

      // Legacy compatibility fields
      reassurance_message: "I understand your healthcare insurance question and I'm here to help.",
      problem_summary: groundedAnswer.paragraphExplanation,
      missing_info: groundedAnswer.clarificationQuestions || [],
      errors_detected: groundedAnswer.specificGuidance,
      step_by_step: groundedAnswer.actionableSteps,
      phone_script: phoneScript,
      appeal_letter: appealLetter,
      citations: legacyCitations,
      narrative_summary: groundedAnswer.paragraphExplanation,
      confidence: Math.round((groundedAnswer.confidenceScore * qualityAssessment.overallScore) * 100),

      // Processing metadata
      processingMetadata: {
        usedEnhancedPipeline: true,
        processingTime,
        systemVersion: '2.0.0'
      }
    }
  }

  private static createLegacyCompatibleResponse(
    legacyResponse: any,
    fallbackReason: string,
    processingTime: number
  ): EnhancedChatResponse {

    // Create minimal enhanced objects for compatibility
    const mockGroundedAnswer: GroundedAnswer = {
      paragraphExplanation: legacyResponse.narrative_summary || legacyResponse.problem_summary,
      specificGuidance: legacyResponse.errors_detected || [],
      actionableSteps: legacyResponse.step_by_step || [],
      citations: [],
      confidenceScore: (legacyResponse.confidence || 50) / 100,
      requiresClarification: (legacyResponse.missing_info?.length || 0) > 0,
      clarificationQuestions: legacyResponse.missing_info,
      disclaimers: ['This response was generated using the legacy system']
    }

    return {
      ...legacyResponse,
      groundedAnswer: mockGroundedAnswer,
      intentClassification: {} as any,
      retrievalContext: {} as any,
      safetyResult: {} as any,
      qualityAssessment: {} as any,
      processingMetadata: {
        usedEnhancedPipeline: false,
        fallbackReason,
        processingTime,
        systemVersion: '2.0.0-legacy'
      }
    }
  }

  private static createErrorResponse(
    errorMessage: string,
    processingTime: number
  ): EnhancedChatResponse {

    const errorAnswer: GroundedAnswer = {
      paragraphExplanation: "I'm experiencing technical difficulties right now, but I can still provide some general guidance about healthcare insurance.",
      specificGuidance: [
        "Contact your insurance company directly for immediate assistance",
        "Keep all your documentation organized",
        "Consider seeking help from a patient advocate"
      ],
      actionableSteps: [
        "Try refreshing the page and submitting your question again",
        "If the issue persists, contact your insurance company directly",
        "Consider seeking help from a patient advocate or healthcare navigator"
      ],
      citations: [],
      confidenceScore: 0.3,
      requiresClarification: false,
      disclaimers: [
        "This is an automated error response",
        "For immediate assistance, contact your healthcare provider or insurance company"
      ]
    }

    return {
      groundedAnswer: errorAnswer,
      intentClassification: {} as any,
      retrievalContext: {} as any,
      safetyResult: {} as any,
      qualityAssessment: {} as any,

      reassurance_message: "I understand you're looking for help with your healthcare situation.",
      problem_summary: errorMessage,
      missing_info: ["Please try your request again in a moment"],
      errors_detected: [],
      step_by_step: errorAnswer.actionableSteps,
      citations: [],
      narrative_summary: errorAnswer.paragraphExplanation,
      confidence: 30,

      processingMetadata: {
        usedEnhancedPipeline: false,
        fallbackReason: errorMessage,
        processingTime,
        systemVersion: '2.0.0-error'
      }
    }
  }

  // Public utility methods
  static getSessionContext(sessionId: string): SessionContext | undefined {
    return this.sessionContexts.get(sessionId)
  }

  static clearSessionContext(sessionId: string): void {
    this.sessionContexts.delete(sessionId)
  }

  static getSystemStatus(): {
    initialized: boolean
    activeSessions: number
    featureFlags: FeatureFlags
    version: string
  } {
    return {
      initialized: this.initialized,
      activeSessions: this.sessionContexts.size,
      featureFlags: EvaluationGatesEngine.getFeatureFlags(),
      version: '2.0.0'
    }
  }

  static setFeatureFlag(flag: keyof FeatureFlags, enabled: boolean): void {
    EvaluationGatesEngine.setFeatureFlag(flag, enabled)
  }

  // For testing and evaluation
  static async evaluateSystem(
    testCases: Array<{
      request: EnhancedChatRequest
      expectedIntent?: string
      expectedConfidence?: number
    }>
  ): Promise<Array<{
    testCase: number
    result: EnhancedChatResponse
    evaluation: {
      intentAccuracy: boolean
      confidenceMet: boolean
      processingTime: number
      usedEnhanced: boolean
    }
  }>> {

    console.log(`🧪 Running system evaluation on ${testCases.length} test cases`)

    const results = []

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i]
      const startTime = Date.now()

      try {
        const result = await this.processRequest(testCase.request)
        const processingTime = Date.now() - startTime

        const evaluation = {
          intentAccuracy: testCase.expectedIntent ?
            result.intentClassification?.primaryIntent?.theme?.toLowerCase().includes(testCase.expectedIntent.toLowerCase()) || false :
            true,
          confidenceMet: testCase.expectedConfidence ?
            result.confidence >= testCase.expectedConfidence :
            true,
          processingTime,
          usedEnhanced: result.processingMetadata.usedEnhancedPipeline
        }

        results.push({
          testCase: i + 1,
          result,
          evaluation
        })

      } catch (error) {
        console.error(`❌ Test case ${i + 1} failed:`, error)
        results.push({
          testCase: i + 1,
          result: this.createErrorResponse(`Test failed: ${error}`, Date.now() - startTime),
          evaluation: {
            intentAccuracy: false,
            confidenceMet: false,
            processingTime: Date.now() - startTime,
            usedEnhanced: false
          }
        })
      }
    }

    // Log summary
    const passedTests = results.filter(r => r.evaluation.intentAccuracy && r.evaluation.confidenceMet).length
    const enhancedTests = results.filter(r => r.evaluation.usedEnhanced).length
    const avgProcessingTime = results.reduce((sum, r) => sum + r.evaluation.processingTime, 0) / results.length

    console.log(`📊 Evaluation Results:`)
    console.log(`   ✅ Passed: ${passedTests}/${testCases.length} (${Math.round(passedTests / testCases.length * 100)}%)`)
    console.log(`   🚀 Enhanced: ${enhancedTests}/${testCases.length} (${Math.round(enhancedTests / testCases.length * 100)}%)`)
    console.log(`   ⏱️ Avg time: ${Math.round(avgProcessingTime)}ms`)

    return results
  }
}