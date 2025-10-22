/**
 * Link Resolver for State-Specific Resources
 * Provides authoritative links based on context (state, payer, etc.)
 */

export interface ResourceLink {
  key: string
  url: string
  label: string
  description?: string
  state?: string
  payer?: string
  type: 'marketplace' | 'doi' | 'payer' | 'federal' | 'tool'
}

export class LinkResolver {
  private static links: ResourceLink[] = [
    // Federal resources
    {
      key: 'healthcare_gov',
      url: 'https://www.healthcare.gov',
      label: 'Healthcare.gov',
      description: 'Federal Health Insurance Marketplace',
      type: 'marketplace'
    },
    {
      key: 'healthcare_gov_see_plans',
      url: 'https://www.healthcare.gov/see-plans',
      label: 'Compare Plans & Prices',
      description: 'View and compare marketplace plans',
      type: 'tool'
    },
    {
      key: 'healthcare_gov_sep',
      url: 'https://www.healthcare.gov/coverage-outside-open-enrollment/special-enrollment-period/',
      label: 'Special Enrollment Periods',
      description: 'Check if you qualify for mid-year enrollment',
      type: 'federal'
    },
    {
      key: 'healthcare_gov_affordability',
      url: 'https://www.healthcare.gov/have-job-based-coverage/change-to-marketplace-plan/',
      label: 'Job-Based Coverage vs Marketplace',
      description: 'When you can switch from employer to marketplace',
      type: 'federal'
    },

    // State marketplaces
    {
      key: 'covered_ca',
      url: 'https://www.coveredca.com',
      label: 'Covered California',
      description: 'California State Health Insurance Marketplace',
      state: 'California',
      type: 'marketplace'
    },
    {
      key: 'ny_state_of_health',
      url: 'https://nystateofhealth.ny.gov',
      label: 'NY State of Health',
      description: 'New York State Health Insurance Marketplace',
      state: 'New York',
      type: 'marketplace'
    },
    {
      key: 'washington_healthplanfinder',
      url: 'https://www.wahealthplanfinder.org',
      label: 'Washington Healthplanfinder',
      description: 'Washington State Health Insurance Marketplace',
      state: 'Washington',
      type: 'marketplace'
    },

    // State DOI resources
    {
      key: 'florida_doi',
      url: 'https://www.myfloridacfo.com/division/consumers/',
      label: 'Florida Department of Financial Services',
      description: 'Consumer assistance and insurance complaints',
      state: 'Florida',
      type: 'doi'
    },
    {
      key: 'california_doi',
      url: 'https://www.insurance.ca.gov/01-consumers/',
      label: 'California Department of Insurance',
      description: 'Consumer help and external reviews',
      state: 'California',
      type: 'doi'
    },
    {
      key: 'texas_doi',
      url: 'https://www.tdi.texas.gov/consumer/',
      label: 'Texas Department of Insurance',
      description: 'Consumer assistance and complaint resolution',
      state: 'Texas',
      type: 'doi'
    },
    {
      key: 'new_york_doi',
      url: 'https://www.dfs.ny.gov/consumers',
      label: 'New York Department of Financial Services',
      description: 'Insurance consumer assistance',
      state: 'New York',
      type: 'doi'
    },

    // Common payer resources
    {
      key: 'anthem_cs',
      url: 'https://www.anthem.com/member/support',
      label: 'Anthem Customer Service',
      description: 'Anthem member support and benefits verification',
      payer: 'Anthem',
      type: 'payer'
    },
    {
      key: 'aetna_cs',
      url: 'https://www.aetna.com/individuals-families/member-rights-resources.html',
      label: 'Aetna Member Resources',
      description: 'Aetna benefits, claims, and member services',
      payer: 'Aetna',
      type: 'payer'
    },
    {
      key: 'bcbs_cs',
      url: 'https://www.bcbs.com',
      label: 'Blue Cross Blue Shield',
      description: 'Find your local BCBS plan',
      payer: 'BCBS',
      type: 'payer'
    },
    {
      key: 'cigna_cs',
      url: 'https://www.cigna.com/individuals-families/member-guide',
      label: 'Cigna Member Guide',
      description: 'Cigna benefits and member support',
      payer: 'Cigna',
      type: 'payer'
    },
    {
      key: 'uhc_cs',
      url: 'https://www.uhc.com/member-support',
      label: 'UnitedHealthcare Member Support',
      description: 'UHC benefits verification and customer service',
      payer: 'UnitedHealthcare',
      type: 'payer'
    },

    // Tools and calculators
    {
      key: 'kff_subsidy_calculator',
      url: 'https://www.kff.org/interactive/subsidy-calculator/',
      label: 'KFF Subsidy Calculator',
      description: 'Estimate marketplace premium tax credits',
      type: 'tool'
    },
    {
      key: 'healthcare_gov_plan_compare',
      url: 'https://www.healthcare.gov/see-plans/#/',
      label: 'Plan & Price Tool',
      description: 'Compare costs and coverage side-by-side',
      type: 'tool'
    }
  ]

  /**
   * Get marketplace link for a specific state
   */
  static getMarketplaceLink(state?: string): ResourceLink {
    if (!state) {
      return this.getLink('healthcare_gov')!
    }

    // State-based marketplaces
    const stateMarketplaces: Record<string, string> = {
      'California': 'covered_ca',
      'New York': 'ny_state_of_health',
      'Washington': 'washington_healthplanfinder',
      // Add more state marketplaces as needed
    }

    const linkKey = stateMarketplaces[state]
    return linkKey ? this.getLink(linkKey)! : this.getLink('healthcare_gov')!
  }

  /**
   * Get Department of Insurance link for a state
   */
  static getDOILink(state?: string): ResourceLink | null {
    if (!state) return null

    const doiKey = `${state.toLowerCase().replace(/\s+/g, '_')}_doi`
    return this.getLink(doiKey) || this.links.find(link =>
      link.type === 'doi' && link.state === state
    ) || null
  }

  /**
   * Get payer-specific links
   */
  static getPayerLinks(payer?: string): ResourceLink[] {
    if (!payer) return []

    return this.links.filter(link =>
      link.type === 'payer' &&
      link.payer?.toLowerCase().includes(payer.toLowerCase())
    )
  }

  /**
   * Get relevant links based on context
   */
  static getContextualLinks(context: {
    state?: string
    payer?: string
    intent?: string
    needs?: string
  }): ResourceLink[] {
    const links: ResourceLink[] = []

    // Always include marketplace link
    links.push(this.getMarketplaceLink(context.state))

    // Add plan comparison tool
    if (context.intent === 'CHAT' || context.needs?.includes('compare')) {
      links.push(this.getLink('healthcare_gov_see_plans')!)
    }

    // Add SEP info if relevant
    if (context.needs?.includes('switch') || context.intent === 'CHAT') {
      links.push(this.getLink('healthcare_gov_sep')!)
    }

    // Add affordability guidance for employer coverage questions
    if (context.needs?.includes('switch') && context.state) {
      links.push(this.getLink('healthcare_gov_affordability')!)
    }

    // Add DOI link for appeals or complaints
    if (context.needs?.includes('appeal') || context.intent?.includes('complaint')) {
      const doiLink = this.getDOILink(context.state)
      if (doiLink) links.push(doiLink)
    }

    // Add payer-specific links
    if (context.payer) {
      links.push(...this.getPayerLinks(context.payer))
    }

    // Add tools
    if (context.needs?.includes('cost')) {
      links.push(this.getLink('kff_subsidy_calculator')!)
    }

    return this.deduplicateLinks(links)
  }

  /**
   * Get a specific link by key
   */
  static getLink(key: string): ResourceLink | null {
    return this.links.find(link => link.key === key) || null
  }

  /**
   * Get all links for a specific type
   */
  static getLinksByType(type: ResourceLink['type']): ResourceLink[] {
    return this.links.filter(link => link.type === type)
  }

  /**
   * Check if a state uses Healthcare.gov (FFE) or has state-based marketplace
   */
  static isFFEState(state: string): boolean {
    const sbmStates = ['California', 'New York', 'Washington', 'Colorado', 'Connecticut', 'Idaho', 'Maryland', 'Massachusetts', 'Minnesota', 'Nevada', 'New Jersey', 'Pennsylvania', 'Rhode Island', 'Vermont']
    return !sbmStates.includes(state)
  }

  /**
   * Get marketplace type designation
   */
  static getMarketplaceType(state: string): 'healthcare.gov' | 'state-based' {
    return this.isFFEState(state) ? 'healthcare.gov' : 'state-based'
  }

  /**
   * Remove duplicate links
   */
  private static deduplicateLinks(links: ResourceLink[]): ResourceLink[] {
    const seen = new Set<string>()
    return links.filter(link => {
      if (seen.has(link.key)) return false
      seen.add(link.key)
      return true
    })
  }

  /**
   * Format links for display in responses
   */
  static formatLinksForResponse(links: ResourceLink[]): string {
    return links.map(link =>
      `• **[${link.label}](${link.url})** - ${link.description || 'Resource'}`
    ).join('\n')
  }
}