/**
 * Tests for Link Resolver
 * Ensures correct state-specific marketplace and resource links
 */

import { describe, it, expect } from '@jest/globals'
import { LinkResolver } from '../src/lib/links/resolve'

describe('Link Resolver', () => {
  describe('Marketplace Links', () => {
    it('should return Healthcare.gov for FFE states', () => {
      const floridaLink = LinkResolver.getMarketplaceLink('Florida')
      const texasLink = LinkResolver.getMarketplaceLink('Texas')

      expect(floridaLink.url).toBe('https://www.healthcare.gov')
      expect(floridaLink.label).toBe('Healthcare.gov')
      expect(floridaLink.type).toBe('marketplace')

      expect(texasLink.url).toBe('https://www.healthcare.gov')
      expect(texasLink.label).toBe('Healthcare.gov')
    })

    it('should return state marketplace for SBM states', () => {
      const californiaLink = LinkResolver.getMarketplaceLink('California')
      const newYorkLink = LinkResolver.getMarketplaceLink('New York')

      expect(californiaLink.url).toBe('https://www.coveredca.com')
      expect(californiaLink.label).toBe('Covered California')

      expect(newYorkLink.url).toBe('https://nystateofhealth.ny.gov')
      expect(newYorkLink.label).toBe('NY State of Health')
    })

    it('should default to Healthcare.gov for unknown states', () => {
      const unknownLink = LinkResolver.getMarketplaceLink('Unknown State')

      expect(unknownLink.url).toBe('https://www.healthcare.gov')
      expect(unknownLink.label).toBe('Healthcare.gov')
    })

    it('should handle undefined state parameter', () => {
      const defaultLink = LinkResolver.getMarketplaceLink()

      expect(defaultLink.url).toBe('https://www.healthcare.gov')
      expect(defaultLink.label).toBe('Healthcare.gov')
    })
  })

  describe('State Classification', () => {
    it('should correctly identify FFE states', () => {
      expect(LinkResolver.isFFEState('Florida')).toBe(true)
      expect(LinkResolver.isFFEState('Texas')).toBe(true)
      expect(LinkResolver.isFFEState('Georgia')).toBe(true)
      expect(LinkResolver.isFFEState('Ohio')).toBe(true)
    })

    it('should correctly identify SBM states', () => {
      expect(LinkResolver.isFFEState('California')).toBe(false)
      expect(LinkResolver.isFFEState('New York')).toBe(false)
      expect(LinkResolver.isFFEState('Washington')).toBe(false)
      expect(LinkResolver.isFFEState('Colorado')).toBe(false)
    })

    it('should return correct marketplace type', () => {
      expect(LinkResolver.getMarketplaceType('Florida')).toBe('healthcare.gov')
      expect(LinkResolver.getMarketplaceType('California')).toBe('state-based')
      expect(LinkResolver.getMarketplaceType('New York')).toBe('state-based')
      expect(LinkResolver.getMarketplaceType('Texas')).toBe('healthcare.gov')
    })
  })

  describe('DOI Links', () => {
    it('should return DOI link for supported states', () => {
      const floridaDOI = LinkResolver.getDOILink('Florida')
      const californiaDOI = LinkResolver.getDOILink('California')

      expect(floridaDOI).toBeDefined()
      expect(floridaDOI?.state).toBe('Florida')
      expect(floridaDOI?.type).toBe('doi')
      expect(floridaDOI?.url).toContain('myfloridacfo.com')

      expect(californiaDOI).toBeDefined()
      expect(californiaDOI?.state).toBe('California')
      expect(californiaDOI?.url).toContain('insurance.ca.gov')
    })

    it('should return null for unsupported states', () => {
      const unknownDOI = LinkResolver.getDOILink('Unknown State')
      expect(unknownDOI).toBeNull()
    })

    it('should handle undefined state', () => {
      const nullDOI = LinkResolver.getDOILink()
      expect(nullDOI).toBeNull()
    })
  })

  describe('Payer Links', () => {
    it('should return payer-specific links', () => {
      const aetnaLinks = LinkResolver.getPayerLinks('Aetna')
      const anthemLinks = LinkResolver.getPayerLinks('Anthem')

      expect(aetnaLinks.length).toBeGreaterThan(0)
      expect(aetnaLinks[0].payer).toBe('Aetna')
      expect(aetnaLinks[0].type).toBe('payer')

      expect(anthemLinks.length).toBeGreaterThan(0)
      expect(anthemLinks[0].payer).toBe('Anthem')
    })

    it('should handle case-insensitive payer matching', () => {
      const aetnaLinks = LinkResolver.getPayerLinks('aetna')
      const bcbsLinks = LinkResolver.getPayerLinks('BCBS')

      expect(aetnaLinks.length).toBeGreaterThan(0)
      expect(bcbsLinks.length).toBeGreaterThan(0)
    })

    it('should return empty array for unknown payers', () => {
      const unknownLinks = LinkResolver.getPayerLinks('Unknown Insurance')
      expect(unknownLinks).toEqual([])
    })

    it('should handle undefined payer', () => {
      const emptyLinks = LinkResolver.getPayerLinks()
      expect(emptyLinks).toEqual([])
    })
  })

  describe('Contextual Links', () => {
    it('should provide comprehensive links for Florida employer coverage change', () => {
      const links = LinkResolver.getContextualLinks({
        state: 'Florida',
        intent: 'CHAT',
        needs: 'switch plan'
      })

      expect(links.length).toBeGreaterThan(3)

      // Should include marketplace link
      expect(links.some(link => link.url.includes('healthcare.gov'))).toBe(true)

      // Should include SEP information
      expect(links.some(link => link.key === 'healthcare_gov_sep')).toBe(true)

      // Should include affordability guidance
      expect(links.some(link => link.key === 'healthcare_gov_affordability')).toBe(true)

      // Should include plan comparison tool
      expect(links.some(link => link.key === 'healthcare_gov_see_plans')).toBe(true)
    })

    it('should include payer links when payer is specified', () => {
      const links = LinkResolver.getContextualLinks({
        state: 'California',
        payer: 'Aetna',
        intent: 'CHAT'
      })

      expect(links.some(link => link.payer === 'Aetna')).toBe(true)
    })

    it('should include DOI link for appeal scenarios', () => {
      const links = LinkResolver.getContextualLinks({
        state: 'Florida',
        needs: 'appeal'
      })

      expect(links.some(link => link.type === 'doi' && link.state === 'Florida')).toBe(true)
    })

    it('should include cost calculator for cost-related queries', () => {
      const links = LinkResolver.getContextualLinks({
        state: 'Texas',
        needs: 'cost estimate'
      })

      expect(links.some(link => link.key === 'kff_subsidy_calculator')).toBe(true)
    })

    it('should deduplicate links', () => {
      const links = LinkResolver.getContextualLinks({
        state: 'Florida',
        intent: 'CHAT',
        needs: 'switch plan'
      })

      const linkKeys = links.map(link => link.key)
      const uniqueKeys = [...new Set(linkKeys)]

      expect(linkKeys.length).toBe(uniqueKeys.length)
    })
  })

  describe('Link Utilities', () => {
    it('should get specific link by key', () => {
      const healthcareGovLink = LinkResolver.getLink('healthcare_gov')
      const sepLink = LinkResolver.getLink('healthcare_gov_sep')

      expect(healthcareGovLink).toBeDefined()
      expect(healthcareGovLink?.url).toBe('https://www.healthcare.gov')

      expect(sepLink).toBeDefined()
      expect(sepLink?.key).toBe('healthcare_gov_sep')
    })

    it('should return null for non-existent link key', () => {
      const nonExistentLink = LinkResolver.getLink('non_existent_link')
      expect(nonExistentLink).toBeNull()
    })

    it('should get links by type', () => {
      const marketplaceLinks = LinkResolver.getLinksByType('marketplace')
      const doiLinks = LinkResolver.getLinksByType('doi')
      const toolLinks = LinkResolver.getLinksByType('tool')

      expect(marketplaceLinks.length).toBeGreaterThan(0)
      expect(marketplaceLinks.every(link => link.type === 'marketplace')).toBe(true)

      expect(doiLinks.length).toBeGreaterThan(0)
      expect(doiLinks.every(link => link.type === 'doi')).toBe(true)

      expect(toolLinks.length).toBeGreaterThan(0)
      expect(toolLinks.every(link => link.type === 'tool')).toBe(true)
    })

    it('should format links for response display', () => {
      const links = [
        {
          key: 'test_link',
          url: 'https://example.com',
          label: 'Test Link',
          description: 'A test link',
          type: 'tool' as const
        }
      ]

      const formatted = LinkResolver.formatLinksForResponse(links)

      expect(formatted).toContain('**[Test Link](https://example.com)**')
      expect(formatted).toContain('A test link')
      expect(formatted).toContain('•')
    })
  })

  describe('State-Specific Scenarios', () => {
    it('should handle all major states correctly', () => {
      const majorStates = [
        'California', 'Texas', 'Florida', 'New York', 'Pennsylvania',
        'Illinois', 'Ohio', 'Georgia', 'North Carolina', 'Michigan'
      ]

      majorStates.forEach(state => {
        const marketplaceLink = LinkResolver.getMarketplaceLink(state)
        const marketplaceType = LinkResolver.getMarketplaceType(state)

        expect(marketplaceLink).toBeDefined()
        expect(marketplaceLink.url).toMatch(/^https?:\/\//)
        expect(['healthcare.gov', 'state-based']).toContain(marketplaceType)
      })
    })

    it('should provide different links for FFE vs SBM states', () => {
      const floridaLinks = LinkResolver.getContextualLinks({
        state: 'Florida',
        intent: 'CHAT',
        needs: 'switch plan'
      })

      const californiaLinks = LinkResolver.getContextualLinks({
        state: 'California',
        intent: 'CHAT',
        needs: 'switch plan'
      })

      // Florida should get Healthcare.gov
      expect(floridaLinks.some(link => link.url.includes('healthcare.gov'))).toBe(true)

      // California should get Covered California
      expect(californiaLinks.some(link => link.url.includes('coveredca.com'))).toBe(true)
    })
  })
})