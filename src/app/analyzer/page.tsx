'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileUpload } from '@/components/features/file-upload'
import { BenefitsForm } from '@/components/features/benefits-form'
import { AnalysisResults } from '@/components/features/analysis-results'
import { EmailCollectionModal } from '@/components/features/email-collection-modal'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { BenefitsData } from '@/lib/validations'
import { ArrowLeft, FileText, Heart, User, DollarSign, AlertTriangle } from 'lucide-react'

// Function to create analysis results from OCR data when API fails
async function createAnalysisFromOCR(files: UploadedFile[], description: string, context: any) {
  console.log('📝 Creating analysis from OCR data...')

  // Extract text content from all files
  const allOcrText = files.map(f => f.ocrText || '').join('\n\n')
  const totalCharacters = allOcrText.length

  // Basic text analysis to extract potential billing codes and amounts
  const cptCodes = Array.from(allOcrText.matchAll(/\b(CPT|HCPCS)?\s*(\d{5})\b/gi))
    .map(match => match[2])
    .filter(code => code >= '90000' && code <= '99999') // Valid CPT range

  const amounts = Array.from(allOcrText.matchAll(/\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g))
    .map(match => parseFloat(match[1].replace(/,/g, '')))
    .filter(amount => amount > 0 && amount < 100000) // Reasonable medical bill range

  // Basic duplicate detection
  const duplicateCodes = cptCodes.filter((code, index) => cptCodes.indexOf(code) !== index)
  const duplicateAmounts = amounts.filter((amount, index) =>
    amounts.filter(a => Math.abs(a - amount) < 0.01).length > 1
  )

  // Create line items from extracted data
  const items = cptCodes.map((code, index) => ({
    page: Math.floor(index / 3) + 1, // Distribute across pages
    dos: new Date().toISOString().split('T')[0], // Today's date as fallback
    code: code,
    codeSystem: "CPT",
    description: `Medical service (extracted from ${files[Math.floor(index / 3)]?.name || 'document'})`,
    modifiers: [],
    units: 1,
    charge: amounts[index] || 0,
    department: "EXTRACTED_DATA",
    notes: `OCR extracted from page ${Math.floor(index / 3) + 1}`
  }))

  // Generate findings based on OCR analysis
  const findings = []

  if (duplicateCodes.length > 0) {
    findings.push({
      detectorId: 1,
      detectorName: "Duplicate CPT Codes Detected",
      severity: "high" as const,
      affectedLines: duplicateCodes.map((_, i) => i + 1),
      rationale: `Found ${duplicateCodes.length} duplicate CPT codes in the uploaded documents: ${duplicateCodes.join(', ')}. This may indicate billing errors or duplicate charges.`,
      suggestedDocs: ["Request itemized bill with line-by-line breakdown", "Compare with EOB"],
      policyCitations: ["45 CFR §149.110 - Accurate billing requirements"]
    })
  }

  if (duplicateAmounts.length > 0) {
    findings.push({
      detectorId: 2,
      detectorName: "Duplicate Dollar Amounts",
      severity: "warn" as const,
      affectedLines: duplicateAmounts.map((_, i) => i + 1),
      rationale: `Found ${duplicateAmounts.length} duplicate dollar amounts which may indicate duplicate billing: $${duplicateAmounts.join(', $')}.`,
      suggestedDocs: ["Verify services were actually provided multiple times", "Request detailed billing explanation"],
      policyCitations: ["Federal billing accuracy requirements"]
    })
  }

  if (totalCharacters < 100) {
    findings.push({
      detectorId: 18,
      detectorName: "Limited OCR Text Extracted",
      severity: "info" as const,
      affectedLines: [],
      rationale: `OCR extracted only ${totalCharacters} characters total. Document quality may be poor or text may not be machine-readable.`,
      suggestedDocs: ["Request digital copy of bill", "Scan documents at higher resolution"],
      policyCitations: ["45 CFR §164.524 - Right to obtain copies of medical records"]
    })
  }

  // If no specific issues found, add a general review finding
  if (findings.length === 0) {
    findings.push({
      detectorId: 0,
      detectorName: "General Bill Review",
      severity: "info" as const,
      affectedLines: items.map((_, i) => i + 1),
      rationale: `Reviewed ${files.length} documents with ${items.length} line items. While no obvious violations were detected in the OCR text, manual review is recommended.`,
      suggestedDocs: ["Compare with EOB", "Verify insurance coverage", "Check for prior authorization requirements"],
      policyCitations: ["Consumer right to accurate billing"]
    })
  }

  const totalCharges = amounts.reduce((sum, amt) => sum + amt, 0)

  return {
    analysis: {
      header: {
        facility: "Extracted from uploaded documents",
        patientName: "Patient information extracted from OCR",
        patientRef: null,
        serviceDateStart: new Date().toISOString().split('T')[0],
        serviceDateEnd: null,
        mrn: null,
        accountNumber: null
      },
      items,
      codesIndex: cptCodes.reduce((acc, code, i) => {
        acc[code] = {
          description: `Medical service code ${code}`,
          occurrences: cptCodes.filter(c => c === code).length,
          totalCharge: amounts.filter((_, idx) => cptCodes[idx] === code).reduce((sum, amt) => sum + amt, 0)
        }
        return acc
      }, {} as Record<string, any>),
      combinedQuery: `OCR Analysis of ${files.length} documents containing ${totalCharacters} characters. ${description || 'No additional context provided.'}`,
      findings,
      math: {
        sumOfLineCharges: totalCharges,
        lineCount: items.length,
        uniqueCodes: new Set(cptCodes).size,
        byDepartment: { "EXTRACTED_DATA": items.length },
        notes: [
          `OCR extracted ${totalCharacters} characters from ${files.length} documents`,
          `Found ${cptCodes.length} potential CPT codes and ${amounts.length} dollar amounts`,
          "This is a basic OCR-based analysis - for comprehensive review, ensure clear document images"
        ]
      },
      report_md: `# WyngAI Bill Analysis Report

## Documents Processed
- **Files**: ${files.length} documents uploaded
- **OCR Quality**: ${totalCharacters} characters extracted
- **Codes Found**: ${cptCodes.length} potential CPT codes
- **Amounts Found**: ${amounts.length} dollar amounts

## Key Findings
${findings.map(f => `- **${f.detectorName}**: ${f.rationale}`).join('\n')}

## Next Steps
1. Review all identified issues above
2. Contact your insurance company if billing violations are found
3. Request itemized bills for any unclear charges
4. Keep documentation of all communications

*Analysis generated by WyngAI from OCR text extraction*`
    },
    appeals: {
      appeals: {
        checklist: [
          "Review OCR-extracted billing codes and amounts",
          "Verify services were actually received",
          "Compare with your EOB if available",
          "Contact insurance company about any discrepancies",
          "Request itemized bill if not already provided",
          "Document all communications with providers and insurers"
        ],
        docRequests: [
          "Complete itemized bill with CPT codes",
          "Explanation of Benefits (EOB) from insurance",
          "Medical records for services in question",
          "Insurance policy documentation",
          "Prior authorization records if applicable"
        ],
        letters: {
          payer_appeal: {
            subject: `Bill Review Request - OCR Analysis Found Potential Issues`,
            body_md: `**Subject: Bill Review Request - OCR Analysis Found Potential Issues**

Dear Insurance Review Team,

I am writing to request a review of billing for services rendered. Using OCR analysis of my medical bills, I have identified potential issues that require clarification:

**Documents Analyzed**: ${files.length} billing documents
**Issues Identified**:
${findings.map(f => `- ${f.detectorName}: ${f.rationale}`).join('\n')}

**Requested Action**:
Please review these charges and provide:
1. Detailed explanation of all billing codes
2. Verification that all charges are accurate and covered per my policy
3. Corrected billing if any errors are found

Thank you for your prompt attention to this matter.

Sincerely,
[Your Name]`,
            citations: findings.flatMap(f => f.policyCitations)
          },
          provider_dispute: {
            subject: `Billing Clarification Request - Multiple Documents Review`,
            body_md: `**Subject: Billing Clarification Request - Multiple Documents Review**

Dear Billing Department,

I am requesting clarification on charges across ${files.length} billing documents. OCR analysis has identified potential discrepancies that need review:

**Issues Requiring Clarification**:
${findings.map(f => `- ${f.detectorName}`).join('\n')}

Please provide:
1. Itemized breakdown of all services
2. Explanation of any duplicate or similar charges
3. Verification of accuracy for all billing codes

I look forward to your response within 30 days.

Best regards,
[Your Name]`,
            citations: ["Healthcare billing accuracy standards"]
          },
          state_doi_complaint: {
            subject: `Consumer Complaint - Medical Billing Analysis`,
            body_md: `**Subject: Consumer Complaint - Medical Billing Analysis**

Dear State Insurance Department,

I am filing a complaint regarding potential medical billing irregularities identified through document analysis:

**Complaint Details**:
- Provider bills analyzed: ${files.length}
- Issues identified: ${findings.length}
- Primary concerns: ${findings.map(f => f.detectorName).join(', ')}

Please investigate these billing practices and provide guidance on resolution.

Respectfully,
[Your Name]`,
            citations: ["State consumer protection laws"]
          }
        },
        phone_scripts: {
          insurer: `Hi, I'm calling about billing for recent medical services. I've analyzed ${files.length} billing documents and found potential issues including ${findings.map(f => f.detectorName).join(' and ')}. Can you help me understand these charges and verify they're accurate according to my policy? I have the specific codes and amounts if you need them.`,
          provider: `Hello, I'm calling about billing questions for recent services. I've reviewed ${files.length} billing documents and have questions about ${findings.length} potential issues I identified. Can you help clarify these charges and ensure billing accuracy? I'd like to speak with someone who can review the specific billing codes.`,
          state_doi: `Hi, I need guidance on medical billing issues. I've analyzed billing documents and identified potential irregularities including ${findings.map(f => f.detectorName).join(' and ')}. Can you direct me to the appropriate process for filing a complaint or getting these billing issues resolved?`
        }
      }
    },
    metadata: {
      anthropicAvailable: false,
      openaiAvailable: false,
      selectedProvider: "WyngAI",
      filesProcessed: files.length,
      contextProvided: !!description || Object.keys(context).some(k => context[k])
    }
  }
}

// Create analysis results from real database data (documents and line items)
function createAnalysisFromDatabaseData(
  lineItemsResult: any,
  description: string,
  benefits: BenefitsData
) {
  const { documents, lineItems, findings, summary } = lineItemsResult

  // Extract header information from the first document
  const headerInfo = documents.length > 0 ? {
    facility: "WyngAI Analysis",
    patientName: "Patient",
    serviceDateStart: lineItems.length > 0 ? lineItems[0].date_of_service : new Date().toISOString().split('T')[0],
    serviceDateEnd: lineItems.length > 0 ? lineItems[lineItems.length - 1].date_of_service : new Date().toISOString().split('T')[0],
  } : {}

  // Convert line items to analysis format
  const analysisItems = lineItems.map((item: any, index: number) => ({
    lineNumber: item.line_number || index + 1,
    page: item.page_number || 1,
    dos: item.date_of_service || new Date().toISOString().split('T')[0],
    code: item.code || '',
    codeSystem: item.code_type || 'UNKNOWN',
    description: item.description || 'No description',
    modifiers: item.modifiers || [],
    units: item.units || 1,
    charge: item.charge || 0,
    department: "EXTRACTED_DATA",
    notes: `Extracted from ${documents.find((d: any) => d.id === item.document_id)?.file_name || 'document'}`
  }))

  // Build codes index
  const codesIndex = lineItems.reduce((acc: any, item: any) => {
    if (item.code) {
      acc[item.code] = {
        code: item.code,
        system: item.code_type,
        description: item.description,
        occurrences: (acc[item.code]?.occurrences || 0) + 1
      }
    }
    return acc
  }, {})

  // Create combined query for context
  const combinedQuery = `Analysis of ${documents.length} medical documents with ${lineItems.length} line items. ${description ? `Context: ${description}` : ''}`

  return {
    analysis: {
      header: headerInfo,
      items: analysisItems,
      codesIndex,
      combinedQuery,
      findings: findings || [],
      math: {
        sumOfLineCharges: summary?.totalCharges || 0,
        lineCount: summary?.totalLineItems || lineItems.length,
        uniqueCodes: summary?.uniqueCodes || Object.keys(codesIndex).length,
        byDepartment: {
          "EXTRACTED_DATA": lineItems.length,
          ...summary?.codeTypes
        },
        notes: [
          `Analyzed ${documents.length} documents from database`,
          `Found ${lineItems.length} line items with ${Object.keys(codesIndex).length} unique codes`,
          `Total charges: $${(summary?.totalCharges || 0).toFixed(2)}`,
          `Code breakdown: ${summary?.codeTypes?.CPT || 0} CPT, ${summary?.codeTypes?.HCPCS || 0} HCPCS, ${summary?.codeTypes?.REV || 0} Revenue codes`
        ]
      },
      report_md: generateAnalysisReport(documents, lineItems, findings, summary)
    },
    appeals: generateAppealsData(findings, lineItems),
    metadata: {
      anthropicAvailable: false,
      openaiAvailable: false,
      selectedProvider: "WyngAI",
      filesProcessed: documents.length,
      contextProvided: !!description || Object.keys(benefits).some(k => benefits[k as keyof BenefitsData])
    }
  }
}

// Generate analysis report markdown
function generateAnalysisReport(documents: any[], lineItems: any[], findings: any[], summary: any) {
  const totalCharges = summary?.totalCharges || 0
  const highSeverityFindings = findings.filter(f => f.severity === 'high')
  const warnFindings = findings.filter(f => f.severity === 'warn')

  return `# WyngAI Medical Bill Analysis Report

## Documents Analyzed
- **Files**: ${documents.length} documents processed
- **Line Items**: ${lineItems.length} billing entries analyzed
- **Total Charges**: $${totalCharges.toFixed(2)}
- **Code Types**: ${summary?.codeTypes?.CPT || 0} CPT, ${summary?.codeTypes?.HCPCS || 0} HCPCS, ${summary?.codeTypes?.REV || 0} Revenue codes

## Compliance Analysis Results
- **Critical Issues**: ${highSeverityFindings.length} found
- **Warnings**: ${warnFindings.length} identified
- **Total Findings**: ${findings.length} compliance checks completed

## Key Findings
${findings.length > 0 ? findings.map(f => `- **${f.detectorName}** (${f.severity.toUpperCase()}): ${f.rationale}`).join('\n') : '- No compliance violations detected'}

## Recommendations
${findings.length > 0 ?
`1. Review all ${findings.length} findings listed above
2. Contact your insurance company about any billing violations
3. Request itemized documentation for unclear charges
4. Consider filing appeals for valid violations` :
`1. Your bill appears to be compliant with standard billing practices
2. Verify all services were received as billed
3. Compare with your insurance Explanation of Benefits (EOB)
4. Keep documentation for your records`}

## Next Steps
1. Use the Appeals tab to generate formal complaint letters
2. Use the Phone Scripts tab for guidance on calling providers/insurers
3. Document all communications regarding billing disputes
4. Keep copies of all analysis and correspondence

*Analysis completed by WyngAI using advanced medical billing compliance algorithms*`
}

// Generate appeals data based on findings
function generateAppealsData(findings: any[], lineItems: any[]) {
  const hasCritical = findings.some(f => f.severity === 'high')
  const hasWarnings = findings.some(f => f.severity === 'warn')

  return {
    appeals: {
      checklist: [
        "Review all compliance findings from WyngAI analysis",
        "Verify services were actually received as described",
        "Compare billing with your insurance EOB if available",
        "Contact insurance company about identified violations",
        "Request complete itemized bill if not provided",
        "Document all communications with providers and insurers",
        "Consider state insurance commission complaint if unresolved"
      ],
      docRequests: [
        "Complete itemized bill with all CPT/HCPCS codes",
        "Insurance Explanation of Benefits (EOB)",
        "Medical records for all services billed",
        "Insurance policy coverage documentation",
        "Prior authorization records if applicable",
        "Provider network participation verification"
      ],
      letters: {
        payer_appeal: {
          subject: `Insurance Claim Review Request - Billing Compliance Issues Identified`,
          body_md: `**Subject: Insurance Claim Review Request - Billing Compliance Issues Identified**

Dear Claims Review Department,

I am writing to request a comprehensive review of the attached medical bills based on compliance issues identified through professional billing analysis.

**Claim Details:**
- Total Amount: $${lineItems.reduce((sum: number, item: any) => sum + (item.charge || 0), 0).toFixed(2)}
- Service Items: ${lineItems.length} line items
- Analysis Date: ${new Date().toLocaleDateString()}

**Issues Identified:**
${findings.map(f => `- ${f.detectorName}: ${f.rationale}`).join('\n')}

**Requested Actions:**
1. Full review of billing compliance for this claim
2. Investigation of identified billing violations
3. Correction of any improper charges
4. Detailed explanation of any charges that remain

I have attached supporting documentation and request a written response within 30 days as required by applicable regulations.

Thank you for your attention to this matter.

Sincerely,
[Your Name]`,
          citations: findings.flatMap(f => f.policyCitations || [])
        },
        provider_dispute: {
          subject: `Medical Bill Dispute - Compliance Issues Require Resolution`,
          body_md: `**Subject: Medical Bill Dispute - Compliance Issues Require Resolution**

Dear Billing Department,

I am disputing charges on the attached medical bill based on billing compliance issues identified through professional analysis.

**Bill Details:**
- Total Amount in Question: $${lineItems.reduce((sum: number, item: any) => sum + (item.charge || 0), 0).toFixed(2)}
- Number of Line Items: ${lineItems.length}
- Analysis Date: ${new Date().toLocaleDateString()}

**Specific Issues Requiring Resolution:**
${findings.map(f => `- ${f.detectorName}: ${f.rationale}`).join('\n')}

**Documentation Requested:**
- Complete itemized bill with detailed CPT codes
- Medical records supporting all billed services
- Explanation of billing practices for flagged items

Please provide corrected billing or detailed justification for all charges within 30 days. Failure to resolve these issues may result in complaints to regulatory authorities.

Respectfully,
[Your Name]`,
          citations: findings.flatMap(f => f.policyCitations || [])
        },
        state_doi_complaint: {
          subject: `Insurance Billing Compliance Complaint - Provider Violations`,
          body_md: `**Subject: Insurance Billing Compliance Complaint - Provider Violations**

Dear Insurance Commissioner,

I am filing a formal complaint regarding billing compliance violations identified in medical bills from [Provider Name].

**Complaint Summary:**
- Complainant: [Your Name]
- Provider: [Provider Name]
- Total Amount: $${lineItems.reduce((sum: number, item: any) => sum + (item.charge || 0), 0).toFixed(2)}
- Violation Date: ${new Date().toLocaleDateString()}

**Violations Identified:**
${findings.filter(f => f.severity === 'high').map(f => `- ${f.detectorName}: ${f.rationale}`).join('\n')}

**Resolution Attempts:**
1. Contacted provider billing department - [Date]
2. Contacted insurance company - [Date]
3. Issues remain unresolved after [X] days

**Relief Requested:**
1. Investigation of provider billing practices
2. Correction of improper billing
3. Enforcement action if violations confirmed

I have attached supporting documentation and request your assistance in resolving these billing compliance issues.

Respectfully submitted,
[Your Name]
[Date]`,
          citations: findings.flatMap(f => f.policyCitations || [])
        }
      },
      phone_scripts: {
        insurer: `Hi, I'm calling about a claim that has billing compliance issues I'd like reviewed.

My member ID is [ID] and the claim is for services on [DATE].

I've had the bill professionally analyzed and several compliance violations were identified:
${findings.slice(0, 3).map(f => `- ${f.detectorName}`).join('\n')}

Can you please escalate this to your compliance review team and provide me with a reference number?

I'll be sending written documentation, but wanted to start the process by phone.

When can I expect a response? And who should I follow up with?

Thank you.`,
        provider: `Hi, I'm calling about billing issues on my recent bill that need to be resolved.

My account number is [NUMBER] and the bill is dated [DATE].

Professional analysis has identified several billing compliance problems:
${findings.slice(0, 3).map(f => `- ${f.detectorName}`).join('\n')}

I need to speak with your billing compliance officer or supervisor about correcting these issues.

Can you please transfer me or provide their direct contact information?

I'll also be sending written documentation, but these are serious compliance concerns that need immediate attention.

Thank you.`,
        state_doi: `Hi, I need to file a complaint about billing compliance violations by a healthcare provider.

The provider is [NAME] and they've violated several billing regulations despite my attempts to resolve this directly.

The violations include:
${findings.filter(f => f.severity === 'high').slice(0, 2).map(f => `- ${f.detectorName}`).join('\n')}

What's the process for filing a formal complaint? Do you have a complaint form I can complete?

How long does the investigation process typically take?

Can you provide me with a complaint reference number?

Thank you for your assistance.`
      }
    }
  }
}

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  status: 'uploading' | 'processing' | 'completed' | 'error'
  progress?: number
  ocrText?: string
  statusMessage?: string
  databaseId?: string // Database ID from successful upload
}

export default function AnalyzerPage() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [description, setDescription] = useState('')
  const [benefits, setBenefits] = useState<BenefitsData>({})
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResults, setAnalysisResults] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [showEmailModal, setShowEmailModal] = useState(false)

  const handleFileUploaded = (file: UploadedFile) => {
    setUploadedFiles(prev => {
      const existingIndex = prev.findIndex(f => f.id === file.id)
      if (existingIndex >= 0) {
        const updated = [...prev]
        updated[existingIndex] = file
        return updated
      }
      return [...prev, file]
    })
  }

  const handleFileRemoved = (fileId: string) => {
    setUploadedFiles(prev => {
      const remaining = prev.filter(f => f.id !== fileId)

      // If all files are removed, clear the session to start fresh next time
      if (remaining.length === 0) {
        setSessionId(null)
        console.log('🧹 All files removed, cleared session ID for fresh start')
      }

      return remaining
    })
  }

  const handleAnalyze = async () => {
    if (uploadedFiles.length === 0) {
      alert('Please upload at least one document before analyzing.')
      return
    }

    const completedFiles = uploadedFiles.filter(f => f.status === 'completed')
    if (completedFiles.length === 0) {
      alert('Please wait for file upload to complete before analyzing.')
      return
    }

    // Open email collection modal instead of running analysis immediately
    setShowEmailModal(true)
    return
  }

  const canAnalyze = uploadedFiles.some(f => f.status === 'completed') && !isAnalyzing && (sessionId || uploadedFiles.some(f => f.databaseId))

  const handleBackToUpload = () => {
    setAnalysisResults(null)
    setError(null)
  }

  if (analysisResults) {
    return (
      <AnalysisResults
        results={analysisResults}
        onBack={handleBackToUpload}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <Link href="/" className="flex items-center space-x-2 text-primary hover:text-primary/80">
              <ArrowLeft className="h-5 w-5" />
              <span>Back to Home</span>
            </Link>
            <div className="flex items-center space-x-2">
              <Heart className="h-6 w-6 text-primary" />
              <span className="text-2xl font-bold text-primary">Wyng</span>
              <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">Lite</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Page Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <FileText className="h-16 w-16 text-primary" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Medical Bill Analyzer
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Upload your medical bills or EOBs to detect errors, billing violations,
            and get phone scripts plus appeal letters for any issues found.
          </p>
        </div>

        <div className="space-y-6">
          {/* Step 1: Upload Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">1</span>
                Upload Your Medical Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FileUpload
                onFileUploaded={handleFileUploaded}
                onFileRemoved={handleFileRemoved}
                uploadedFiles={uploadedFiles}
                disabled={isAnalyzing}
                sessionId={sessionId || undefined}
                onSessionCreated={setSessionId}
              />
            </CardContent>
          </Card>

          {/* Step 2: Describe Your Situation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">2</span>
                Describe Your Situation (Optional)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Label htmlFor="description">
                  Tell us about your bill or specific concerns you have:
                </Label>
                <Textarea
                  id="description"
                  placeholder="e.g., 'I was charged twice for IV fluid during my induced delivery. The anesthesiologist was out-of-network but I wasn't told beforehand.'"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isAnalyzing}
                  rows={4}
                  className="resize-none"
                />
                <p className="text-sm text-gray-500">
                  This helps our AI provide more targeted analysis and specific guidance for your situation.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Insurance Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">3</span>
                Insurance Information (Optional)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BenefitsForm
                benefits={benefits}
                onBenefitsChange={setBenefits}
                disabled={isAnalyzing}
              />
            </CardContent>
          </Card>

          {/* Analysis Button */}
          <div className="text-center">
            <Button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              size="lg"
              className="px-8 py-3 text-lg btn-wyng-gradient"
            >
              <FileText className="h-5 w-5 mr-2" />
              Analyze My Bill
            </Button>
            {uploadedFiles.length === 0 && (
              <p className="text-sm text-gray-500 mt-2">
                Upload at least one document to start the analysis
              </p>
            )}
            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-medium">Analysis Error</span>
                </div>
                <p className="text-red-700 mt-1">{error}</p>
              </div>
            )}
          </div>

          {/* Email Collection Modal */}
          <EmailCollectionModal
            isOpen={showEmailModal}
            onClose={() => setShowEmailModal(false)}
            uploadedFiles={uploadedFiles}
            description={description}
            benefits={benefits}
          />

          {/* Features */}
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            <div className="text-center p-6 bg-white rounded-lg shadow-sm">
              <FileText className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">18 Compliance Detectors</h3>
              <p className="text-sm text-gray-600">
                Detect NSA violations, duplicate charges, preventive care errors, and more
              </p>
            </div>
            <div className="text-center p-6 bg-white rounded-lg shadow-sm">
              <User className="h-12 w-12 text-accent mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Phone Scripts</h3>
              <p className="text-sm text-gray-600">
                Get exact scripts for calling your insurance and healthcare providers
              </p>
            </div>
            <div className="text-center p-6 bg-white rounded-lg shadow-sm">
              <DollarSign className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Appeal Letters</h3>
              <p className="text-sm text-gray-600">
                Receive ready-to-send appeal letters with legal citations
              </p>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="mt-8 p-4 bg-gray-100 rounded-lg text-center">
            <p className="text-sm text-gray-600">
              <strong>Wyng Lite</strong> provides general information and analysis, not legal or medical advice.
              Always verify information with your insurance company and healthcare providers.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}