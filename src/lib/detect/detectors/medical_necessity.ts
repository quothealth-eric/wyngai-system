import { DetectionResult, DetectionContext } from '../types';

export class MedicalNecessityDetector {
  static readonly RULE_ID = 'MEDICAL_NECESSITY';

  // Procedures requiring strict medical necessity documentation
  private readonly highScrutinyProcedures = new Map<string, {
    description: string;
    requiredDocumentation: string[];
    commonDenialReasons: string[];
    riskLevel: 'high' | 'medium' | 'low';
  }>([
    // High-cost imaging
    ['70551', {
      description: 'MRI brain without contrast',
      requiredDocumentation: ['neurological symptoms', 'failed conservative treatment'],
      commonDenialReasons: ['routine screening', 'insufficient symptoms'],
      riskLevel: 'high'
    }],
    ['72148', {
      description: 'MRI lumbar spine without contrast',
      requiredDocumentation: ['back pain duration >6 weeks', 'failed conservative treatment'],
      commonDenialReasons: ['acute back pain <6 weeks', 'no conservative treatment tried'],
      riskLevel: 'high'
    }],

    // Advanced procedures
    ['64483', {
      description: 'Lumbar epidural injection',
      requiredDocumentation: ['radicular pain', 'imaging showing pathology'],
      commonDenialReasons: ['mechanical back pain', 'no imaging correlation'],
      riskLevel: 'medium'
    }],
    ['20610', {
      description: 'Joint injection',
      requiredDocumentation: ['joint pain', 'failed oral medications'],
      commonDenialReasons: ['routine injection', 'insufficient conservative treatment'],
      riskLevel: 'low'
    }],

    // Surgery requiring prior authorization
    ['27447', {
      description: 'Total knee arthroplasty',
      requiredDocumentation: ['severe arthritis', 'functional limitation', 'failed conservative treatment'],
      commonDenialReasons: ['mild arthritis', 'insufficient conservative treatment'],
      riskLevel: 'high'
    }],
    ['47562', {
      description: 'Laparoscopic cholecystectomy',
      requiredDocumentation: ['symptomatic gallstones', 'appropriate imaging'],
      commonDenialReasons: ['asymptomatic stones', 'incidental finding'],
      riskLevel: 'medium'
    }]
  ]);

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const necessityIssues = this.findMedicalNecessityIssues(context.lineItems);
    const triggered = necessityIssues.length > 0;

    if (!triggered) {
      return {
        ruleId: MedicalNecessityDetector.RULE_ID,
        triggered: false,
        confidence: 0.70,
        message: 'No medical necessity concerns detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    return {
      ruleId: MedicalNecessityDetector.RULE_ID,
      triggered: true,
      confidence: 0.65,
      message: `Found ${necessityIssues.length} procedures requiring medical necessity review`,
      affectedItems: necessityIssues.map(issue => issue.code),
      recommendedAction: 'Verify supporting documentation demonstrates medical necessity',
      citations: [{
        title: 'Medicare Program Integrity Manual',
        authority: 'CMS',
        citation: 'Chapter 13 - Local Coverage Determinations'
      }],
      evidence: necessityIssues.map(issue => ({
        field: 'medicalNecessity',
        value: `${issue.code}: ${issue.concern}`,
        location: `Service Date: ${issue.serviceDate}`
      }))
    };
  }

  private findMedicalNecessityIssues(lineItems: any[]): Array<{
    code: string;
    serviceDate: string;
    concern: string;
    riskLevel: string;
  }> {
    const issues: Array<{
      code: string;
      serviceDate: string;
      concern: string;
      riskLevel: string;
    }> = [];

    lineItems.forEach(item => {
      const baseCode = this.getBaseCode(item.code);
      const scrutiny = this.highScrutinyProcedures.get(baseCode);

      if (scrutiny) {
        issues.push({
          code: item.code,
          serviceDate: item.serviceDate,
          concern: `${scrutiny.description} requires documentation: ${scrutiny.requiredDocumentation.join(', ')}`,
          riskLevel: scrutiny.riskLevel
        });
      }
    });

    return issues;
  }

  private getBaseCode(code: string): string {
    return code.split('-')[0];
  }
}