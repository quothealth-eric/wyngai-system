import { DetectionResult, DetectionContext } from '../types';

export class ExperimentalUnprovenDetector {
  static readonly RULE_ID = 'EXPERIMENTAL_UNPROVEN';

  // Experimental, investigational, or unproven procedures
  private readonly experimentalCodes = new Map<string, {
    category: 'experimental' | 'investigational' | 'unproven' | 'cosmetic';
    description: string;
    reason: string;
    alternativeCode?: string;
  }>([
    // Experimental procedures
    ['0648T', { category: 'experimental', description: 'Quantitative pupillometry', reason: 'Category III (experimental) code' }],
    ['0649T', { category: 'experimental', description: 'Quantitative pupillometry analysis', reason: 'Category III (experimental) code' }],
    ['0650T', { category: 'experimental', description: 'Programming device evaluation', reason: 'Category III (experimental) code' }],
    ['0651T', { category: 'experimental', description: 'Magnetically controlled device', reason: 'Category III (experimental) code' }],

    // Investigational treatments
    ['C9145', { category: 'investigational', description: 'Injection, aprepitant', reason: 'HCPCS C-code for investigational use' }],
    ['C9399', { category: 'investigational', description: 'Unclassified drugs or biologicals', reason: 'Investigational drug code' }],
    ['C9800', { category: 'investigational', description: 'Dermal injection procedure', reason: 'Investigational procedure' }],

    // Unproven/controversial procedures
    ['90901', { category: 'unproven', description: 'Biofeedback training', reason: 'Limited evidence for many conditions' }],
    ['97112', { category: 'unproven', description: 'Neuromuscular reeducation', reason: 'May be unproven for certain conditions' }],
    ['98925', { category: 'unproven', description: 'Osteopathic manipulative treatment', reason: 'Limited evidence for many conditions' }],
    ['98940', { category: 'unproven', description: 'Chiropractic manipulation', reason: 'Evidence limited for non-back conditions' }],
    ['98941', { category: 'unproven', description: 'Chiropractic manipulation', reason: 'Evidence limited for non-back conditions' }],
    ['98942', { category: 'unproven', description: 'Chiropractic manipulation', reason: 'Evidence limited for non-back conditions' }],

    // Cosmetic procedures (often not covered)
    ['15824', { category: 'cosmetic', description: 'Rhytidectomy (facelift)', reason: 'Typically cosmetic, not medically necessary' }],
    ['15825', { category: 'cosmetic', description: 'Rhytidectomy with neck lift', reason: 'Typically cosmetic, not medically necessary' }],
    ['19324', { category: 'cosmetic', description: 'Breast enlargement', reason: 'Typically cosmetic, not medically necessary' }],
    ['19325', { category: 'cosmetic', description: 'Breast enlargement with implant', reason: 'Typically cosmetic, not medically necessary' }],
    ['27418', { category: 'cosmetic', description: 'Anterior cruciate ligament repair', reason: 'May be cosmetic for non-athletes' }],

    // Hair transplantation
    ['15775', { category: 'cosmetic', description: 'Hair transplantation', reason: 'Typically cosmetic, not medically necessary' }],
    ['15776', { category: 'cosmetic', description: 'Hair transplantation', reason: 'Typically cosmetic, not medically necessary' }],

    // Weight loss surgery (strict criteria)
    ['43644', { category: 'unproven', description: 'Laparoscopic gastric bypass', reason: 'Requires strict BMI and comorbidity criteria' }],
    ['43645', { category: 'unproven', description: 'Laparoscopic gastric bypass', reason: 'Requires strict BMI and comorbidity criteria' }],

    // Varicose vein procedures (often cosmetic)
    ['36470', { category: 'cosmetic', description: 'Varicose vein injection', reason: 'Often cosmetic unless symptomatic' }],
    ['36471', { category: 'cosmetic', description: 'Varicose vein injection', reason: 'Often cosmetic unless symptomatic' }],

    // Vision correction surgery
    ['65771', { category: 'cosmetic', description: 'Radial keratotomy', reason: 'Refractive surgery typically not covered' }],
    ['65772', { category: 'cosmetic', description: 'Corneal relaxing incisions', reason: 'Refractive surgery typically not covered' }],

    // Sleep disorder procedures (strict criteria)
    ['42140', { category: 'unproven', description: 'Uvulopalatopharyngoplasty', reason: 'Unproven for sleep apnea in many patients' }],
    ['41530', { category: 'unproven', description: 'Submucosal ablation of tongue', reason: 'Experimental for sleep apnea' }],

    // Chelation therapy
    ['96365', { category: 'unproven', description: 'Chelation therapy', reason: 'Unproven for cardiovascular disease' }],
    ['96366', { category: 'unproven', description: 'Chelation therapy additional hour', reason: 'Unproven for cardiovascular disease' }],

    // Hyperbaric oxygen therapy (limited indications)
    ['99183', { category: 'unproven', description: 'Hyperbaric oxygen therapy', reason: 'Unproven for many claimed conditions' }],

    // Prolotherapy
    ['20550', { category: 'unproven', description: 'Injection of tendon sheath', reason: 'Prolotherapy often unproven' }],
    ['20551', { category: 'unproven', description: 'Injection of tendon origin', reason: 'Prolotherapy often unproven' }],

    // Stem cell procedures (mostly experimental)
    ['0565T', { category: 'experimental', description: 'Autologous stem cell therapy', reason: 'Experimental stem cell treatment' }],
    ['0566T', { category: 'experimental', description: 'Autologous stem cell implantation', reason: 'Experimental stem cell treatment' }]
  ]);

  // Category III CPT codes (all experimental by definition)
  private readonly category3Pattern = /^0\d{3}T$/;

  // Unlisted procedure codes (often experimental)
  private readonly unlistedCodes = new Set([
    '24999', '25999', '26999', '27299', '27599', '27899', // Orthopedic unlisted
    '30999', '31299', '31599', // ENT unlisted
    '32999', '33999', '36299', // Cardiovascular unlisted
    '38999', '41599', '41899', // Various unlisted
    '43289', '43499', '43659', '43999', // GI unlisted
    '47379', '47399', '48999', // Hepatobiliary unlisted
    '49329', '49659', '49999', // Abdomen unlisted
    '53899', '54999', '55899', '58578', '58579', '58999', // GU unlisted
    '59897', '59898', '59899', // Obstetric unlisted
    '60659', '60699', // Endocrine unlisted
    '64999', '67299', '67399', '67599', '67999', // Nervous system/eye unlisted
    '69399', '69799', '69949', '69979', // Ear unlisted
    '76999', '77799', '78999', '79999', // Radiology unlisted
    '81479', '81599', '84999', '85999', '86849', '86999', // Lab unlisted
    '88099', '88199', '88299', '88399', // Pathology unlisted
    '89398', '89399', // Reproductive medicine unlisted
    '90399', '90749', '90899', '90999', // Medicine unlisted
    '99199', '99499' // E&M unlisted
  ]);

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    const experimentalIssues = this.findExperimentalProcedures(context.lineItems);
    const triggered = experimentalIssues.length > 0;

    if (!triggered) {
      return {
        ruleId: ExperimentalUnprovenDetector.RULE_ID,
        triggered: false,
        confidence: 0.92,
        message: 'No experimental or unproven procedures detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    const affectedItems = experimentalIssues.map(issue => issue.code);

    return {
      ruleId: ExperimentalUnprovenDetector.RULE_ID,
      triggered: true,
      confidence: 0.89,
      message: `Found ${experimentalIssues.length} experimental or unproven procedures`,
      affectedItems,
      recommendedAction: 'Verify coverage policy for experimental/investigational procedures',
      citations: [{
        title: 'Medicare Coverage Database',
        authority: 'CMS',
        citation: 'National Coverage Determinations (NCDs) and Local Coverage Determinations (LCDs)'
      }, {
        title: 'AMA CPT Category III Codes',
        authority: 'Federal',
        citation: 'Category III codes describe emerging technology, services, and procedures'
      }],
      evidence: experimentalIssues.map(issue => ({
        field: 'procedureCode',
        value: `${issue.code}: ${issue.description} - ${issue.reason}`,
        location: `Service Date: ${issue.serviceDate}`
      }))
    };
  }

  private findExperimentalProcedures(lineItems: any[]): Array<{
    code: string;
    serviceDate: string;
    description: string;
    category: string;
    reason: string;
    severity: 'high' | 'medium' | 'low';
  }> {
    const issues: Array<{
      code: string;
      serviceDate: string;
      description: string;
      category: string;
      reason: string;
      severity: 'high' | 'medium' | 'low';
    }> = [];

    lineItems.forEach(item => {
      const baseCode = this.getBaseCode(item.code);

      // Check specific experimental codes
      const experimentalInfo = this.experimentalCodes.get(baseCode);
      if (experimentalInfo) {
        issues.push({
          code: item.code,
          serviceDate: item.serviceDate,
          description: experimentalInfo.description,
          category: experimentalInfo.category,
          reason: experimentalInfo.reason,
          severity: this.getSeverityForCategory(experimentalInfo.category)
        });
        return;
      }

      // Check Category III codes (0000T-9999T)
      if (this.category3Pattern.test(baseCode)) {
        issues.push({
          code: item.code,
          serviceDate: item.serviceDate,
          description: item.description || 'Category III procedure',
          category: 'experimental',
          reason: 'Category III codes represent experimental or emerging procedures',
          severity: 'high'
        });
        return;
      }

      // Check unlisted procedure codes
      if (this.unlistedCodes.has(baseCode)) {
        issues.push({
          code: item.code,
          serviceDate: item.serviceDate,
          description: item.description || 'Unlisted procedure',
          category: 'unlisted',
          reason: 'Unlisted procedure codes often represent experimental or non-standard treatments',
          severity: 'medium'
        });
        return;
      }

      // Check for patterns indicating experimental procedures
      const experimentalPatterns = this.checkForExperimentalPatterns(item);
      if (experimentalPatterns.length > 0) {
        experimentalPatterns.forEach(pattern => {
          issues.push({
            code: item.code,
            serviceDate: item.serviceDate,
            description: item.description || 'Procedure',
            category: 'pattern',
            reason: pattern,
            severity: 'low'
          });
        });
      }
    });

    return issues;
  }

  private checkForExperimentalPatterns(item: any): string[] {
    const patterns: string[] = [];
    const description = (item.description || '').toLowerCase();

    // Check description for experimental keywords
    const experimentalKeywords = [
      'investigational', 'experimental', 'research', 'trial',
      'pilot', 'prototype', 'developmental', 'novel',
      'innovative', 'cutting-edge', 'emerging'
    ];

    experimentalKeywords.forEach(keyword => {
      if (description.includes(keyword)) {
        patterns.push(`Description contains experimental keyword: "${keyword}"`);
      }
    });

    // Check for unusually high amounts (may indicate experimental/cosmetic)
    if (item.charge > 1000000) { // $10,000+
      patterns.push('Unusually high amount may indicate cosmetic or experimental procedure');
    }

    // Check for codes with unusual modifiers
    const modifiers = this.extractModifiers(item.code);
    if (modifiers.includes('GY')) {
      patterns.push('GY modifier indicates statutorily excluded service');
    }
    if (modifiers.includes('GZ')) {
      patterns.push('GZ modifier indicates expected denial as not reasonable and necessary');
    }

    return patterns;
  }

  private getBaseCode(code: string): string {
    return code.split('-')[0]; // Remove modifiers
  }

  private extractModifiers(code: string): string[] {
    const parts = code.split('-');
    return parts.slice(1); // Everything after the first dash is a modifier
  }

  private getSeverityForCategory(category: string): 'high' | 'medium' | 'low' {
    switch (category) {
      case 'experimental':
        return 'high';
      case 'investigational':
        return 'high';
      case 'unproven':
        return 'medium';
      case 'cosmetic':
        return 'medium';
      default:
        return 'low';
    }
  }
}