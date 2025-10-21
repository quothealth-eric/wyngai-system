/**
 * eCFR (Electronic Code of Federal Regulations) Connector
 * Fetches federal regulations relevant to healthcare and insurance
 */

import { BaseDataSourceConnector, DiscoveredDocument, ProcessedDocument, DocumentSection } from '../base-connector'

interface ECFRTitle {
  title: number
  name: string
  parts: ECFRPart[]
}

interface ECFRPart {
  part: number
  name: string
  sections: ECFRSection[]
}

interface ECFRSection {
  section: string
  name: string
  url: string
}

export class ECFRConnector extends BaseDataSourceConnector {
  private readonly relevantTitles = [
    { title: 26, name: 'Internal Revenue', focus: ['COBRA', 'HSA', 'FSA'] },
    { title: 29, name: 'Labor', focus: ['ERISA', 'Benefits'] },
    { title: 42, name: 'Public Health', focus: ['ACA', 'Medicare', 'Medicaid'] },
    { title: 45, name: 'Public Welfare', focus: ['HHS regulations'] }
  ]

  constructor() {
    super('ecfr', 'federal', undefined, {}, 100)
  }

  async fetchIndex(): Promise<DiscoveredDocument[]> {
    const discovered: DiscoveredDocument[] = []

    for (const titleInfo of this.relevantTitles) {
      try {
        await this.enforceRateLimit()

        console.log(`[eCFR] Fetching title ${titleInfo.title}: ${titleInfo.name}`)
        const titleDocs = await this.fetchTitleIndex(titleInfo.title)
        discovered.push(...titleDocs)

      } catch (error) {
        console.error(`[eCFR] Failed to fetch title ${titleInfo.title}:`, error)
      }
    }

    return discovered
  }

  private async fetchTitleIndex(titleNumber: number): Promise<DiscoveredDocument[]> {
    const discovered: DiscoveredDocument[] = []

    // Fetch title structure from eCFR API
    const apiUrl = `https://www.ecfr.gov/api/renderer/v1/navigation/title-${titleNumber}`

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'WyngAI-Crawler/1.0 (healthcare.research@wyng.ai)'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const titleData = await response.json()

      // Process parts within the title
      if (titleData.children) {
        for (const part of titleData.children) {
          const partDocs = await this.processPart(titleNumber, part)
          discovered.push(...partDocs)
        }
      }

    } catch (error) {
      console.error(`[eCFR] API error for title ${titleNumber}:`, error)
      // Fallback to scraping if API fails
      return this.scrapeTitleIndex(titleNumber)
    }

    return discovered
  }

  private async processPart(titleNumber: number, part: any): Promise<DiscoveredDocument[]> {
    const discovered: DiscoveredDocument[] = []

    // Filter for healthcare-relevant parts
    if (!this.isHealthcareRelevant(titleNumber, part.identifier)) {
      return discovered
    }

    console.log(`[eCFR] Processing ${titleNumber} CFR ${part.identifier}: ${part.label}`)

    // Get sections within this part
    if (part.children) {
      for (const section of part.children) {
        discovered.push({
          url: `https://www.ecfr.gov/current/title-${titleNumber}/part-${part.identifier}/section-${section.identifier}`,
          title: `${titleNumber} CFR ${part.identifier}.${section.identifier} - ${section.label}`,
          doc_type: 'regulation',
          eff_date: section.effective_date,
          version: section.version || 'current'
        })
      }
    }

    return discovered
  }

  private isHealthcareRelevant(title: number, part: string): boolean {
    const relevantParts: Record<number, string[]> = {
      26: ['54', '125'], // COBRA, cafeteria plans
      29: ['2520', '2560', '2590'], // ERISA disclosure, claims procedures, COBRA
      42: ['430', '431', '435', '440', '447', '482', '483'], // Medicaid, provider requirements
      45: ['144', '146', '147', '155', '156', '158'] // ACA marketplace, privacy
    }

    const titleRelevant = relevantParts[title] || []
    return titleRelevant.some(relevantPart => part.includes(relevantPart))
  }

  private async scrapeTitleIndex(titleNumber: number): Promise<DiscoveredDocument[]> {
    // Fallback scraping implementation
    console.log(`[eCFR] Falling back to scraping for title ${titleNumber}`)

    const url = `https://www.ecfr.gov/current/title-${titleNumber}`
    const response = await fetch(url)
    const html = await response.text()

    // Dynamic import of cheerio for server-side use
    const { load } = await import('cheerio')
    const $ = load(html)

    const discovered: DiscoveredDocument[] = []

    // Parse the HTML structure to find relevant sections
    $('.part-link').each((_, element) => {
      const $link = $(element)
      const href = $link.attr('href')
      const text = $link.text().trim()

      if (href && this.isHealthcareRelevantByText(text)) {
        discovered.push({
          url: `https://www.ecfr.gov${href}`,
          title: text,
          doc_type: 'regulation'
        })
      }
    })

    return discovered
  }

  private isHealthcareRelevantByText(text: string): boolean {
    const keywords = [
      'health', 'medical', 'insurance', 'cobra', 'erisa', 'medicare', 'medicaid',
      'aca', 'affordable care', 'marketplace', 'benefits', 'coverage', 'claims'
    ]

    const lowerText = text.toLowerCase()
    return keywords.some(keyword => lowerText.includes(keyword))
  }

  async fetchDoc(url: string): Promise<ProcessedDocument> {
    await this.enforceRateLimit()

    // Try JSON API first
    const jsonUrl = url.replace('/current/', '/api/renderer/v1/content/')

    try {
      const response = await fetch(jsonUrl, {
        headers: {
          'User-Agent': 'WyngAI-Crawler/1.0 (healthcare.research@wyng.ai)'
        }
      })

      if (response.ok) {
        const data = await response.json()
        return this.processJSONContent(url, data)
      }
    } catch (error) {
      console.log(`[eCFR] JSON API failed for ${url}, falling back to HTML`)
    }

    // Fallback to HTML scraping
    return this.scrapeHTMLContent(url)
  }

  private async processJSONContent(url: string, data: any): Promise<ProcessedDocument> {
    const title = data.title || 'eCFR Section'
    const content = this.extractTextFromJSON(data)

    return {
      url,
      title,
      content,
      metadata: {
        authority: 'eCFR',
        cfr_citation: data.citation,
        effective_date: data.effective_date,
        source_format: 'json_api'
      },
      doc_type: 'regulation',
      eff_date: data.effective_date,
      version: data.version || 'current',
      sha256: this.generateContentHash(content)
    }
  }

  private extractTextFromJSON(data: any): string {
    let text = ''

    // Extract text from structured JSON content
    if (data.content) {
      text += this.processContentNode(data.content)
    }

    if (data.sections) {
      for (const section of data.sections) {
        text += this.processContentNode(section)
      }
    }

    return this.cleanText(text)
  }

  private processContentNode(node: any): string {
    if (typeof node === 'string') {
      return node + '\n'
    }

    if (Array.isArray(node)) {
      return node.map(item => this.processContentNode(item)).join('')
    }

    if (typeof node === 'object' && node !== null) {
      let text = ''

      if (node.tag === 'SECTNO') {
        text += `\n§ ${node.content}\n`
      } else if (node.tag === 'SUBJECT') {
        text += `${node.content}\n`
      } else if (node.tag === 'P') {
        text += `${this.processContentNode(node.content)}\n`
      } else if (node.content) {
        text += this.processContentNode(node.content)
      }

      if (node.children) {
        text += this.processContentNode(node.children)
      }

      return text
    }

    return ''
  }

  private async scrapeHTMLContent(url: string): Promise<ProcessedDocument> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WyngAI-Crawler/1.0 (healthcare.research@wyng.ai)'
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const html = await response.text()

    // Dynamic import of cheerio for server-side use
    const { load } = await import('cheerio')
    const $ = load(html)

    // Extract title
    const title = $('h1').first().text().trim() ||
                  $('.section-number').first().text().trim() ||
                  'eCFR Section'

    // Extract main content
    let content = ''

    $('.section-content, .section-body, .section').each((_, element) => {
      content += $(element).text() + '\n'
    })

    if (!content) {
      // Fallback: extract all text from main content area
      content = $('.content, #content, main').text()
    }

    content = this.cleanText(content)

    return {
      url,
      title,
      content,
      metadata: {
        authority: 'eCFR',
        source_format: 'html_scrape'
      },
      doc_type: 'regulation',
      sha256: this.generateContentHash(content)
    }
  }

  async splitToSections(doc: ProcessedDocument): Promise<DocumentSection[]> {
    const sections: DocumentSection[] = []

    // Split by regulation sections (§ markers)
    const sectionRegex = /§\s*\d+\.\d+/g
    const sectionMarkers = [...doc.content.matchAll(sectionRegex)]

    if (sectionMarkers.length > 1) {
      // Split at each section marker
      for (let i = 0; i < sectionMarkers.length; i++) {
        const currentMarker = sectionMarkers[i]
        const nextMarker = sectionMarkers[i + 1]

        const startIndex = currentMarker.index!
        const endIndex = nextMarker ? nextMarker.index! : doc.content.length

        const sectionText = doc.content.slice(startIndex, endIndex).trim()
        const sectionNumber = currentMarker[0].trim()

        if (sectionText.length > 100) { // Skip very short sections
          sections.push({
            section_path: sectionNumber,
            title: this.extractSectionTitle(sectionText),
            text: this.cleanText(sectionText),
            tokens: this.estimateTokens(sectionText),
            eff_date: doc.eff_date,
            version: doc.version
          })
        }
      }
    } else {
      // No clear section markers, split by size
      const chunks = this.splitTextIntoChunks(doc.content, 800, 100)

      chunks.forEach((chunk, index) => {
        sections.push({
          section_path: `chunk_${index + 1}`,
          title: index === 0 ? doc.title : undefined,
          text: chunk,
          tokens: this.estimateTokens(chunk),
          eff_date: doc.eff_date,
          version: doc.version
        })
      })
    }

    return sections
  }

  private extractSectionTitle(sectionText: string): string | undefined {
    // Look for title after section number
    const lines = sectionText.split('\n')
    if (lines.length > 1) {
      const secondLine = lines[1].trim()
      if (secondLine && secondLine.length < 200) {
        return secondLine
      }
    }

    return undefined
  }
}