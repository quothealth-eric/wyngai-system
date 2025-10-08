import {
  FormattedTable,
  FormattedDetectionSummary,
  FormattedDetection,
  TableColumn,
  TableRow,
  TableCell,
  OutputFormatter
} from './types';
import { MoneyCents } from '@/types/common';
import { DetectionResult } from '@/lib/detect/types';

export class TableOutputFormatter implements OutputFormatter {

  public formatLineItems(lineItems: any[], confidence: number): FormattedTable {
    const columns: TableColumn[] = [
      { key: 'serviceDate', label: 'Service Date', type: 'date', align: 'center' },
      { key: 'code', label: 'Procedure Code', type: 'text', align: 'left' },
      { key: 'description', label: 'Description', type: 'text', align: 'left', width: 300 },
      { key: 'units', label: 'Units', type: 'number', align: 'center' },
      { key: 'amount', label: 'Amount', type: 'currency', align: 'right' },
      { key: 'confidence', label: 'OCR Confidence', type: 'number', align: 'center' }
    ];

    const rows: TableRow[] = lineItems.map((item, index) => ({
      id: `line-${index}`,
      cells: {
        serviceDate: {
          value: item.serviceDate,
          displayValue: this.formatDate(item.serviceDate),
          confidence: item.confidence || confidence
        },
        code: {
          value: item.code,
          displayValue: item.code,
          confidence: item.confidence || confidence
        },
        description: {
          value: item.description,
          displayValue: item.description || 'N/A',
          confidence: item.confidence || confidence
        },
        units: {
          value: item.units || 1,
          displayValue: (item.units || 1).toString(),
          confidence: item.confidence || confidence
        },
        amount: {
          value: item.amount,
          formatted: this.formatCurrency(item.amount),
          confidence: item.confidence || confidence
        },
        confidence: {
          value: item.confidence || confidence,
          displayValue: `${Math.round((item.confidence || confidence) * 100)}%`,
          highlight: this.getConfidenceHighlight(item.confidence || confidence)
        }
      },
      highlighted: (item.confidence || confidence) < 0.7
    }));

    const totalCharges = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);

    return {
      title: 'Extracted Line Items',
      subtitle: `${lineItems.length} procedures extracted from document`,
      columns,
      rows,
      summary: {
        totalCharges,
        itemCount: lineItems.length
      },
      metadata: {
        confidence,
        source: 'OCR extraction',
        extractedAt: new Date().toISOString()
      }
    };
  }

  public formatDetections(results: DetectionResult[]): FormattedDetectionSummary {
    const triggeredResults = results.filter(r => r.triggered);

    const highSeverityCount = triggeredResults.filter(r => {
      // Map rule IDs to severity (would be better to get this from engine)
      const highSeverityRules = [
        'DUPLICATES', 'UNBUNDLING', 'UPCODING', 'GENDER_SPECIFIC',
        'EXPERIMENTAL_UNPROVEN', 'MUTUALLY_EXCLUSIVE', 'BALANCE_BILLING',
        'DATE_INCONSISTENCIES'
      ];
      return highSeverityRules.includes(r.ruleId);
    }).length;

    const totalPotentialSavings = triggeredResults.reduce((sum, r) =>
      sum + (r.potentialSavings || 0), 0
    );

    const averageConfidence = triggeredResults.length > 0
      ? triggeredResults.reduce((sum, r) => sum + r.confidence, 0) / triggeredResults.length
      : 0;

    // Group by category
    const categoryMap = new Map<string, { count: number; highestSeverity: string }>();

    triggeredResults.forEach(result => {
      const category = this.getCategoryForRule(result.ruleId);
      const severity = this.getSeverityForRule(result.ruleId);

      if (!categoryMap.has(category)) {
        categoryMap.set(category, { count: 0, highestSeverity: 'LOW' });
      }

      const existing = categoryMap.get(category)!;
      existing.count++;

      if (this.isHigherSeverity(severity, existing.highestSeverity)) {
        existing.highestSeverity = severity;
      }
    });

    const detectionsByCategory = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      count: data.count,
      highestSeverity: data.highestSeverity
    }));

    // Get top detections (highest severity and confidence)
    const topDetections = triggeredResults
      .sort((a, b) => {
        const aSeverity = this.getSeverityWeight(this.getSeverityForRule(a.ruleId));
        const bSeverity = this.getSeverityWeight(this.getSeverityForRule(b.ruleId));

        if (aSeverity !== bSeverity) return bSeverity - aSeverity;
        return b.confidence - a.confidence;
      })
      .slice(0, 10)
      .map(result => this.formatDetection(result));

    return {
      title: 'Detection Results Summary',
      totalRulesRun: results.length,
      triggeredRules: triggeredResults.length,
      highSeverityCount,
      totalPotentialSavings,
      averageConfidence,
      detectionsByCategory,
      topDetections
    };
  }

  public formatProviderInfo(provider: any): FormattedTable {
    const columns: TableColumn[] = [
      { key: 'field', label: 'Field', type: 'text', align: 'left' },
      { key: 'value', label: 'Value', type: 'text', align: 'left' }
    ];

    const providerFields = [
      { field: 'NPI', value: provider.npi || 'Not provided' },
      { field: 'Name', value: provider.name || 'Not provided' },
      { field: 'Specialty', value: provider.specialty || 'Not specified' },
      { field: 'Address', value: this.formatAddress(provider) },
      { field: 'Phone', value: provider.phone || 'Not provided' }
    ];

    const rows: TableRow[] = providerFields.map((item, index) => ({
      id: `provider-${index}`,
      cells: {
        field: {
          value: item.field,
          displayValue: item.field
        },
        value: {
          value: item.value,
          displayValue: item.value,
          highlight: item.value.includes('Not') ? 'warning' : undefined
        }
      },
      highlighted: item.value.includes('Not')
    }));

    return {
      title: 'Provider Information',
      columns,
      rows,
      summary: {
        itemCount: providerFields.length
      }
    };
  }

  public formatFinancialSummary(totals: any): FormattedTable {
    const columns: TableColumn[] = [
      { key: 'category', label: 'Category', type: 'text', align: 'left' },
      { key: 'amount', label: 'Amount', type: 'currency', align: 'right' }
    ];

    const financialItems = [
      { category: 'Total Charges', amount: totals.charges },
      { category: 'Total Adjustments', amount: totals.adjustments },
      { category: 'Total Payments', amount: totals.payments },
      { category: 'Patient Balance', amount: totals.balance }
    ];

    const rows: TableRow[] = financialItems.map((item, index) => ({
      id: `financial-${index}`,
      cells: {
        category: {
          value: item.category,
          displayValue: item.category
        },
        amount: {
          value: item.amount,
          formatted: this.formatCurrency(item.amount),
          highlight: item.category === 'Patient Balance' && item.amount > 0 ? 'warning' : undefined
        }
      },
      highlighted: item.category === 'Patient Balance' && item.amount > 0
    }));

    return {
      title: 'Financial Summary',
      columns,
      rows,
      summary: {
        totalCharges: totals.charges,
        totalAdjustments: totals.adjustments,
        totalPayments: totals.payments,
        patientBalance: totals.balance,
        itemCount: financialItems.length
      }
    };
  }

  private formatDetection(result: DetectionResult): FormattedDetection {
    return {
      ruleId: result.ruleId,
      name: this.getRuleDisplayName(result.ruleId),
      severity: this.getSeverityForRule(result.ruleId),
      confidence: result.confidence,
      message: result.message,
      affectedItems: result.affectedItems,
      potentialSavings: result.potentialSavings,
      recommendedAction: result.recommendedAction,
      evidence: result.evidence,
      citations: result.citations
    };
  }

  private formatCurrency(amount: MoneyCents): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount / 100);
  }

  private formatDate(dateString: string): string {
    if (!dateString) return 'N/A';

    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch {
      return dateString; // Return original if parsing fails
    }
  }

  private formatAddress(provider: any): string {
    const parts = [
      provider.address?.street,
      provider.address?.city,
      provider.address?.state,
      provider.address?.zip
    ].filter(part => part && part.trim());

    return parts.length > 0 ? parts.join(', ') : 'Not provided';
  }

  private getConfidenceHighlight(confidence: number): 'warning' | 'error' | 'success' | undefined {
    if (confidence < 0.5) return 'error';
    if (confidence < 0.7) return 'warning';
    if (confidence >= 0.9) return 'success';
    return undefined;
  }

  private getCategoryForRule(ruleId: string): string {
    const categoryMap: { [key: string]: string } = {
      'DUPLICATES': 'BILLING',
      'UNBUNDLING': 'CODING',
      'MODIFIER_MISUSE': 'CODING',
      'UPCODING': 'CODING',
      'FREQUENCY_LIMITS': 'POLICY',
      'GENDER_SPECIFIC': 'CLINICAL',
      'AGE_INAPPROPRIATE': 'CLINICAL',
      'EXPERIMENTAL_UNPROVEN': 'POLICY',
      'MUTUALLY_EXCLUSIVE': 'CODING',
      'BALANCE_BILLING': 'BILLING',
      'MEDICAL_NECESSITY': 'CLINICAL',
      'INCORRECT_UNITS': 'BILLING',
      'LOCATION_MISMATCH': 'BILLING',
      'TIME_PROXIMITY': 'BILLING',
      'DATE_INCONSISTENCIES': 'BILLING',
      'PRICING_ANOMALIES': 'BILLING',
      'PROVIDER_ANOMALIES': 'CLINICAL',
      'DOCUMENTATION_GAPS': 'BILLING',
      'OUTLIER_PATTERNS': 'BILLING'
    };

    return categoryMap[ruleId] || 'OTHER';
  }

  private getSeverityForRule(ruleId: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    const severityMap: { [key: string]: 'HIGH' | 'MEDIUM' | 'LOW' } = {
      'DUPLICATES': 'HIGH',
      'UNBUNDLING': 'HIGH',
      'MODIFIER_MISUSE': 'MEDIUM',
      'UPCODING': 'HIGH',
      'FREQUENCY_LIMITS': 'MEDIUM',
      'GENDER_SPECIFIC': 'HIGH',
      'AGE_INAPPROPRIATE': 'MEDIUM',
      'EXPERIMENTAL_UNPROVEN': 'HIGH',
      'MUTUALLY_EXCLUSIVE': 'HIGH',
      'BALANCE_BILLING': 'HIGH',
      'MEDICAL_NECESSITY': 'MEDIUM',
      'INCORRECT_UNITS': 'MEDIUM',
      'LOCATION_MISMATCH': 'MEDIUM',
      'TIME_PROXIMITY': 'MEDIUM',
      'DATE_INCONSISTENCIES': 'HIGH',
      'PRICING_ANOMALIES': 'MEDIUM',
      'PROVIDER_ANOMALIES': 'MEDIUM',
      'DOCUMENTATION_GAPS': 'MEDIUM',
      'OUTLIER_PATTERNS': 'LOW'
    };

    return severityMap[ruleId] || 'LOW';
  }

  private getRuleDisplayName(ruleId: string): string {
    const nameMap: { [key: string]: string } = {
      'DUPLICATES': 'Duplicate Charges',
      'UNBUNDLING': 'Unbundling Violations',
      'MODIFIER_MISUSE': 'Modifier Misuse',
      'UPCODING': 'Upcoding',
      'FREQUENCY_LIMITS': 'Frequency Limit Violations',
      'GENDER_SPECIFIC': 'Gender-Specific Procedures',
      'AGE_INAPPROPRIATE': 'Age-Inappropriate Procedures',
      'EXPERIMENTAL_UNPROVEN': 'Experimental/Unproven Procedures',
      'MUTUALLY_EXCLUSIVE': 'Mutually Exclusive Procedures',
      'BALANCE_BILLING': 'Balance Billing Violations',
      'MEDICAL_NECESSITY': 'Medical Necessity Concerns',
      'INCORRECT_UNITS': 'Incorrect Units',
      'LOCATION_MISMATCH': 'Location/Procedure Mismatch',
      'TIME_PROXIMITY': 'Time Proximity Issues',
      'DATE_INCONSISTENCIES': 'Date Inconsistencies',
      'PRICING_ANOMALIES': 'Pricing Anomalies',
      'PROVIDER_ANOMALIES': 'Provider Anomalies',
      'DOCUMENTATION_GAPS': 'Documentation Gaps',
      'OUTLIER_PATTERNS': 'Statistical Outlier Patterns'
    };

    return nameMap[ruleId] || ruleId;
  }

  private getSeverityWeight(severity: string): number {
    const weights = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
    return weights[severity as keyof typeof weights] || 1;
  }

  private isHigherSeverity(newSeverity: string, currentSeverity: string): boolean {
    return this.getSeverityWeight(newSeverity) > this.getSeverityWeight(currentSeverity);
  }
}