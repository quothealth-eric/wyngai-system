// Healthcare laws and regulations database for RAG
export interface LawEntry {
  id: string
  title: string
  summary: string
  keywords: string[]
  fullText: string
  source: string
  url?: string
}

export const healthcareLaws: LawEntry[] = [
  {
    id: 'nsa-balance-billing',
    title: 'No Surprises Act - Balance Billing Protection',
    summary: 'Protects patients from unexpected out-of-network charges in emergency situations and certain non-emergency situations.',
    keywords: ['balance billing', 'out of network', 'emergency', 'surprise billing', 'NSA'],
    fullText: 'The No Surprises Act (NSA), effective January 1, 2022, protects patients from surprise billing when they receive emergency care, non-emergency care from out-of-network providers at in-network facilities, or air ambulance services. Patients are only responsible for in-network cost-sharing amounts.',
    source: 'No Surprises Act (H.R.133)',
    url: 'https://www.cms.gov/nosurprises'
  },
  {
    id: 'aca-essential-benefits',
    title: 'ACA Essential Health Benefits',
    summary: 'Requires health insurance plans to cover essential health benefits including preventive care, maternity care, and mental health services.',
    keywords: ['essential benefits', 'ACA', 'preventive care', 'maternity', 'mental health', 'coverage'],
    fullText: 'The Affordable Care Act requires non-grandfathered health plans in the individual and small group markets to cover essential health benefits. These include ambulatory patient services, emergency services, hospitalization, maternity and newborn care, mental health and substance use disorder services, prescription drugs, rehabilitative services, laboratory services, preventive care, and pediatric services.',
    source: 'Affordable Care Act Section 1302',
    url: 'https://www.healthcare.gov/coverage/what-marketplace-plans-cover/'
  },
  {
    id: 'erisa-appeals',
    title: 'ERISA Claims Appeals Process',
    summary: 'Establishes the process for appealing denied health insurance claims for employer-sponsored plans.',
    keywords: ['ERISA', 'appeals', 'denied claims', 'employer plan', 'claims process'],
    fullText: 'ERISA requires employer-sponsored health plans to provide a reasonable claims procedure, including the right to appeal denied claims. Plans must provide written notice of claim denials with specific reasons and must complete appeals within specified timeframes (typically 60-180 days depending on the type of appeal).',
    source: 'Employee Retirement Income Security Act (ERISA)',
    url: 'https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/resource-center/faqs/cobra-continuation-health-coverage-compliance'
  },
  {
    id: 'hipaa-privacy',
    title: 'HIPAA Privacy Rights',
    summary: 'Protects the privacy of health information and gives patients rights over their health records.',
    keywords: ['HIPAA', 'privacy', 'health records', 'PHI', 'medical records'],
    fullText: 'HIPAA gives patients the right to access their health information, request corrections, and control how their health information is used and shared. Covered entities must provide patients with access to their medical records within 30 days of a request.',
    source: 'Health Insurance Portability and Accountability Act (HIPAA)',
    url: 'https://www.hhs.gov/hipaa/for-individuals/index.html'
  },
  {
    id: 'state-balance-billing',
    title: 'State Balance Billing Laws',
    summary: 'Many states have additional protections against balance billing beyond federal NSA protections.',
    keywords: ['state law', 'balance billing', 'state protection', 'additional coverage'],
    fullText: 'Many states have enacted laws providing additional balance billing protections beyond the federal No Surprises Act. These may include broader provider types, different dispute resolution processes, or additional patient protections. Patients should check their state insurance department website for specific protections.',
    source: 'Various State Insurance Codes',
    url: 'https://www.naic.org/store/free/BWG-OP.pdf'
  }
]

export function searchLaws(keywords: string[]): LawEntry[] {
  const normalizedKeywords = keywords.map(k => k.toLowerCase())

  return healthcareLaws.filter(law =>
    normalizedKeywords.some(keyword =>
      law.keywords.some(lawKeyword =>
        lawKeyword.toLowerCase().includes(keyword) ||
        keyword.includes(lawKeyword.toLowerCase())
      ) ||
      law.title.toLowerCase().includes(keyword) ||
      law.summary.toLowerCase().includes(keyword)
    )
  )
}

export function extractKeywords(text: string): string[] {
  const commonTerms = [
    'balance billing', 'out of network', 'emergency', 'surprise billing',
    'denied claim', 'appeal', 'coverage', 'deductible', 'copay', 'coinsurance',
    'prior authorization', 'preventive care', 'essential benefits', 'EOB',
    'explanation of benefits', 'claims', 'provider', 'facility fee',
    'anesthesia', 'radiology', 'pathology', 'emergency room', 'urgent care',
    'ambulance', 'hospital', 'outpatient', 'inpatient'
  ]

  const text_lower = text.toLowerCase()
  return commonTerms.filter(term => text_lower.includes(term))
}