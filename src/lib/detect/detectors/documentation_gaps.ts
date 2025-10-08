import { DetectionResult, DetectionContext } from '../types';

export class DocumentationGapsDetector {
  static readonly RULE_ID = 'DOCUMENTATION_GAPS';

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const documentationIssues = this.findDocumentationGaps(context);
    const triggered = documentationIssues.length > 0;

    if (!triggered) {
      return {
        ruleId: DocumentationGapsDetector.RULE_ID,
        triggered: false,
        confidence: 0.80,
        message: 'No significant documentation gaps detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    return {
      ruleId: DocumentationGapsDetector.RULE_ID,
      triggered: true,
      confidence: 0.75,
      message: `Found ${documentationIssues.length} documentation gaps or inconsistencies`,
      affectedItems: documentationIssues.map(issue => issue.field),
      recommendedAction: 'Verify supporting documentation is complete and accurate',
      citations: [{
        title: 'Medicare Program Integrity Manual',
        authority: 'CMS',
        citation: 'Chapter 3 - Documentation requirements for medical services'
      }],
      evidence: documentationIssues.map(issue => ({
        field: issue.field,
        value: issue.description,
        location: issue.context
      }))
    };
  }

  private findDocumentationGaps(context: DetectionContext): Array<{
    field: string;
    description: string;
    context: string;
    severity: 'high' | 'medium' | 'low';
  }> {
    const issues: Array<{
      field: string;
      description: string;
      context: string;
      severity: 'high' | 'medium' | 'low';
    }> = [];

    // Check for missing required fields
    if (!context.patient.id) {
      issues.push({
        field: 'patientId',
        description: 'Missing patient identifier',
        context: 'Patient information',
        severity: 'high'
      });
    }

    if (!context.dates.serviceDate) {
      issues.push({
        field: 'serviceDate',
        description: 'Missing service date',
        context: 'Service information',
        severity: 'high'
      });
    }

    // Check for incomplete line item information
    context.lineItems.forEach((item, index) => {
      if (!item.code) {
        issues.push({
          field: 'procedureCode',
          description: `Line item ${index + 1} missing procedure code`,
          context: `Line item ${index + 1}`,
          severity: 'high'
        });
      }

      if (!item.description) {
        issues.push({
          field: 'description',
          description: `Line item ${index + 1} missing description`,
          context: `Procedure ${item.code}`,
          severity: 'medium'
        });
      }

      if (!item.charge || item.charge <= 0) {
        issues.push({
          field: 'amount',
          description: `Line item ${index + 1} has invalid amount`,
          context: `Procedure ${item.code}`,
          severity: 'high'
        });
      }
    });

    // Check for inconsistent totals
    const calculatedCharges = context.lineItems.reduce((sum, item) => sum + (item.charge || 0), 0);
    if (Math.abs(calculatedCharges - context.totals.charges) > 100) {
      issues.push({
        field: 'totals',
        description: `Line items total ($${(calculatedCharges / 100).toFixed(2)}) doesn't match document total ($${(context.totals.charges / 100).toFixed(2)})`,
        context: 'Financial totals',
        severity: 'medium'
      });
    }

    // Check for suspiciously low confidence in OCR extraction
    if (context.metadata.confidence < 0.5) {
      issues.push({
        field: 'ocrConfidence',
        description: `Low OCR confidence (${(context.metadata.confidence * 100).toFixed(1)}%) may indicate data quality issues`,
        context: 'Document extraction',
        severity: 'low'
      });
    }

    return issues;
  }
}