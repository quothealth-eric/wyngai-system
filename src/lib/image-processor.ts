import Tesseract from 'tesseract.js'

export interface ProcessedImage {
  artifactId: string
  mime: string
  width: number
  height: number
  ocrText: string
  ocrConf: number
  documentType: 'eob' | 'bill' | 'insurance_card' | 'unknown'
  extractedData: ExtractedData
}

export interface ExtractedData {
  header: {
    providerName?: string
    NPI?: string
    TIN?: string
    payer?: string
    claimId?: string
    accountId?: string
    serviceDates?: string[]
  }
  totals: {
    billed?: number
    allowed?: number
    planPaid?: number
    patientResp?: number
  }
  lines: LineItem[]
  remarks: {
    carcRarc?: string[]
    denialText?: string[]
    freeText?: string[]
  }
  appeal?: {
    address?: string
    deadlineDateISO?: string
  }
}

export interface LineItem {
  lineId: string
  code?: string
  modifiers?: string[]
  description?: string
  units?: number
  dos?: string
  pos?: string
  revCode?: string
  npi?: string
  charge?: number
  allowed?: number
  planPaid?: number
  patientResp?: number
  conf?: number
}

export class ImageProcessor {

  static async preprocessImage(imageFile: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()

      img.onload = () => {
        try {
          canvas.width = img.width
          canvas.height = img.height

          if (!ctx) {
            reject(new Error('Failed to get canvas context'))
            return
          }

          ctx.drawImage(img, 0, 0)

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const data = imageData.data

          for (let i = 0; i < data.length; i += 4) {
            const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]

            if (brightness > 200) {
              data[i] = data[i + 1] = data[i + 2] = 255
            } else if (brightness < 100) {
              data[i] = data[i + 1] = data[i + 2] = 0
            }
          }

          ctx.putImageData(imageData, 0, 0)

          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('Failed to create blob'))
            }
          }, 'image/png')
        } catch (error) {
          reject(error)
        }
      }

      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = URL.createObjectURL(imageFile)
    })
  }

  static async performOCR(imageFile: File): Promise<{ text: string; confidence: number }> {
    try {
      let processedImage: Blob

      if (imageFile.type.startsWith('image/')) {
        processedImage = await this.preprocessImage(imageFile)
      } else {
        processedImage = imageFile
      }

      const worker = await Tesseract.createWorker({
        logger: () => {} // Disable logging
      })

      await worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,()-:/$% ',
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      })

      const { data } = await worker.recognize(processedImage)
      await worker.terminate()

      return {
        text: data.text,
        confidence: data.confidence
      }
    } catch (error) {
      console.error('OCR Error:', error)
      throw new Error('Failed to perform OCR')
    }
  }

  static detectDocumentType(ocrText: string): 'eob' | 'bill' | 'insurance_card' | 'unknown' {
    const text = ocrText.toLowerCase()

    const eobMarkers = [
      'explanation of benefits',
      'allowed amount',
      'plan paid',
      'patient responsibility',
      'claim #',
      'carc',
      'rarc',
      'this is not a bill'
    ]

    const billMarkers = [
      'itemized',
      'account #',
      'due by',
      'amount due',
      'balance',
      'patient statement',
      'billing summary'
    ]

    const cardMarkers = [
      'member id',
      'group #',
      'bin',
      'pcn',
      'rxgrp',
      'effective date'
    ]

    const eobScore = eobMarkers.reduce((score, marker) =>
      score + (text.includes(marker) ? 1 : 0), 0
    )

    const billScore = billMarkers.reduce((score, marker) =>
      score + (text.includes(marker) ? 1 : 0), 0
    )

    const cardScore = cardMarkers.reduce((score, marker) =>
      score + (text.includes(marker) ? 1 : 0), 0
    )

    if (eobScore >= 2) return 'eob'
    if (billScore >= 2) return 'bill'
    if (cardScore >= 2) return 'insurance_card'

    return 'unknown'
  }

  static extractEntities(ocrText: string, documentType: string): ExtractedData {
    const lines = ocrText.split('\n').map(line => line.trim()).filter(line => line.length > 0)

    const extractedData: ExtractedData = {
      header: {},
      totals: {},
      lines: [],
      remarks: {}
    }

    this.extractHeader(lines, extractedData.header)
    this.extractTotals(lines, extractedData.totals)
    this.extractLineItems(lines, extractedData.lines)
    this.extractRemarks(lines, extractedData.remarks)
    this.extractAppealInfo(lines, extractedData)

    return extractedData
  }

  private static extractHeader(lines: string[], header: any): void {
    for (const line of lines) {
      if (!header.providerName && /provider|facility|hospital|clinic/i.test(line)) {
        const match = line.match(/(?:provider|facility|hospital|clinic)[:\s]+(.+)/i)
        if (match && match[1].length > 3) {
          header.providerName = match[1].trim()
        }
      }

      if (!header.NPI && /npi/i.test(line)) {
        const match = line.match(/npi[:\s]*(\d{10})/i)
        if (match) {
          header.NPI = match[1]
        }
      }

      if (!header.TIN && /tin|tax\s*id/i.test(line)) {
        const match = line.match(/(?:tin|tax\s*id)[:\s]*(\d{2}-?\d{7})/i)
        if (match) {
          header.TIN = match[1]
        }
      }

      if (!header.claimId && /claim/i.test(line)) {
        const match = line.match(/claim[#:\s]*([A-Z0-9-]+)/i)
        if (match && match[1].length > 3) {
          header.claimId = match[1]
        }
      }

      if (!header.accountId && /account/i.test(line)) {
        const match = line.match(/account[#:\s]*([A-Z0-9-]+)/i)
        if (match && match[1].length > 3) {
          header.accountId = match[1]
        }
      }
    }

    const datePattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g
    const allText = lines.join(' ')
    const dateMatches = allText.match(datePattern)
    const dates = dateMatches ? Array.from(dateMatches) : []
    if (dates.length > 0) {
      header.serviceDates = dates
    }
  }

  private static extractTotals(lines: string[], totals: any): void {
    const dollarRegex = /\$?([\d,]+\.?\d*)/

    for (const line of lines) {
      const lowerLine = line.toLowerCase()

      if (lowerLine.includes('total') && lowerLine.includes('charge')) {
        const match = line.match(dollarRegex)
        if (match && !totals.billed) {
          totals.billed = parseFloat(match[1].replace(/,/g, ''))
        }
      }

      if (lowerLine.includes('allowed') || lowerLine.includes('approved')) {
        const match = line.match(dollarRegex)
        if (match && !totals.allowed) {
          totals.allowed = parseFloat(match[1].replace(/,/g, ''))
        }
      }

      if (lowerLine.includes('plan paid') || lowerLine.includes('insurance paid')) {
        const match = line.match(dollarRegex)
        if (match && !totals.planPaid) {
          totals.planPaid = parseFloat(match[1].replace(/,/g, ''))
        }
      }

      if ((lowerLine.includes('patient') && lowerLine.includes('responsibility')) ||
          lowerLine.includes('amount due') ||
          lowerLine.includes('balance')) {
        const match = line.match(dollarRegex)
        if (match && !totals.patientResp) {
          totals.patientResp = parseFloat(match[1].replace(/,/g, ''))
        }
      }
    }
  }

  private static extractLineItems(lines: string[], lineItems: LineItem[]): void {
    const cptRegex = /\b\d{5}\b/
    const hcpcsRegex = /\b[A-Z]\d{4}\b/
    const dollarRegex = /\$?([\d,]+\.?\d*)/g

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const cptMatch = line.match(cptRegex)
      const hcpcsMatch = line.match(hcpcsRegex)

      if (cptMatch || hcpcsMatch) {
        const code = cptMatch ? cptMatch[0] : hcpcsMatch![0]
        const dollarMatches = Array.from(line.matchAll(dollarRegex))

        const lineItem: LineItem = {
          lineId: `line_${i}`,
          code: code,
          description: this.extractDescription(line, code),
          conf: 0.8
        }

        if (dollarMatches.length >= 1) {
          lineItem.charge = parseFloat(dollarMatches[0][1].replace(/,/g, ''))
        }
        if (dollarMatches.length >= 2) {
          lineItem.allowed = parseFloat(dollarMatches[1][1].replace(/,/g, ''))
        }
        if (dollarMatches.length >= 3) {
          lineItem.planPaid = parseFloat(dollarMatches[2][1].replace(/,/g, ''))
        }
        if (dollarMatches.length >= 4) {
          lineItem.patientResp = parseFloat(dollarMatches[3][1].replace(/,/g, ''))
        }

        const dosMatch = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
        if (dosMatch) {
          lineItem.dos = dosMatch[0]
        }

        const modifierMatch = line.match(/\b(25|26|59|TC|51|24|79|RT|LT)\b/)
        if (modifierMatch) {
          lineItem.modifiers = [modifierMatch[0]]
        }

        lineItems.push(lineItem)
      }
    }
  }

  private static extractDescription(line: string, code: string): string {
    let description = line.replace(code, '').trim()
    description = description.replace(/\$[\d,]+\.?\d*/g, '').trim()
    description = description.replace(/^\d+\s*/, '').trim()
    description = description.replace(/\s+/g, ' ').trim()

    return description.substring(0, 100)
  }

  private static extractRemarks(lines: string[], remarks: any): void {
    const carcPattern = /carc[:\s]*(\d+)/i
    const rarcPattern = /rarc[:\s]*([A-Z0-9]+)/i

    remarks.carcRarc = []
    remarks.denialText = []
    remarks.freeText = []

    for (const line of lines) {
      const carcMatch = line.match(carcPattern)
      if (carcMatch) {
        remarks.carcRarc.push(`CARC ${carcMatch[1]}`)
      }

      const rarcMatch = line.match(rarcPattern)
      if (rarcMatch) {
        remarks.carcRarc.push(`RARC ${rarcMatch[1]}`)
      }

      if (line.toLowerCase().includes('denied') || line.toLowerCase().includes('not covered')) {
        remarks.denialText.push(line)
      }
    }
  }

  private static extractAppealInfo(lines: string[], extractedData: ExtractedData): void {
    for (const line of lines) {
      if (line.toLowerCase().includes('appeal') && line.toLowerCase().includes('address')) {
        const addressMatch = line.match(/address[:\s]+(.+)/i)
        if (addressMatch) {
          extractedData.appeal = {
            address: addressMatch[1].trim()
          }
        }
      }

      if (line.toLowerCase().includes('deadline') || line.toLowerCase().includes('within')) {
        const dayMatch = line.match(/(\d+)\s*days?/i)
        if (dayMatch) {
          const days = parseInt(dayMatch[1])
          const deadline = new Date()
          deadline.setDate(deadline.getDate() + days)
          if (!extractedData.appeal) extractedData.appeal = {}
          extractedData.appeal.deadlineDateISO = deadline.toISOString()
        }
      }
    }
  }

  static async processImage(file: File): Promise<ProcessedImage> {
    const ocrResult = await this.performOCR(file)
    const documentType = this.detectDocumentType(ocrResult.text)
    const extractedData = this.extractEntities(ocrResult.text, documentType)

    return {
      artifactId: `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      mime: file.type,
      width: 0,
      height: 0,
      ocrText: ocrResult.text,
      ocrConf: ocrResult.confidence,
      documentType,
      extractedData
    }
  }
}