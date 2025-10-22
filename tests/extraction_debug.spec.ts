/**
 * Debug test for extraction issues
 */

import { describe, it, expect } from '@jest/globals'
import { EntityExtractor } from '../src/lib/context/extract'
import { SlotManager } from '../src/lib/context/slots'

describe('Extraction Debug', () => {
  it('should extract employer coverage correctly', () => {
    const input = {
      text: "I live in Florida and have employer coverage"
    }

    const slots = EntityExtractor.extractSlots(input)

    console.log('Extracted slots:', slots)

    const coverageSlot = slots.find(slot => slot.key === 'currentCoverage')
    const stateSlot = slots.find(slot => slot.key === 'state')

    console.log('Coverage slot:', coverageSlot)
    console.log('State slot:', stateSlot)

    expect(stateSlot).toBeDefined()
    expect(stateSlot?.value).toBe('Florida')

    expect(coverageSlot).toBeDefined()
    expect(coverageSlot?.value).toBe('employer')
  })

  it('should update context frame correctly', () => {
    const contextFrame = SlotManager.createFrame('test-thread')
    const input = {
      text: "I live in Florida and have employer coverage"
    }

    const updatedFrame = EntityExtractor.updateContextFrame(contextFrame, input)

    console.log('Updated frame slots:', updatedFrame.slots)

    const stateSlot = SlotManager.getSlot(updatedFrame, 'state')
    const coverageSlot = SlotManager.getSlot(updatedFrame, 'currentCoverage')

    console.log('State slot from frame:', stateSlot)
    console.log('Coverage slot from frame:', coverageSlot)

    expect(stateSlot?.value).toBe('Florida')
    expect(coverageSlot?.value).toBe('employer')
  })

  it('should preserve context across multiple turns like in failing test', () => {
    let contextFrame = SlotManager.createFrame('test-thread')

    // Turn 1: Basic info
    let frame = EntityExtractor.updateContextFrame(contextFrame, {
      text: "I live in Florida and have employer coverage"
    })

    console.log('After Turn 1 - frame slots:', Object.keys(frame.slots))
    console.log('After Turn 1 - coverage slot:', frame.slots.currentCoverage)

    // Turn 2: Add family info
    frame = EntityExtractor.updateContextFrame(frame, {
      text: "My wife and I have a newborn baby"
    })

    console.log('After Turn 2 - frame slots:', Object.keys(frame.slots))
    console.log('After Turn 2 - coverage slot:', frame.slots.currentCoverage)

    // Turn 3: Add specific intent
    const turn3Text = "Can I switch to marketplace coverage?"
    const turn3Slots = EntityExtractor.extractSlots({ text: turn3Text })
    console.log('Turn 3 extracted slots:', turn3Slots)

    frame = EntityExtractor.updateContextFrame(frame, {
      text: turn3Text
    })

    console.log('After Turn 3 - frame slots:', Object.keys(frame.slots))
    console.log('After Turn 3 - coverage slot:', frame.slots.currentCoverage)

    const stateSlot = SlotManager.getSlot(frame, 'state')
    const coverageSlot = SlotManager.getSlot(frame, 'currentCoverage')

    console.log('Final state slot:', stateSlot)
    console.log('Final coverage slot:', coverageSlot)

    expect(stateSlot?.value).toBe('Florida')
    expect(coverageSlot?.value).toBe('employer')
  })
})