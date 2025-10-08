import { DetectionResult, DetectionContext } from '../types';
import { MoneyCents } from '@/types/common';

export class ModifierMisuseDetector {
  static readonly RULE_ID = 'MODIFIER_MISUSE';

  // Common modifier patterns and their requirements
  private readonly modifierRules = new Map<string, {
    description: string;
    requiredWith?: string[];
    prohibitedWith?: string[];
    requiresDocumentation: string[];
    paymentImpact?: number; // Percentage change in payment
  }>([
    ['25', {
      description: 'Significant, separately identifiable E&M service',
      requiredWith: ['99000'], // Must be with procedure codes
      requiresDocumentation: ['separate diagnosis', 'distinct service'],
      paymentImpact: 100 // Full E&M payment
    }],
    ['26', {
      description: 'Professional component',
      prohibitedWith: ['TC'], // Cannot be with technical component
      requiresDocumentation: ['professional interpretation'],
      paymentImpact: 40 // Typical professional component percentage
    }],
    ['TC', {
      description: 'Technical component',
      prohibitedWith: ['26'], // Cannot be with professional component
      requiresDocumentation: ['equipment and technical staff'],
      paymentImpact: 60 // Typical technical component percentage
    }],
    ['51', {
      description: 'Multiple procedures',
      requiresDocumentation: ['multiple distinct procedures'],
      paymentImpact: 50 // Second procedure typically 50%
    }],
    ['59', {
      description: 'Distinct procedural service',
      requiresDocumentation: ['separate session', 'different site', 'separate incision'],
      paymentImpact: 100
    }],
    ['62', {
      description: 'Two surgeons',
      requiresDocumentation: ['co-surgeon documentation', 'both surgeon notes'],
      paymentImpact: 125 // Additional payment for second surgeon
    }],
    ['76', {
      description: 'Repeat procedure by same physician',
      requiresDocumentation: ['medical necessity for repeat'],
      paymentImpact: 100
    }],
    ['77', {
      description: 'Repeat procedure by different physician',
      requiresDocumentation: ['different physician', 'medical necessity'],
      paymentImpact: 100
    }],
    ['91', {
      description: 'Repeat clinical diagnostic laboratory test',
      requiresDocumentation: ['clinical reason for repeat'],
      paymentImpact: 100
    }]
  ]);

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const modifierViolations = this.findModifierViolations(context.lineItems);
    const triggered = modifierViolations.length > 0;

    if (!triggered) {
      return {
        ruleId: ModifierMisuseDetector.RULE_ID,
        triggered: false,
        confidence: 0.82,
        message: 'No modifier misuse detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    const totalImpactAmount = modifierViolations.reduce((sum, violation) =>
      sum + (violation.inappropriatePayment || 0), 0
    );

    const affectedItems = modifierViolations.map(violation =>
      `${violation.code}${violation.modifier ? '-' + violation.modifier : ''}`
    );

    return {
      ruleId: ModifierMisuseDetector.RULE_ID,
      triggered: true,
      confidence: 0.78,
      message: `Found ${modifierViolations.length} potential modifier misuse issues`,
      affectedItems,
      recommendedAction: 'Review modifier usage and supporting documentation with provider',
      potentialSavings: totalImpactAmount,
      citations: [{
        title: 'CPT Professional Edition - Modifier Guidelines',
        authority: 'Federal',
        citation: 'CPT Appendix A - Modifier definitions and usage guidelines'
      }, {
        title: 'Medicare Claims Processing Manual',
        authority: 'CMS',
        citation: 'Chapter 23 - Fee Schedule Administration and Coding Requirements'
      }],
      evidence: modifierViolations.map(violation => ({
        field: 'modifier',
        value: `${violation.code}-${violation.modifier}: ${violation.issue}`,
        location: `Service Date: ${violation.serviceDate}`
      }))
    };
  }

  private findModifierViolations(lineItems: any[]): Array<{
    code: string;
    modifier?: string;
    serviceDate: string;
    issue: string;
    inappropriatePayment?: MoneyCents;
  }> {
    const violations: Array<{
      code: string;
      modifier?: string;
      serviceDate: string;
      issue: string;
      inappropriatePayment?: MoneyCents;
    }> = [];

    // Group items by service date for cross-reference analysis
    const itemsByDate = new Map<string, any[]>();
    lineItems.forEach(item => {
      const date = item.serviceDate || 'unknown';
      if (!itemsByDate.has(date)) {
        itemsByDate.set(date, []);
      }
      itemsByDate.get(date)!.push(item);
    });

    lineItems.forEach(item => {
      const modifiers = this.extractModifiers(item.code);
      const baseCode = this.getBaseCode(item.code);
      const itemsOnSameDate = itemsByDate.get(item.serviceDate || 'unknown') || [];

      modifiers.forEach(modifier => {
        const rule = this.modifierRules.get(modifier);
        if (!rule) return;

        // Check modifier 25 (Significant E&M with procedure)
        if (modifier === '25') {
          const hasEMCode = this.isEMCode(baseCode);
          const hasProcedureOnSameDate = itemsOnSameDate.some(otherItem =>
            otherItem !== item && this.isProcedureCode(this.getBaseCode(otherItem.code))
          );

          if (hasEMCode && !hasProcedureOnSameDate) {
            violations.push({
              code: item.code,
              modifier,
              serviceDate: item.serviceDate,
              issue: 'Modifier 25 used without corresponding procedure code',
              inappropriatePayment: item.charge
            });
          }
        }

        // Check modifier 26/TC conflicts
        if (modifier === '26' || modifier === 'TC') {
          const hasConflict = modifiers.includes(modifier === '26' ? 'TC' : '26');
          if (hasConflict) {
            violations.push({
              code: item.code,
              modifier,
              serviceDate: item.serviceDate,
              issue: 'Cannot bill both professional (26) and technical (TC) components',
              inappropriatePayment: Math.floor(item.charge * 0.5) // Estimate overpayment
            });
          }
        }

        // Check modifier 51 (Multiple procedures)
        if (modifier === '51') {
          const otherProcedures = itemsOnSameDate.filter(otherItem =>
            otherItem !== item && this.isProcedureCode(this.getBaseCode(otherItem.code))
          );

          if (otherProcedures.length === 0) {
            violations.push({
              code: item.code,
              modifier,
              serviceDate: item.serviceDate,
              issue: 'Modifier 51 used without multiple procedures on same date',
              inappropriatePayment: Math.floor(item.charge * 0.5) // Typical second procedure reduction
            });
          }
        }

        // Check modifier 59 (Distinct procedural service)
        if (modifier === '59') {
          const similarProcedures = itemsOnSameDate.filter(otherItem =>
            otherItem !== item && this.areSimilarProcedures(baseCode, this.getBaseCode(otherItem.code))
          );

          if (similarProcedures.length === 0) {
            violations.push({
              code: item.code,
              modifier,
              serviceDate: item.serviceDate,
              issue: 'Modifier 59 used without similar/related procedures requiring distinction'
            });
          }
        }

        // Check modifier 76/77 (Repeat procedures)
        if (modifier === '76' || modifier === '77') {
          const repeatProcedures = itemsOnSameDate.filter(otherItem =>
            otherItem !== item && this.getBaseCode(otherItem.code) === baseCode
          );

          if (repeatProcedures.length === 0) {
            violations.push({
              code: item.code,
              modifier,
              serviceDate: item.serviceDate,
              issue: `Modifier ${modifier} used without repeat of same procedure on same date`
            });
          }
        }

        // Check for inappropriate payment adjustments
        if (rule.paymentImpact && rule.paymentImpact !== 100) {
          // This is a complex calculation that would need baseline pricing
          // For now, flag for review
          const isPaymentAppropriate = this.validatePaymentAdjustment(
            item.charge,
            rule.paymentImpact
          );

          if (!isPaymentAppropriate) {
            violations.push({
              code: item.code,
              modifier,
              serviceDate: item.serviceDate,
              issue: `Payment amount may not reflect correct modifier ${modifier} adjustment`
            });
          }
        }
      });
    });

    return violations;
  }

  private extractModifiers(code: string): string[] {
    // Extract modifiers from procedure code (assuming format like "99213-25" or "99213-25-59")
    const parts = code.split('-');
    return parts.slice(1); // Everything after the first dash is a modifier
  }

  private getBaseCode(code: string): string {
    // Get base code without modifiers
    return code.split('-')[0];
  }

  private isEMCode(code: string): boolean {
    // Evaluation and Management codes
    const emRanges = [
      { start: 99201, end: 99215 }, // Office visits
      { start: 99221, end: 99239 }, // Hospital visits
      { start: 99281, end: 99288 }, // Emergency department
      { start: 99341, end: 99350 }  // Home visits
    ];

    const codeNum = parseInt(code);
    return emRanges.some(range => codeNum >= range.start && codeNum <= range.end);
  }

  private isProcedureCode(code: string): boolean {
    // Surgery, radiology, pathology, etc. (non-E&M codes)
    const codeNum = parseInt(code);

    // Surgery codes
    if (codeNum >= 10000 && codeNum <= 69999) return true;

    // Radiology codes
    if (codeNum >= 70000 && codeNum <= 79999) return true;

    // Pathology codes
    if (codeNum >= 80000 && codeNum <= 89999) return true;

    // Medicine codes
    if (codeNum >= 90000 && codeNum <= 99999 && !this.isEMCode(code)) return true;

    return false;
  }

  private areSimilarProcedures(code1: string, code2: string): boolean {
    const num1 = parseInt(code1);
    const num2 = parseInt(code2);

    // Consider codes similar if they're within the same range (same first 3 digits)
    return Math.floor(num1 / 100) === Math.floor(num2 / 100);
  }

  private validatePaymentAdjustment(amount: MoneyCents, expectedPercentage: number): boolean {
    // This would need access to fee schedule data to properly validate
    // For now, just check if amount seems reasonable for the modifier

    // Very basic validation - amounts under $5 or over $10,000 are suspicious
    if (amount < 500 || amount > 1000000) {
      return false;
    }

    // Would need more sophisticated validation with fee schedule data
    return true;
  }
}