import { DetectionResult, DetectionContext } from '../types';

export class GenderSpecificDetector {
  static readonly RULE_ID = 'GENDER_SPECIFIC';

  // Gender-specific procedure codes
  private readonly maleOnlyCodes = new Set([
    '54001', '54015', '54050', '54055', '54056', '54057', '54060', // Prostate procedures
    '54400', '54401', '54405', '54408', '54410', '54411', '54415', // Penis procedures
    '54500', '54505', '54512', '54520', '54522', '54530', '54535', // Testicular procedures
    '54550', '54560', '54600', '54620', '54640', '54650', '54660', // Scrotal procedures
    '54700', '54800', '54830', '54840', '54860', '54861', '54865', // Male genital procedures
    '55000', '55040', '55041', '55060', '55100', '55110', '55120', // Prostate biopsy/surgery
    '55150', '55200', '55250', '55300', '55400', '55450', '55500', // Prostate surgery
    '55600', '55605', '55650', '55700', '55705', '55706', '55720', // Seminal vesicle
    '55801', '55810', '55812', '55815', '55821', '55831', '55840', // Prostate surgery
    '55842', '55845', '55862', '55865', '55866', '55870', '55873', // Advanced prostate
    'G0103', // PSA screening
  ]);

  private readonly femaleOnlyCodes = new Set([
    '56405', '56420', '56440', '56441', '56442', '56501', '56515', // Vulva procedures
    '57000', '57010', '57020', '57022', '57023', '57061', '57065', // Vagina procedures
    '57100', '57105', '57106', '57107', '57109', '57110', '57111', // Cervix procedures
    '57150', '57155', '57156', '57160', '57170', '57180', '57200', // Cervix surgery
    '57220', '57230', '57240', '57250', '57260', '57265', '57268', // Cervix surgery
    '57270', '57280', '57282', '57283', '57284', '57285', '57287', // Cervix surgery
    '57288', '57289', '57291', '57292', '57295', '57296', '57300', // Cervix surgery
    '57305', '57307', '57308', '57310', '57311', '57320', '57330', // Cervix surgery
    '57400', '57410', '57415', '57420', '57421', '57425', '57426', // Vagina surgery
    '57500', '57505', '57510', '57511', '57513', '57520', '57522', // Vagina surgery
    '58100', '58110', '58120', '58140', '58145', '58146', '58150', // Uterus procedures
    '58152', '58180', '58200', '58210', '58240', '58260', '58262', // Uterus procedures
    '58267', '58270', '58275', '58280', '58285', '58290', '58291', // Uterus procedures
    '58292', '58293', '58294', '58301', '58321', '58322', '58323', // Uterus procedures
    '58340', '58345', '58346', '58350', '58353', '58356', '58400', // Uterus procedures
    '58410', '58520', '58540', '58541', '58542', '58543', '58544', // Ovary procedures
    '58545', '58546', '58548', '58550', '58552', '58553', '58554', // Ovary procedures
    '58555', '58558', '58559', '58560', '58561', '58562', '58563', // Ovary procedures
    '58565', '58570', '58571', '58572', '58573', '58574', '58575', // Ovary procedures
    '58600', '58605', '58611', '58615', '58660', '58661', '58662', // Fallopian tubes
    '58670', '58671', '58672', '58673', '58674', '58679', '58700', // Fallopian tubes
    '58720', '58740', '58750', '58752', '58760', '58770', '58800', // Fallopian tubes
    '58805', '58820', '58822', '58825', '58900', '58920', '58925', // Ovary procedures
    '58940', '58943', '58950', '58951', '58952', '58953', '58954', // Ovary procedures
    '58956', '58957', '58958', '58960', '58970', '58974', '58976', // Ovary procedures
    '59000', '59001', '59012', '59015', '59020', '59025', '59030', // Pregnancy procedures
    '59050', '59051', '59070', '59072', '59074', '59076', '59100', // Pregnancy procedures
    '59120', '59121', '59130', '59135', '59136', '59140', '59150', // Pregnancy procedures
    '59151', '59160', '59200', '59300', '59320', '59325', '59350', // Pregnancy procedures
    '59400', '59409', '59410', '59412', '59414', '59425', '59426', // Delivery procedures
    '59430', '59510', '59514', '59515', '59525', '59610', '59612', // C-section procedures
    '59614', '59618', '59620', '59622', '59812', '59820', '59821', // Pregnancy procedures
    '59830', '59840', '59841', '59850', '59851', '59852', '59855', // Pregnancy procedures
    '59856', '59857', '59866', '59870', '59871', '59897', '59898', // Pregnancy procedures
    'G0101', // Cervical cancer screening
    '77065', '77066', '77067', // Mammography
    '88141', '88142', '88143', '88147', '88148', '88150', // Cervical cytology
    '88152', '88153', '88154', '88155', '88164', '88165', '88166', // Cervical cytology
    '88167', '88174', '88175', // Cervical cytology
  ]);

  public async detect(context: DetectionContext): Promise<DetectionResult> {
    // Note: In a real implementation, you would need patient gender from context
    // For this demo, we'll check if gender-specific codes are present without patient data
    // and flag them for manual review

    const genderIssues = this.findGenderSpecificIssues(context.lineItems);
    const triggered = genderIssues.length > 0;

    if (!triggered) {
      return {
        ruleId: GenderSpecificDetector.RULE_ID,
        triggered: false,
        confidence: 0.95,
        message: 'No gender-specific coding issues detected',
        affectedItems: [],
        recommendedAction: 'No action required',
        evidence: []
      };
    }

    return {
      ruleId: GenderSpecificDetector.RULE_ID,
      triggered: true,
      confidence: 0.90,
      message: `Found ${genderIssues.length} gender-specific procedures requiring verification`,
      affectedItems: genderIssues.map(issue => issue.code),
      recommendedAction: 'Verify patient gender matches billed procedures',
      citations: [{
        title: 'Medicare Claims Processing Manual',
        authority: 'CMS',
        citation: 'Chapter 23 - Gender-specific procedure code edits'
      }],
      evidence: genderIssues.map(issue => ({
        field: 'procedureCode',
        value: `${issue.code}: ${issue.description} (${issue.gender}-specific)`,
        location: `Service Date: ${issue.serviceDate}`
      }))
    };
  }

  private findGenderSpecificIssues(lineItems: any[]): Array<{
    code: string;
    serviceDate: string;
    description: string;
    gender: 'male' | 'female';
    issue: string;
  }> {
    const issues: Array<{
      code: string;
      serviceDate: string;
      description: string;
      gender: 'male' | 'female';
      issue: string;
    }> = [];

    lineItems.forEach(item => {
      const baseCode = this.getBaseCode(item.code);

      if (this.maleOnlyCodes.has(baseCode)) {
        issues.push({
          code: item.code,
          serviceDate: item.serviceDate,
          description: item.description || this.getCodeDescription(baseCode),
          gender: 'male',
          issue: 'Male-specific procedure requires verification of patient gender'
        });
      } else if (this.femaleOnlyCodes.has(baseCode)) {
        issues.push({
          code: item.code,
          serviceDate: item.serviceDate,
          description: item.description || this.getCodeDescription(baseCode),
          gender: 'female',
          issue: 'Female-specific procedure requires verification of patient gender'
        });
      }
    });

    // Additional checks for conflicting gender codes on same claim
    this.checkForConflictingGenderCodes(lineItems, issues);

    return issues;
  }

  private checkForConflictingGenderCodes(
    lineItems: any[],
    issues: Array<{
      code: string;
      serviceDate: string;
      description: string;
      gender: 'male' | 'female';
      issue: string;
    }>
  ): void {
    // Group by service date to check for conflicts
    const itemsByDate = new Map<string, any[]>();
    lineItems.forEach(item => {
      const date = item.serviceDate || 'unknown';
      if (!itemsByDate.has(date)) {
        itemsByDate.set(date, []);
      }
      itemsByDate.get(date)!.push(item);
    });

    itemsByDate.forEach((items, serviceDate) => {
      const maleCodes = items.filter(item => this.maleOnlyCodes.has(this.getBaseCode(item.code)));
      const femaleCodes = items.filter(item => this.femaleOnlyCodes.has(this.getBaseCode(item.code)));

      if (maleCodes.length > 0 && femaleCodes.length > 0) {
        // Conflicting gender codes on same date
        maleCodes.concat(femaleCodes).forEach(item => {
          const baseCode = this.getBaseCode(item.code);
          const gender = this.maleOnlyCodes.has(baseCode) ? 'male' : 'female';

          issues.push({
            code: item.code,
            serviceDate,
            description: item.description || this.getCodeDescription(baseCode),
            gender,
            issue: 'Conflicting gender-specific procedures on same service date - review required'
          });
        });
      }
    });
  }

  private getBaseCode(code: string): string {
    return code.split('-')[0]; // Remove modifiers
  }

  private getCodeDescription(code: string): string {
    // Simplified code descriptions - in production would use full CPT database
    const descriptions = new Map<string, string>([
      // Male-specific
      ['54001', 'Prostate biopsy'],
      ['55700', 'Prostate biopsy'],
      ['G0103', 'PSA screening'],

      // Female-specific
      ['57000', 'Cervical biopsy'],
      ['58100', 'Endometrial biopsy'],
      ['59400', 'Vaginal delivery'],
      ['59510', 'Cesarean delivery'],
      ['77067', 'Screening mammography'],
      ['G0101', 'Cervical cancer screening'],
      ['88150', 'Pap smear'],
    ]);

    return descriptions.get(code) || 'Gender-specific procedure';
  }
}