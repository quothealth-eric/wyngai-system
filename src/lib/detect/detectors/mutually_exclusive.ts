import { DetectionResult, DetectionContext } from '../types';
import { MoneyCents } from '@/types/common';

export class MutuallyExclusiveDetector {
  static readonly RULE_ID = 'MUTUALLY_EXCLUSIVE';

  // Mutually exclusive procedure combinations
  private readonly exclusivityRules = new Map<string, {
    excludes: string[];
    reason: string;
    category: 'NCCI' | 'LOGICAL' | 'ANATOMICAL' | 'TEMPORAL';
    severity: 'high' | 'medium' | 'low';
  }>([
    // NCCI Column 1/Column 2 edits (simplified subset)
    ['45378', { // Colonoscopy
      excludes: ['45330', '45331', '45333', '45334', '45335'], // Sigmoidoscopy variants
      reason: 'Colonoscopy includes sigmoidoscopy',
      category: 'NCCI',
      severity: 'high'
    }],
    ['93000', { // EKG with interpretation and report
      excludes: ['93005', '93010'], // EKG components
      reason: 'Complete EKG service includes component billing',
      category: 'NCCI',
      severity: 'high'
    }],
    ['76700', { // Abdominal ultrasound complete
      excludes: ['76705'], // Abdominal ultrasound limited
      reason: 'Complete study includes limited study',
      category: 'NCCI',
      severity: 'high'
    }],

    // Anatomically mutually exclusive
    ['27447', { // Total knee arthroplasty
      excludes: ['27446', '27445'], // Partial knee procedures
      reason: 'Cannot perform total and partial knee replacement simultaneously',
      category: 'ANATOMICAL',
      severity: 'high'
    }],
    ['27130', { // Total hip arthroplasty
      excludes: ['27125', '27120'], // Partial hip procedures
      reason: 'Cannot perform total and partial hip replacement simultaneously',
      category: 'ANATOMICAL',
      severity: 'high'
    }],
    ['66984', { // Extracapsular cataract extraction
      excludes: ['66982', '66983'], // Other cataract extraction methods
      reason: 'Multiple cataract extraction methods cannot be performed simultaneously',
      category: 'ANATOMICAL',
      severity: 'high'
    }],

    // Bilateral procedure conflicts
    ['69436', { // Tympanoplasty with mastoidectomy
      excludes: ['69635', '69636'], // Different approach to same procedure
      reason: 'Different surgical approaches are mutually exclusive',
      category: 'ANATOMICAL',
      severity: 'high'
    }],

    // Delivery methods (mutually exclusive)
    ['59400', { // Vaginal delivery
      excludes: ['59510', '59514', '59515'], // Cesarean delivery codes
      reason: 'Cannot perform both vaginal and cesarean delivery',
      category: 'LOGICAL',
      severity: 'high'
    }],
    ['59510', { // Cesarean delivery
      excludes: ['59400', '59409', '59410'], // Vaginal delivery codes
      reason: 'Cannot perform both cesarean and vaginal delivery',
      category: 'LOGICAL',
      severity: 'high'
    }],

    // Imaging with/without contrast conflicts
    ['74177', { // CT abdomen/pelvis with contrast
      excludes: ['74176', '74178'], // Without contrast or different timing
      reason: 'Cannot bill multiple contrast variations for same study',
      category: 'LOGICAL',
      severity: 'medium'
    }],
    ['72148', { // MRI lumbar spine without contrast
      excludes: ['72149', '72158'], // With contrast variants
      reason: 'Cannot bill multiple contrast variations for same study',
      category: 'LOGICAL',
      severity: 'medium'
    }],

    // Professional vs Technical component
    ['93306', { // Echo complete
      excludes: ['93306-26', '93306-TC'], // Professional and technical components
      reason: 'Global service cannot be billed with component billing',
      category: 'LOGICAL',
      severity: 'high'
    }],

    // Office visit levels (same date)
    ['99213', { // Level 3 office visit
      excludes: ['99211', '99212', '99214', '99215'], // Other office visit levels
      reason: 'Cannot bill multiple office visit levels on same date',
      category: 'TEMPORAL',
      severity: 'high'
    }],
    ['99214', { // Level 4 office visit
      excludes: ['99211', '99212', '99213', '99215'], // Other office visit levels
      reason: 'Cannot bill multiple office visit levels on same date',
      category: 'TEMPORAL',
      severity: 'high'
    }],

    // Consultation vs office visit
    ['99243', { // Level 3 consultation
      excludes: ['99213', '99214'], // Office visits
      reason: 'Cannot bill consultation and office visit on same date',
      category: 'TEMPORAL',
      severity: 'medium'
    }],

    // Anesthesia conflicts
    ['00100', { // Anesthesia for procedures on salivary glands
      excludes: ['99100'], // Qualifying circumstances
      reason: 'Base anesthesia unit includes standard care',
      category: 'NCCI',
      severity: 'low'
    }],

    // Surgery package conflicts
    ['10060', { // Incision and drainage of abscess
      excludes: ['11042', '11043'], // Debridement codes (when part of same procedure)
      reason: 'Surgical package includes related procedures',
      category: 'NCCI',
      severity: 'medium'
    }],

    // Laboratory conflicts
    ['80053', { // Comprehensive metabolic panel
      excludes: ['80048', '84460', '84450'], // Basic metabolic panel and liver function components
      reason: 'Comprehensive panel includes basic panel components',
      category: 'NCCI',
      severity: 'high'
    }],
    ['85025', { // Complete blood count with differential
      excludes: ['85027', '85004'], // CBC components
      reason: 'Complete CBC includes component testing',
      category: 'NCCI',
      severity: 'high'
    }],

    // Injection procedures
    ['20610', { // Arthrocentesis/injection major joint
      excludes: ['96372', '96373'], // Therapeutic injections (when same injection)
      reason: 'Joint injection includes injection administration',
      category: 'NCCI',
      severity: 'medium'
    }],

    // Surgical approach conflicts
    ['44970', { // Laparoscopic appendectomy
      excludes: ['44960'], // Open appendectomy
      reason: 'Cannot perform both open and laparoscopic approach',
      category: 'ANATOMICAL',
      severity: 'high'
    }],
    ['47562', { // Laparoscopic cholecystectomy
      excludes: ['47600', '47605'], // Open cholecystectomy
      reason: 'Cannot perform both open and laparoscopic approach',
      category: 'ANATOMICAL',
      severity: 'high'
    }]
  ]);

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const exclusivityViolations = this.findMutuallyExclusiveViolations(context.lineItems);
    const triggered = exclusivityViolations.length > 0;

    if (!triggered) {
      return {
        ruleId: MutuallyExclusiveDetector.RULE_ID,
        triggered: false,
        confidence: 0.91,
        message: 'No mutually exclusive procedures detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    const totalDuplicateAmount = exclusivityViolations.reduce((sum, violation) =>
      sum + violation.inappropriateAmount, 0
    );

    const affectedItems = exclusivityViolations.flatMap(violation =>
      [violation.primaryCode, ...violation.excludedCodes]
    );

    return {
      ruleId: MutuallyExclusiveDetector.RULE_ID,
      triggered: true,
      confidence: 0.87,
      message: `Found ${exclusivityViolations.length} mutually exclusive procedure combinations`,
      affectedItems,
      recommendedAction: 'Review procedure combinations for mutual exclusivity - one should be removed',
      potentialSavings: totalDuplicateAmount,
      citations: [{
        title: 'National Correct Coding Initiative (NCCI)',
        authority: 'CMS',
        citation: 'NCCI Procedure-to-Procedure (PTP) edits prevent inappropriate code combinations'
      }, {
        title: 'Medicare Claims Processing Manual',
        authority: 'CMS',
        citation: 'Chapter 23 - Correct coding and billing practices'
      }],
      evidence: exclusivityViolations.map(violation => ({
        field: 'procedureCombination',
        value: `${violation.primaryCode} conflicts with ${violation.excludedCodes.join(', ')}: ${violation.reason}`,
        location: `Service Date: ${violation.serviceDate}`
      }))
    };
  }

  private findMutuallyExclusiveViolations(lineItems: any[]): Array<{
    primaryCode: string;
    excludedCodes: string[];
    serviceDate: string;
    reason: string;
    category: string;
    inappropriateAmount: MoneyCents;
  }> {
    const violations: Array<{
      primaryCode: string;
      excludedCodes: string[];
      serviceDate: string;
      reason: string;
      category: string;
      inappropriateAmount: MoneyCents;
    }> = [];

    // Group items by service date for same-day analysis
    const itemsByDate = new Map<string, any[]>();
    lineItems.forEach(item => {
      const date = item.serviceDate || 'unknown';
      if (!itemsByDate.has(date)) {
        itemsByDate.set(date, []);
      }
      itemsByDate.get(date)!.push(item);
    });

    // Check each service date for mutually exclusive procedures
    itemsByDate.forEach((items, serviceDate) => {
      const codesOnDate = new Set(items.map(item => this.getBaseCode(item.code)));

      // Check each rule against the codes present
      this.exclusivityRules.forEach((rule, primaryCode) => {
        if (codesOnDate.has(primaryCode)) {
          const conflictingCodes = rule.excludes.filter(excludedCode =>
            codesOnDate.has(excludedCode)
          );

          if (conflictingCodes.length > 0) {
            // Calculate inappropriate amount (typically the lower-value procedure)
            const primaryItem = items.find(item => this.getBaseCode(item.code) === primaryCode);
            const conflictingItems = items.filter(item =>
              conflictingCodes.includes(this.getBaseCode(item.code))
            );

            const inappropriateAmount = this.calculateInappropriateAmount(
              primaryItem,
              conflictingItems,
              rule.category
            );

            violations.push({
              primaryCode,
              excludedCodes: conflictingCodes,
              serviceDate,
              reason: rule.reason,
              category: rule.category,
              inappropriateAmount
            });
          }
        }
      });

      // Additional checks for common exclusivity patterns
      this.checkCommonExclusivityPatterns(items, serviceDate, violations);
    });

    return violations;
  }

  private checkCommonExclusivityPatterns(
    items: any[],
    serviceDate: string,
    violations: Array<{
      primaryCode: string;
      excludedCodes: string[];
      serviceDate: string;
      reason: string;
      category: string;
      inappropriateAmount: MoneyCents;
    }>
  ): void {
    const codes = items.map(item => this.getBaseCode(item.code));

    // Check for multiple E&M codes on same date
    const emCodes = codes.filter(code => this.isEMCode(code));
    if (emCodes.length > 1) {
      const emItems = items.filter(item => this.isEMCode(this.getBaseCode(item.code)));
      const inappropriateAmount = emItems.slice(1).reduce((sum, item) => sum + item.charge, 0);

      violations.push({
        primaryCode: emCodes[0],
        excludedCodes: emCodes.slice(1),
        serviceDate,
        reason: 'Multiple E&M services on same date without appropriate modifiers',
        category: 'TEMPORAL',
        inappropriateAmount
      });
    }

    // Check for bilateral procedure conflicts
    const bilateralConflicts = this.checkBilateralConflicts(items);
    violations.push(...bilateralConflicts.map(conflict => ({
      ...conflict,
      serviceDate
    })));

    // Check for contrast imaging conflicts
    const contrastConflicts = this.checkContrastConflicts(items);
    violations.push(...contrastConflicts.map(conflict => ({
      ...conflict,
      serviceDate
    })));
  }

  private checkBilateralConflicts(items: any[]): Array<{
    primaryCode: string;
    excludedCodes: string[];
    reason: string;
    category: string;
    inappropriateAmount: MoneyCents;
  }> {
    const conflicts: Array<{
      primaryCode: string;
      excludedCodes: string[];
      reason: string;
      category: string;
      inappropriateAmount: MoneyCents;
    }> = [];

    // Look for bilateral modifiers (50, LT, RT) with conflicting unilateral codes
    const bilateralItems = items.filter(item => {
      const modifiers = this.extractModifiers(item.code);
      return modifiers.includes('50') || modifiers.includes('LT') || modifiers.includes('RT');
    });

    if (bilateralItems.length > 1) {
      const baseCode = this.getBaseCode(bilateralItems[0].code);
      const sameBaseCodes = bilateralItems.filter(item =>
        this.getBaseCode(item.code) === baseCode
      );

      if (sameBaseCodes.length > 1) {
        const inappropriateAmount = sameBaseCodes.slice(1).reduce((sum, item) => sum + item.charge, 0);

        conflicts.push({
          primaryCode: bilateralItems[0].code,
          excludedCodes: sameBaseCodes.slice(1).map(item => item.code),
          reason: 'Bilateral procedure billed multiple times or with conflicting laterality',
          category: 'ANATOMICAL',
          inappropriateAmount
        });
      }
    }

    return conflicts;
  }

  private checkContrastConflicts(items: any[]): Array<{
    primaryCode: string;
    excludedCodes: string[];
    reason: string;
    category: string;
    inappropriateAmount: MoneyCents;
  }> {
    const conflicts: Array<{
      primaryCode: string;
      excludedCodes: string[];
      reason: string;
      category: string;
      inappropriateAmount: MoneyCents;
    }> = [];

    // Group by base imaging code to check for contrast conflicts
    const imagingGroups = new Map<string, any[]>();

    items.forEach(item => {
      const baseCode = this.getBaseCode(item.code);
      if (this.isImagingCode(baseCode)) {
        if (!imagingGroups.has(baseCode)) {
          imagingGroups.set(baseCode, []);
        }
        imagingGroups.get(baseCode)!.push(item);
      }
    });

    imagingGroups.forEach((groupItems, baseCode) => {
      if (groupItems.length > 1) {
        // Multiple imaging codes of same type - potential contrast conflict
        const inappropriateAmount = groupItems.slice(1).reduce((sum, item) => sum + item.charge, 0);

        conflicts.push({
          primaryCode: groupItems[0].code,
          excludedCodes: groupItems.slice(1).map(item => item.code),
          reason: 'Multiple imaging studies of same type may represent contrast billing conflict',
          category: 'LOGICAL',
          inappropriateAmount
        });
      }
    });

    return conflicts;
  }

  private calculateInappropriateAmount(
    primaryItem: any,
    conflictingItems: any[],
    category: string
  ): MoneyCents {
    if (!primaryItem || conflictingItems.length === 0) return 0;

    // For NCCI edits, typically the column 2 code (component) should be removed
    // For other conflicts, remove the lower-value procedure

    let inappropriateAmount = 0;

    if (category === 'NCCI') {
      // Remove all conflicting (component) procedures
      inappropriateAmount = conflictingItems.reduce((sum, item) => sum + item.charge, 0);
    } else if (category === 'ANATOMICAL' || category === 'LOGICAL') {
      // Remove all but the highest-value procedure
      const allItems = [primaryItem, ...conflictingItems];
      allItems.sort((a, b) => b.amount - a.amount);
      inappropriateAmount = allItems.slice(1).reduce((sum, item) => sum + item.charge, 0);
    } else if (category === 'TEMPORAL') {
      // For temporal conflicts, typically remove duplicate services
      inappropriateAmount = conflictingItems.reduce((sum, item) => sum + item.charge, 0);
    }

    return inappropriateAmount;
  }

  private getBaseCode(code: string): string {
    return code.split('-')[0]; // Remove modifiers
  }

  private extractModifiers(code: string): string[] {
    const parts = code.split('-');
    return parts.slice(1); // Everything after the first dash is a modifier
  }

  private isEMCode(code: string): boolean {
    const codeNum = parseInt(code);
    return (codeNum >= 99201 && codeNum <= 99215) || // Office visits
           (codeNum >= 99241 && codeNum <= 99245) || // Consultations
           (codeNum >= 99221 && codeNum <= 99233) || // Hospital care
           (codeNum >= 99281 && codeNum <= 99285);   // Emergency department
  }

  private isImagingCode(code: string): boolean {
    const codeNum = parseInt(code);
    return (codeNum >= 70000 && codeNum <= 79999); // Radiology codes
  }
}