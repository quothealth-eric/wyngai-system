// Insurance company policies database for RAG
export interface PolicyEntry {
  id: string
  insurerName: string
  title: string
  summary: string
  keywords: string[]
  fullText: string
  source: string
  url?: string
}

export const insurerPolicies: PolicyEntry[] = [
  {
    id: 'uhc-prior-auth',
    title: 'UnitedHealthcare Prior Authorization Requirements',
    summary: 'Prior authorization requirements for medical services and prescription drugs.',
    keywords: ['UnitedHealthcare', 'UHC', 'prior authorization', 'preauth', 'medical services'],
    insurerName: 'UnitedHealthcare',
    fullText: 'UnitedHealthcare requires prior authorization for certain medical services, procedures, and prescription drugs. Prior authorization must be obtained before services are rendered to ensure coverage. Emergency services do not require prior authorization.',
    source: 'UHC Medical Policy',
    url: 'https://www.uhc.com/health-care-professionals/prior-authorization-advance-notification'
  },
  {
    id: 'aetna-appeals',
    title: 'Aetna Appeals Process',
    summary: 'Process for appealing denied claims and coverage decisions.',
    keywords: ['Aetna', 'appeals', 'denied claims', 'coverage decision', 'grievance'],
    insurerName: 'Aetna',
    fullText: 'Aetna provides a two-level appeals process for denied claims. Level 1 appeals must be filed within 180 days of the denial notice. If the Level 1 appeal is denied, members can file a Level 2 appeal within 60 days.',
    source: 'Aetna Member Handbook',
    url: 'https://www.aetna.com/members/member-rights-resources/need-help-with-a-claim/appeals.html'
  },
  {
    id: 'cigna-emergency-coverage',
    title: 'Cigna Emergency Services Coverage',
    summary: 'Coverage for emergency services regardless of network status.',
    keywords: ['Cigna', 'emergency', 'coverage', 'network', 'emergency room'],
    insurerName: 'Cigna',
    fullText: 'Cigna covers emergency services at the in-network benefit level regardless of whether the provider or facility is in the Cigna network. This includes emergency room visits, emergency ambulance services, and emergency care from out-of-network providers.',
    source: 'Cigna Coverage Policy',
    url: 'https://www.cigna.com/knowledge-center/coverage-and-claims/emergency-care-coverage'
  },
  {
    id: 'anthem-preventive-care',
    title: 'Anthem Preventive Care Benefits',
    summary: 'Coverage for preventive care services at 100% when using in-network providers.',
    keywords: ['Anthem', 'BCBS', 'preventive care', 'wellness', 'annual exam', 'screening'],
    insurerName: 'Anthem BCBS',
    fullText: 'Anthem BCBS covers preventive care services at 100% when members use in-network providers. This includes annual wellness exams, routine screenings, immunizations, and other preventive services as defined by the ACA.',
    source: 'Anthem Benefits Summary',
    url: 'https://www.anthem.com/health-insurance/coverage/preventive-care'
  },
  {
    id: 'humana-prescription-drug',
    title: 'Humana Prescription Drug Coverage',
    summary: 'Prescription drug formulary and coverage tiers.',
    keywords: ['Humana', 'prescription', 'drug', 'formulary', 'medication', 'pharmacy'],
    insurerName: 'Humana',
    fullText: 'Humana prescription drug plans use a formulary (list of covered drugs) with different cost-sharing tiers. Generic drugs typically have the lowest cost-sharing, while brand-name and specialty drugs have higher cost-sharing.',
    source: 'Humana Formulary',
    url: 'https://www.humana.com/pharmacy/drug-list'
  },
  {
    id: 'kaiser-integrated-care',
    title: 'Kaiser Permanente Integrated Care Model',
    summary: 'Kaiser\'s integrated care model and referral requirements.',
    keywords: ['Kaiser', 'Kaiser Permanente', 'integrated care', 'referral', 'HMO'],
    insurerName: 'Kaiser Permanente',
    fullText: 'Kaiser Permanente uses an integrated care model where most services must be received within the Kaiser system. Referrals are required for specialty care, and out-of-network services are generally not covered except for emergency care.',
    source: 'Kaiser Member Agreement',
    url: 'https://healthy.kaiserpermanente.org/health-wellness/health-encyclopedia/he.how-kaiser-permanente-works.hw198537'
  }
]

export function searchPolicies(keywords: string[], insurerName?: string): PolicyEntry[] {
  const normalizedKeywords = keywords.map(k => k.toLowerCase())

  let filteredPolicies = insurerPolicies

  // Filter by insurer if specified
  if (insurerName) {
    const normalizedInsurer = insurerName.toLowerCase()
    filteredPolicies = insurerPolicies.filter(policy =>
      policy.insurerName.toLowerCase().includes(normalizedInsurer) ||
      normalizedInsurer.includes(policy.insurerName.toLowerCase())
    )
  }

  return filteredPolicies.filter(policy =>
    normalizedKeywords.some(keyword =>
      policy.keywords.some(policyKeyword =>
        policyKeyword.toLowerCase().includes(keyword) ||
        keyword.includes(policyKeyword.toLowerCase())
      ) ||
      policy.title.toLowerCase().includes(keyword) ||
      policy.summary.toLowerCase().includes(keyword)
    )
  )
}

export function detectInsurer(text: string): string | null {
  const text_lower = text.toLowerCase()

  const insurerPatterns = [
    { name: 'UnitedHealthcare', patterns: ['unitedhealthcare', 'united healthcare', 'uhc', 'united health'] },
    { name: 'Aetna', patterns: ['aetna'] },
    { name: 'Cigna', patterns: ['cigna'] },
    { name: 'Anthem BCBS', patterns: ['anthem', 'blue cross blue shield', 'bcbs', 'blue cross'] },
    { name: 'Humana', patterns: ['humana'] },
    { name: 'Kaiser Permanente', patterns: ['kaiser permanente', 'kaiser'] },
  ]

  for (const insurer of insurerPatterns) {
    if (insurer.patterns.some(pattern => text_lower.includes(pattern))) {
      return insurer.name
    }
  }

  return null
}