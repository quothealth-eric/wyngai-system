import { DetectionResult, DetectionContext } from '../types';

export class AgeInappropriateDetector {
  static readonly RULE_ID = 'AGE_INAPPROPRIATE';

  // Age-specific procedure guidelines
  private readonly ageRestrictions = new Map<string, {
    minAge?: number;
    maxAge?: number;
    preferredAgeRange?: { min: number; max: number };
    description: string;
    exceptions?: string[];
  }>([
    // Pediatric-specific codes
    ['90460', { maxAge: 18, description: 'Pediatric immunization administration' }],
    ['90461', { maxAge: 18, description: 'Pediatric immunization (each additional)' }],
    ['96110', { maxAge: 18, description: 'Developmental screening' }],
    ['96111', { maxAge: 18, description: 'Developmental testing' }],

    // Adult preventive care
    ['G0121', { minAge: 50, maxAge: 75, description: 'Colorectal cancer screening', exceptions: ['high risk'] }],
    ['77067', { minAge: 40, maxAge: 74, description: 'Screening mammography' }],
    ['G0103', { minAge: 50, description: 'PSA screening' }],
    ['82270', { minAge: 45, maxAge: 75, description: 'Fecal occult blood test' }],

    // Geriatric considerations
    ['99401', { preferredAgeRange: { min: 18, max: 65 }, description: 'Preventive counseling - consider age appropriateness' }],
    ['90658', { minAge: 65, description: 'Influenza vaccine (high-dose for seniors)' }],
    ['90736', { minAge: 60, description: 'Zoster vaccine' }],

    // Age-sensitive procedures
    ['27447', { minAge: 50, description: 'Knee replacement - typically older adults', exceptions: ['trauma', 'arthritis'] }],
    ['27130', { minAge: 50, description: 'Hip replacement - typically older adults', exceptions: ['trauma', 'arthritis'] }],
    ['66984', { minAge: 55, description: 'Cataract surgery - typically older adults' }],

    // Reproductive health
    ['58150', { minAge: 18, maxAge: 55, description: 'Hysterectomy - reproductive age considerations' }],
    ['58661', { minAge: 18, maxAge: 45, description: 'Tubal ligation - reproductive age' }],
    ['59400', { minAge: 12, maxAge: 50, description: 'Vaginal delivery - reproductive age' }],
    ['59510', { minAge: 12, maxAge: 50, description: 'Cesarean delivery - reproductive age' }],

    // Prostate-related (age considerations)
    ['55700', { minAge: 40, description: 'Prostate biopsy - typically middle-aged and older men' }],
    ['55845', { minAge: 50, description: 'Prostatectomy - typically older men' }],

    // Cardiac procedures (age considerations)
    ['33533', { minAge: 40, description: 'Coronary bypass - typically middle-aged and older' }],
    ['92928', { minAge: 30, description: 'Cardiac catheterization - age considerations' }],

    // Osteoporosis screening
    ['77080', { minAge: 65, description: 'DEXA scan - post-menopausal women and older men' }],
    ['77081', { minAge: 65, description: 'DEXA scan peripheral - elderly screening' }],

    // Mental health (age considerations)
    ['90834', { minAge: 6, description: 'Psychotherapy - age-appropriate therapy' }],
    ['90837', { minAge: 12, description: 'Extended psychotherapy - typically adolescents and adults' }],

    // Vision screening
    ['92002', { preferredAgeRange: { min: 40, max: 80 }, description: 'Eye exam - regular screening for adults' }],
    ['92004', { preferredAgeRange: { min: 40, max: 80 }, description: 'Comprehensive eye exam' }],

    // Hearing screening
    ['92557', { minAge: 65, description: 'Audiometry - elderly hearing screening' }],

    // Skin cancer screening
    ['11100', { minAge: 18, description: 'Skin biopsy - adult skin cancer screening' }],
    ['11101', { minAge: 18, description: 'Additional skin biopsy' }],

    // Sleep studies
    ['95810', { minAge: 18, maxAge: 80, description: 'Sleep study - adult sleep disorders' }],
    ['95811', { minAge: 18, maxAge: 80, description: 'Sleep study with CPAP' }]
  ]);

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    // Note: In a real implementation, you would need patient age from context
    // For this demo, we'll flag age-sensitive procedures for manual review
    // and look for obvious age-inappropriate patterns

    const ageIssues = this.findAgeInappropriateIssues(context.lineItems);
    const triggered = ageIssues.length > 0;

    if (!triggered) {
      return {
        ruleId: AgeInappropriateDetector.RULE_ID,
        triggered: false,
        confidence: 0.85,
        message: 'No age-inappropriate procedures detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    return {
      ruleId: AgeInappropriateDetector.RULE_ID,
      triggered: true,
      confidence: 0.80,
      message: `Found ${ageIssues.length} age-sensitive procedures requiring verification`,
      affectedItems: ageIssues.map(issue => issue.code),
      recommendedAction: 'Verify patient age is appropriate for billed procedures',
      citations: [{
        title: 'Medicare Coverage Guidelines',
        authority: 'CMS',
        citation: 'Age-specific coverage criteria for preventive services'
      }, {
        title: 'USPSTF Recommendations',
        authority: 'Federal',
        citation: 'Age-based screening and prevention guidelines'
      }],
      evidence: ageIssues.map(issue => ({
        field: 'procedureCode',
        value: `${issue.code}: ${issue.description} - ${issue.ageIssue}`,
        location: `Service Date: ${issue.serviceDate}`
      }))
    };
  }

  private findAgeInappropriateIssues(lineItems: any[]): Array<{
    code: string;
    serviceDate: string;
    description: string;
    ageIssue: string;
    severity: 'high' | 'medium' | 'low';
  }> {
    const issues: Array<{
      code: string;
      serviceDate: string;
      description: string;
      ageIssue: string;
      severity: 'high' | 'medium' | 'low';
    }> = [];

    lineItems.forEach(item => {
      const baseCode = this.getBaseCode(item.code);
      const restriction = this.ageRestrictions.get(baseCode);

      if (restriction) {
        issues.push({
          code: item.code,
          serviceDate: item.serviceDate,
          description: restriction.description,
          ageIssue: this.formatAgeRequirement(restriction),
          severity: this.determineSeverity(restriction)
        });
      }
    });

    // Check for conflicting age-specific procedures
    this.checkForAgeConflicts(lineItems, issues);

    return issues;
  }

  private checkForAgeConflicts(
    lineItems: any[],
    issues: Array<{
      code: string;
      serviceDate: string;
      description: string;
      ageIssue: string;
      severity: 'high' | 'medium' | 'low';
    }>
  ): void {
    // Group by service date
    const itemsByDate = new Map<string, any[]>();
    lineItems.forEach(item => {
      const date = item.serviceDate || 'unknown';
      if (!itemsByDate.has(date)) {
        itemsByDate.set(date, []);
      }
      itemsByDate.get(date)!.push(item);
    });

    itemsByDate.forEach((items, serviceDate) => {
      const pediatricCodes = items.filter(item => {
        const restriction = this.ageRestrictions.get(this.getBaseCode(item.code));
        return restriction && restriction.maxAge && restriction.maxAge <= 18;
      });

      const geriatricCodes = items.filter(item => {
        const restriction = this.ageRestrictions.get(this.getBaseCode(item.code));
        return restriction && restriction.minAge && restriction.minAge >= 65;
      });

      if (pediatricCodes.length > 0 && geriatricCodes.length > 0) {
        // Conflicting age-specific procedures
        pediatricCodes.concat(geriatricCodes).forEach(item => {
          const restriction = this.ageRestrictions.get(this.getBaseCode(item.code));
          if (restriction) {
            issues.push({
              code: item.code,
              serviceDate,
              description: restriction.description,
              ageIssue: 'Conflicting age-specific procedures on same date - verify patient age',
              severity: 'high'
            });
          }
        });
      }

      // Check for inappropriate combinations
      const reproductiveHealthCodes = items.filter(item => {
        const code = this.getBaseCode(item.code);
        return ['58150', '58661', '59400', '59510'].includes(code);
      });

      const geriatricScreeningCodes = items.filter(item => {
        const code = this.getBaseCode(item.code);
        return ['77080', '77081', '92557'].includes(code);
      });

      if (reproductiveHealthCodes.length > 0 && geriatricScreeningCodes.length > 0) {
        issues.push({
          code: 'MULTIPLE',
          serviceDate,
          description: 'Age conflict pattern',
          ageIssue: 'Reproductive health and geriatric screening on same date suggests age verification needed',
          severity: 'medium'
        });
      }
    });
  }

  private getBaseCode(code: string): string {
    return code.split('-')[0]; // Remove modifiers
  }

  private formatAgeRequirement(restriction: {
    minAge?: number;
    maxAge?: number;
    preferredAgeRange?: { min: number; max: number };
    description: string;
    exceptions?: string[];
  }): string {
    let ageReq = '';

    if (restriction.minAge && restriction.maxAge) {
      ageReq = `Ages ${restriction.minAge}-${restriction.maxAge}`;
    } else if (restriction.minAge) {
      ageReq = `Age ${restriction.minAge}+`;
    } else if (restriction.maxAge) {
      ageReq = `Age ${restriction.maxAge} and under`;
    } else if (restriction.preferredAgeRange) {
      ageReq = `Preferred ages ${restriction.preferredAgeRange.min}-${restriction.preferredAgeRange.max}`;
    }

    if (restriction.exceptions && restriction.exceptions.length > 0) {
      ageReq += ` (exceptions: ${restriction.exceptions.join(', ')})`;
    }

    return ageReq || 'Age-sensitive procedure';
  }

  private determineSeverity(restriction: {
    minAge?: number;
    maxAge?: number;
    preferredAgeRange?: { min: number; max: number };
    description: string;
    exceptions?: string[];
  }): 'high' | 'medium' | 'low' {
    // High severity for strict age limits (pediatric/geriatric only)
    if ((restriction.maxAge && restriction.maxAge <= 18) ||
        (restriction.minAge && restriction.minAge >= 65)) {
      return 'high';
    }

    // Medium severity for preferred ranges
    if (restriction.preferredAgeRange) {
      return 'medium';
    }

    // Low severity for guidelines with exceptions
    if (restriction.exceptions && restriction.exceptions.length > 0) {
      return 'low';
    }

    return 'medium';
  }
}