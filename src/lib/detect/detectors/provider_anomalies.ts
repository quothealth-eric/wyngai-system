import { DetectionResult, DetectionContext } from '../types';

export class ProviderAnomaliesDetector {
  static readonly RULE_ID = 'PROVIDER_ANOMALIES';

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const providerIssues = this.findProviderAnomalies(context);
    const triggered = providerIssues.length > 0;

    if (!triggered) {
      return {
        ruleId: ProviderAnomaliesDetector.RULE_ID,
        triggered: false,
        confidence: 0.75,
        message: 'No provider anomalies detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    return {
      ruleId: ProviderAnomaliesDetector.RULE_ID,
      triggered: true,
      confidence: 0.70,
      message: `Found ${providerIssues.length} provider-related concerns`,
      affectedItems: providerIssues.map(issue => issue.description),
      recommendedAction: 'Verify provider qualifications and appropriate scope of practice',
      citations: [{
        title: 'Medicare Provider Enrollment Guidelines',
        authority: 'CMS',
        citation: 'Provider specialty and scope of practice requirements'
      }],
      evidence: providerIssues.map(issue => ({
        field: 'provider',
        value: issue.description,
        location: issue.context
      }))
    };
  }

  private findProviderAnomalies(context: DetectionContext): Array<{
    description: string;
    context: string;
    severity: 'high' | 'medium' | 'low';
  }> {
    const issues: Array<{
      description: string;
      context: string;
      severity: 'high' | 'medium' | 'low';
    }> = [];

    const provider = context.provider;

    // Check for missing provider information
    if (!provider.npi) {
      issues.push({
        description: 'Missing NPI (National Provider Identifier)',
        context: 'Provider identification',
        severity: 'high'
      });
    }

    if (!provider.name) {
      issues.push({
        description: 'Missing provider name',
        context: 'Provider identification',
        severity: 'medium'
      });
    }

    // Check for specialty-procedure mismatches
    if (provider.specialty) {
      const specialtyIssues = this.checkSpecialtyProcedureMatch(
        provider.specialty,
        context.lineItems
      );
      issues.push(...specialtyIssues);
    }

    return issues;
  }

  private checkSpecialtyProcedureMatch(
    specialty: string,
    lineItems: any[]
  ): Array<{
    description: string;
    context: string;
    severity: 'high' | 'medium' | 'low';
  }> {
    const issues: Array<{
      description: string;
      context: string;
      severity: 'high' | 'medium' | 'low';
    }> = [];

    const specialtyLower = specialty.toLowerCase();

    // Define specialty-specific procedures
    const specialtyProcedures = new Map<string, string[]>([
      ['family medicine', ['99213', '99214', '99215', '99401', '99402']],
      ['internal medicine', ['99213', '99214', '99215', '99221', '99222']],
      ['cardiology', ['93000', '93306', '93350', '93452']],
      ['radiology', ['72148', '74177', '77067', '76700']],
      ['pathology', ['88305', '88307', '85025', '80053']],
      ['emergency medicine', ['99281', '99282', '99283', '99284', '99285']]
    ]);

    // Check if procedures match provider specialty
    lineItems.forEach(item => {
      const baseCode = this.getBaseCode(item.code);

      // Check for procedures that typically require specific specialties
      if (this.isSpecialtySpecificProcedure(baseCode, specialtyLower)) {
        const expectedSpecialties = this.getExpectedSpecialties(baseCode);
        if (!expectedSpecialties.some(spec => specialtyLower.includes(spec))) {
          issues.push({
            description: `Procedure ${baseCode} typically performed by ${expectedSpecialties.join(' or ')} specialist, but provider is ${specialty}`,
            context: `Service Date: ${item.serviceDate}`,
            severity: 'medium'
          });
        }
      }
    });

    return issues;
  }

  private isSpecialtySpecificProcedure(code: string, providerSpecialty: string): boolean {
    // Define procedures that are typically specialty-specific
    const specialtySpecificCodes = new Map<string, string[]>([
      ['93000', ['cardiology', 'internal medicine', 'emergency medicine']], // EKG
      ['93306', ['cardiology']], // Echo
      ['72148', ['radiology']], // MRI
      ['74177', ['radiology']], // CT
      ['88305', ['pathology']], // Tissue pathology
      ['64483', ['anesthesiology', 'pain management', 'neurology']], // Epidural
      ['20610', ['orthopedics', 'rheumatology', 'sports medicine']], // Joint injection
      ['45378', ['gastroenterology', 'general surgery']], // Colonoscopy
      ['66984', ['ophthalmology']], // Cataract surgery
      ['27447', ['orthopedics']], // Knee replacement
    ]);

    const expectedSpecialties = specialtySpecificCodes.get(code);
    if (!expectedSpecialties) return false;

    return !expectedSpecialties.some(specialty => providerSpecialty.includes(specialty));
  }

  private getExpectedSpecialties(code: string): string[] {
    const specialtyMap = new Map<string, string[]>([
      ['93000', ['cardiology', 'internal medicine']],
      ['93306', ['cardiology']],
      ['72148', ['radiology']],
      ['74177', ['radiology']],
      ['88305', ['pathology']],
      ['64483', ['anesthesiology', 'pain management']],
      ['20610', ['orthopedics', 'rheumatology']],
      ['45378', ['gastroenterology']],
      ['66984', ['ophthalmology']],
      ['27447', ['orthopedics']]
    ]);

    return specialtyMap.get(code) || [];
  }

  private getBaseCode(code: string): string {
    return code.split('-')[0];
  }
}