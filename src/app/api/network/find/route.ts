import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Starting In-Network Finder...')

    const body = await request.json()
    const { payer, state, npi, specialty, providerName } = body

    let npiSummary = null
    let directoryLinks: Array<{label: string, url: string, description: string}> = []

    // Look up NPI information if provided
    if (npi) {
      console.log(`🔍 Looking up NPI: ${npi}`)

      const { data: npiData, error: npiError } = await supabaseAdmin
        .from('nppes')
        .select('*')
        .eq('npi', npi)
        .single()

      if (!npiError && npiData) {
        npiSummary = {
          npi: npiData.npi,
          name: npiData.entity_type === '1'
            ? `${npiData.first_name} ${npiData.last_name}`.trim()
            : npiData.organization_name,
          entityType: npiData.entity_type === '1' ? 'Individual' : 'Organization',
          taxonomy: npiData.taxonomy_desc,
          state: npiData.state
        }

        console.log(`✅ Found NPI: ${npiSummary.name}`)
      }
    }

    // Get directory links from resource_links table
    if (payer && state) {
      console.log(`🔍 Finding directory links for ${payer} in ${state}`)

      const { data: links, error: linksError } = await supabaseAdmin
        .from('resource_links')
        .select('*')
        .or(`key.eq.payer:${payer}:directory:${state},key.eq.payer:${payer}:directory`)

      if (!linksError && links) {
        directoryLinks = links.map(link => ({
          label: link.label,
          url: link.url,
          description: `Find in-network providers for ${payer}`
        }))
      }
    }

    // Fallback: common payer directory patterns
    if (directoryLinks.length === 0 && payer) {
      directoryLinks = getPayerDirectoryLinks(payer, state)
    }

    // Generate call script
    const callScript = generateCallScript({
      payer,
      providerName: providerName || npiSummary?.name,
      npi,
      state
    })

    console.log('✅ In-Network Finder completed')

    return NextResponse.json({
      success: true,
      npiSummary,
      directoryLinks,
      callScript,
      searchParams: {
        payer,
        state,
        npi,
        specialty,
        providerName
      }
    })

  } catch (error) {
    console.error('❌ Network finder failed:', error)
    return NextResponse.json(
      {
        error: 'Network finder failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

function getPayerDirectoryLinks(payer: string, state?: string): Array<{label: string, url: string, description: string}> {
  const payerLower = payer.toLowerCase()
  const links = []

  // Common payer directory patterns
  if (payerLower.includes('anthem') || payerLower.includes('elevance')) {
    links.push({
      label: 'Anthem Provider Directory',
      url: 'https://www.anthem.com/find-doctor',
      description: 'Search Anthem\'s provider network'
    })
  }

  if (payerLower.includes('aetna')) {
    links.push({
      label: 'Aetna Provider Directory',
      url: 'https://www.aetna.com/individuals-families/find-care.html',
      description: 'Search Aetna\'s provider network'
    })
  }

  if (payerLower.includes('united') || payerLower.includes('uhc')) {
    links.push({
      label: 'UnitedHealthcare Provider Directory',
      url: 'https://www.uhc.com/find-a-doctor',
      description: 'Search UnitedHealthcare\'s provider network'
    })
  }

  if (payerLower.includes('cigna')) {
    links.push({
      label: 'Cigna Provider Directory',
      url: 'https://www.cigna.com/individuals-families/member-guide/find-in-network-doctor',
      description: 'Search Cigna\'s provider network'
    })
  }

  if (payerLower.includes('humana')) {
    links.push({
      label: 'Humana Provider Directory',
      url: 'https://www.humana.com/provider/support/directory',
      description: 'Search Humana\'s provider network'
    })
  }

  if (payerLower.includes('blue cross') || payerLower.includes('bcbs')) {
    links.push({
      label: 'Blue Cross Blue Shield Provider Directory',
      url: 'https://www.bcbs.com/find-doctor',
      description: 'Search Blue Cross Blue Shield\'s provider network'
    })
  }

  // Generic fallback
  if (links.length === 0) {
    links.push({
      label: `${payer} Provider Directory`,
      url: '#',
      description: `Contact ${payer} customer service for provider directory access`
    })
  }

  return links
}

function generateCallScript({ payer, providerName, npi, state }: {
  payer?: string
  providerName?: string
  npi?: string
  state?: string
}): string {
  const providerInfo = providerName || 'the provider'
  const npiInfo = npi ? ` (NPI ${npi})` : ''
  const locationInfo = state ? ` in ${state}` : ''

  return `Hi, I'm calling to confirm in-network status for ${providerInfo}${npiInfo}${locationInfo}.

I need to verify:
1. Is this provider in-network for my specific plan?
2. Are there different tiers or copay levels?
3. Do I need a referral or prior authorization?
4. Are there any facility fees I should expect?
5. What's the effective date range for this network status?

My member ID is [your ID] and I'm planning [type of service] for [approximate date].

Can you also confirm if there are any network changes coming up that might affect this provider?

Thank you for your help in avoiding surprise bills.`
}