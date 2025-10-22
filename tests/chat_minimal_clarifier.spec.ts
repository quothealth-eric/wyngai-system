/**
 * Tests for Minimal Clarifier Policy and Gold Response Scenario
 * Ensures the bot provides complete answers when sufficient context is present
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { SlotManager, ContextFrame } from '../src/lib/context/slots'
import { EntityExtractor } from '../src/lib/context/extract'
import { ClarifierPolicy } from '../src/lib/policies/minimal_clarifier'
import { AnswerComposer } from '../src/lib/chat/compose_answer'
import { LinkResolver } from '../src/lib/links/resolve'

describe('Minimal Clarifier Policy', () => {
  let contextFrame: ContextFrame

  beforeEach(() => {
    contextFrame = SlotManager.createFrame('test-thread')
  })

  describe('Entity Extraction', () => {
    it('should extract state from text', () => {
      const input = {
        text: "I currently have health insurance through my employer, however I would like to change health plans to a different coverage. I am not sure if I can use the marketplace or if I should call my current insurance company. I live in the state of FL. I am also married and we have a child on our current plan. What are my best options?"
      }

      const extractedSlots = EntityExtractor.extractSlots(input)

      const stateSlot = extractedSlots.find(slot => slot.key === 'state')
      expect(stateSlot).toBeDefined()
      expect(stateSlot?.value).toBe('Florida')
      expect(stateSlot?.confidence).toBeGreaterThan(0.8)
    })

    it('should extract current coverage type', () => {
      const input = {
        text: "I currently have health insurance through my employer"
      }

      const extractedSlots = EntityExtractor.extractSlots(input)

      const coverageSlot = extractedSlots.find(slot => slot.key === 'currentCoverage')
      expect(coverageSlot).toBeDefined()
      expect(coverageSlot?.value).toBe('employer')
      expect(coverageSlot?.confidence).toBeGreaterThan(0.7)
    })

    it('should extract household composition', () => {
      const input = {
        text: "I am married and we have a child on our current plan"
      }

      const extractedSlots = EntityExtractor.extractSlots(input)

      const householdSlot = extractedSlots.find(slot => slot.key === 'household')
      expect(householdSlot).toBeDefined()
      expect(householdSlot?.value).toBe('spouse+child')
      expect(householdSlot?.confidence).toBeGreaterThan(0.7)
    })

    it('should extract coverage change intent', () => {
      const input = {
        text: "I would like to change health plans to a different coverage"
      }

      const extractedSlots = EntityExtractor.extractSlots(input)

      const needsSlot = extractedSlots.find(slot => slot.key === 'needs')
      expect(needsSlot).toBeDefined()
      expect(needsSlot?.value).toBe('switch plan')
      expect(needsSlot?.confidence).toBeGreaterThan(0.7)
    })
  })

  describe('Context Frame Management', () => {
    it('should merge extracted slots into context frame', () => {
      const input = {
        text: "I live in Florida and have employer coverage with my spouse and child"
      }

      const updatedFrame = EntityExtractor.updateContextFrame(contextFrame, input)

      expect(SlotManager.getSlot(updatedFrame, 'state')).toBeDefined()
      expect(SlotManager.getSlot(updatedFrame, 'currentCoverage')).toBeDefined()
      expect(SlotManager.getSlot(updatedFrame, 'household')).toBeDefined()

      expect(SlotManager.getSlot(updatedFrame, 'state')?.value).toBe('Florida')
      expect(SlotManager.getSlot(updatedFrame, 'currentCoverage')?.value).toBe('employer')
      expect(SlotManager.getSlot(updatedFrame, 'household')?.value).toBe('spouse+child')
    })

    it('should not overwrite high-confidence slots with similar values', () => {
      // First, set a high-confidence state slot
      const frameWithState = SlotManager.updateSlot(
        contextFrame,
        'state',
        'Florida',
        0.9,
        'user'
      )

      // Try to update with similar value
      const input = { text: "I live in FL" }
      const updatedFrame = EntityExtractor.updateContextFrame(frameWithState, input)

      const stateSlot = SlotManager.getSlot(updatedFrame, 'state')
      expect(stateSlot?.value).toBe('Florida') // Should keep original
      expect(stateSlot?.confidence).toBe(0.9) // Should keep original confidence
    })
  })

  describe('Clarifier Policy', () => {
    it('should not require clarification when critical slots are present', () => {
      // Fill critical slots for coverage change scenario
      let frame = SlotManager.updateSlot(contextFrame, 'state', 'Florida', 0.9, 'user')
      frame = SlotManager.updateSlot(frame, 'currentCoverage', 'employer', 0.8, 'user')

      const clarificationCheck = ClarifierPolicy.needsClarification(
        frame,
        'CHAT',
        ['coverage', 'marketplace']
      )

      expect(clarificationCheck.needed).toBe(false)
    })

    it('should require clarification when critical slots are missing', () => {
      // Only fill one critical slot
      const frame = SlotManager.updateSlot(contextFrame, 'state', 'Florida', 0.9, 'user')

      const clarificationCheck = ClarifierPolicy.needsClarification(
        frame,
        'CHAT',
        ['coverage', 'marketplace']
      )

      expect(clarificationCheck.needed).toBe(true)
      expect(clarificationCheck.message).toContain('coverage')
    })

    it('should suppress clarification for already-filled slots', () => {
      const frame = SlotManager.updateSlot(contextFrame, 'state', 'Florida', 0.9, 'user')

      const shouldSuppress = ClarifierPolicy.shouldSuppressClarification(
        frame,
        "Which state are you in?"
      )

      expect(shouldSuppress).toBe(true)
    })

    it('should generate assumptions for missing optional slots', () => {
      let frame = SlotManager.updateSlot(contextFrame, 'state', 'Florida', 0.9, 'user')
      frame = SlotManager.updateSlot(frame, 'currentCoverage', 'employer', 0.8, 'user')
      // Missing: qualifyingEvent, employerAffordability, household

      const { assumptions, contingencies } = ClarifierPolicy.generateAssumptionResponse(
        frame,
        'CHAT',
        ['coverage']
      )

      expect(assumptions.length).toBeGreaterThan(0)
      expect(contingencies.length).toBeGreaterThan(0)
      expect(contingencies.some(c => c.includes('qualifying event'))).toBe(true)
      expect(contingencies.some(c => c.includes('family affordability'))).toBe(true)
    })
  })

  describe('Link Resolver', () => {
    it('should return Healthcare.gov for Florida (FFE state)', () => {
      const marketplaceLink = LinkResolver.getMarketplaceLink('Florida')

      expect(marketplaceLink.url).toBe('https://www.healthcare.gov')
      expect(marketplaceLink.label).toBe('Healthcare.gov')
    })

    it('should return state marketplace for SBM states', () => {
      const marketplaceLink = LinkResolver.getMarketplaceLink('California')

      expect(marketplaceLink.url).toBe('https://www.coveredca.com')
      expect(marketplaceLink.label).toBe('Covered California')
    })

    it('should identify Florida as FFE state', () => {
      expect(LinkResolver.isFFEState('Florida')).toBe(true)
      expect(LinkResolver.getMarketplaceType('Florida')).toBe('healthcare.gov')
    })

    it('should provide contextual links for coverage change scenario', () => {
      const links = LinkResolver.getContextualLinks({
        state: 'Florida',
        intent: 'CHAT',
        needs: 'switch plan'
      })

      expect(links.length).toBeGreaterThan(0)
      expect(links.some(link => link.url.includes('healthcare.gov'))).toBe(true)
      expect(links.some(link => link.key === 'healthcare_gov_sep')).toBe(true)
      expect(links.some(link => link.key === 'healthcare_gov_affordability')).toBe(true)
    })

    it('should provide Florida DOI link', () => {
      const doiLink = LinkResolver.getDOILink('Florida')

      expect(doiLink).toBeDefined()
      expect(doiLink?.state).toBe('Florida')
      expect(doiLink?.type).toBe('doi')
    })
  })

  describe('Gold Response Scenario', () => {
    it('should generate complete coverage change response for Florida employer scenario', async () => {
      // Set up the exact scenario from the requirements
      let frame = SlotManager.updateSlot(contextFrame, 'state', 'Florida', 0.9, 'user')
      frame = SlotManager.updateSlot(frame, 'currentCoverage', 'employer', 0.8, 'user')
      frame = SlotManager.updateSlot(frame, 'household', 'spouse+child', 0.8, 'user')
      frame = SlotManager.updateSlot(frame, 'needs', 'switch plan', 0.8, 'user')

      const composerInput = {
        frame,
        intent: 'CHAT',
        themes: ['coverage', 'marketplace', 'employer'],
        retrievedChunks: [],
        userQuery: "I currently have health insurance through my employer, however I would like to change health plans to a different coverage. I am not sure if I can use the marketplace or if I should call my current insurance company. I live in the state of FL. I am also married and we have a child on our current plan. What are my best options?"
      }

      const response = await AnswerComposer.composeAnswer(composerInput)

      // Verify response structure
      expect(response.summary).toContain('Florida')
      expect(response.summary).toContain('employer coverage')
      expect(response.summary).toContain('Marketplace')

      // Should have key options
      expect(response.options.length).toBeGreaterThanOrEqual(2)
      expect(response.options.some(opt => opt.includes('employer plan'))).toBe(true)
      expect(response.options.some(opt => opt.includes('Marketplace'))).toBe(true)
      expect(response.options.some(opt => opt.includes('Family affordability'))).toBe(true)

      // Should have eligibility & timing info
      expect(response.eligibilityTiming).toContain('Florida uses healthcare.gov')
      expect(response.eligibilityTiming).toContain('Open Enrollment')
      expect(response.eligibilityTiming).toContain('Nov 1–Jan 15')
      expect(response.eligibilityTiming).toContain('SEP')

      // Should have relevant links
      expect(response.whereToGo.length).toBeGreaterThan(0)
      expect(response.whereToGo.some(link => link.url.includes('healthcare.gov'))).toBe(true)

      // Should have next steps
      expect(response.nextSteps.length).toBeGreaterThanOrEqual(3)
      expect(response.nextSteps.some(step => step.includes('employer OE'))).toBe(true)
      expect(response.nextSteps.some(step => step.includes('healthcare.gov'))).toBe(true)

      // Should have scripts
      expect(response.scripts.length).toBeGreaterThanOrEqual(2)
      expect(response.scripts.some(script => script.channel === 'hr')).toBe(true)
      expect(response.scripts.some(script => script.channel === 'marketplace')).toBe(true)

      // Should have appropriate citations
      expect(response.citations.length).toBeGreaterThan(0)
      expect(response.citations.some(cit => cit.authority.includes('Healthcare.gov'))).toBe(true)

      // Should have confidence pill
      expect(response.confidencePill).toContain('Florida')
      expect(response.confidencePill).toContain('Employer Plan')
    })

    it('should format response with proper structure', async () => {
      let frame = SlotManager.updateSlot(contextFrame, 'state', 'Florida', 0.9, 'user')
      frame = SlotManager.updateSlot(frame, 'currentCoverage', 'employer', 0.8, 'user')

      const composerInput = {
        frame,
        intent: 'CHAT',
        themes: ['coverage'],
        retrievedChunks: [],
        userQuery: "coverage question"
      }

      const response = await AnswerComposer.composeAnswer(composerInput)
      const formatted = AnswerComposer.formatResponse(response)

      // Check structure
      expect(formatted).toContain('## ')  // Summary header
      expect(formatted).toContain('### Your Options Now')
      expect(formatted).toContain('### Eligibility & Timing')
      expect(formatted).toContain('### Where to Go')
      expect(formatted).toContain('### Next Steps')
      expect(formatted).toContain('### Scripts')
      expect(formatted).toContain('### Sources')

      // Check that it's a substantial response
      expect(formatted.length).toBeGreaterThan(500)
    })
  })

  describe('Integration Test - Full Flow', () => {
    it('should handle the complete gold scenario without clarification', () => {
      const userInput = "I currently have health insurance through my employer, however I would like to change health plans to a different coverage. I am not sure if I can use the marketplace or if I should call my current insurance company. I live in the state of FL. I am also married and we have a child on our current plan. What are my best options?"

      // Extract entities
      const extractedSlots = EntityExtractor.extractSlots({ text: userInput })

      // Verify we extracted critical slots
      const stateSlot = extractedSlots.find(slot => slot.key === 'state')
      const coverageSlot = extractedSlots.find(slot => slot.key === 'currentCoverage')

      expect(stateSlot).toBeDefined()
      expect(coverageSlot).toBeDefined()

      // Update context frame
      const updatedFrame = EntityExtractor.updateContextFrame(contextFrame, { text: userInput })

      // Check clarification policy
      const clarificationCheck = ClarifierPolicy.needsClarification(
        updatedFrame,
        'CHAT',
        ['coverage', 'marketplace']
      )

      // Should NOT need clarification
      expect(clarificationCheck.needed).toBe(false)

      // Should be able to generate complete response
      expect(SlotManager.getSlot(updatedFrame, 'state')).toBeDefined()
      expect(SlotManager.getSlot(updatedFrame, 'currentCoverage')).toBeDefined()
      expect(SlotManager.getSlot(updatedFrame, 'household')).toBeDefined()
      expect(SlotManager.getSlot(updatedFrame, 'needs')).toBeDefined()
    })
  })
})