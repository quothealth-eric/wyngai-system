import { PHIDeidentifier } from '@/lib/phi/deidentifier';
import { DeidentificationOptions } from '@/lib/phi/types';

describe('PHIDeidentifier', () => {
  let deidentifier: PHIDeidentifier;

  beforeEach(() => {
    deidentifier = new PHIDeidentifier();
  });

  afterEach(() => {
    deidentifier.clearCache();
  });

  describe('deidentify', () => {
    it('should deidentify SSN correctly', () => {
      const text = 'Patient SSN: 123-45-6789 for verification.';
      const result = deidentifier.deidentify(text);

      expect(result.deidentifiedText).toContain('[SSN]');
      expect(result.deidentifiedText).not.toContain('123-45-6789');
      expect(result.detections).toHaveLength(1);
      expect(result.detections[0].category).toBe('SSN');
      expect(result.detections[0].confidence).toBeGreaterThan(0.9);
    });

    it('should deidentify phone numbers correctly', () => {
      const text = 'Call us at (555) 123-4567 or 555.987.6543';
      const result = deidentifier.deidentify(text);

      expect(result.deidentifiedText).toContain('[PHONE]');
      expect(result.deidentifiedText).not.toContain('555');
      expect(result.detections).toHaveLength(2);
      expect(result.detections[0].category).toBe('PHONE');
    });

    it('should deidentify email addresses correctly', () => {
      const text = 'Contact john.doe@example.com for questions.';
      const result = deidentifier.deidentify(text);

      expect(result.deidentifiedText).toContain('[EMAIL]');
      expect(result.deidentifiedText).not.toContain('john.doe@example.com');
      expect(result.detections).toHaveLength(1);
      expect(result.detections[0].category).toBe('EMAIL');
    });

    it('should deidentify person names correctly', () => {
      const text = 'Patient: John Smith, Age: 45';
      const result = deidentifier.deidentify(text);

      expect(result.deidentifiedText).toContain('[NAME]');
      expect(result.deidentifiedText).not.toContain('John Smith');
      expect(result.detections.some(d => d.category === 'PERSON_NAME')).toBe(true);
    });

    it('should deidentify medical record numbers', () => {
      const text = 'MRN: ABC123456789 - Patient record';
      const result = deidentifier.deidentify(text);

      expect(result.deidentifiedText).toContain('[MRN]');
      expect(result.detections.some(d => d.category === 'MEDICAL_RECORD_NUMBER')).toBe(true);
    });

    it('should preserve text structure when preserveFormatting is true', () => {
      const text = 'Patient: John Smith\nSSN: 123-45-6789\nPhone: (555) 123-4567';
      const options: DeidentificationOptions = {
        enableSafeMode: true,
        preserveFormatting: true,
        confidenceThreshold: 0.7,
        replacementStrategy: 'generic'
      };

      const result = deidentifier.deidentify(text, options);

      // Should preserve line breaks and general structure
      expect(result.deidentifiedText.split('\n')).toHaveLength(3);
      expect(result.deidentifiedText).toMatch(/Patient: \[.*\]/);
      expect(result.deidentifiedText).toMatch(/SSN: \[.*\]/);
      expect(result.deidentifiedText).toMatch(/Phone: \[.*\]/);
    });

    it('should use consistent replacements with consistent strategy', () => {
      const text1 = 'Patient John Smith has SSN 123-45-6789';
      const text2 = 'John Smith called about SSN 123-45-6789';

      const options: DeidentificationOptions = {
        enableSafeMode: true,
        preserveFormatting: true,
        confidenceThreshold: 0.7,
        replacementStrategy: 'consistent'
      };

      const result1 = deidentifier.deidentify(text1, options);
      const result2 = deidentifier.deidentify(text2, options);

      // Same SSN should get same replacement
      const ssn1Match = result1.deidentifiedText.match(/\[SSN_\d+\]/);
      const ssn2Match = result2.deidentifiedText.match(/\[SSN_\d+\]/);

      expect(ssn1Match).toBeTruthy();
      expect(ssn2Match).toBeTruthy();
      expect(ssn1Match![0]).toBe(ssn2Match![0]);
    });

    it('should handle safe mode with lower confidence threshold', () => {
      const text = 'Possible ID: A1B2C3D4 might be sensitive';

      const normalOptions: DeidentificationOptions = {
        enableSafeMode: false,
        preserveFormatting: true,
        confidenceThreshold: 0.8,
        replacementStrategy: 'generic'
      };

      const safeOptions: DeidentificationOptions = {
        enableSafeMode: true,
        preserveFormatting: true,
        confidenceThreshold: 0.6,
        replacementStrategy: 'generic'
      };

      const normalResult = deidentifier.deidentify(text, normalOptions);
      const safeResult = deidentifier.deidentify(text, safeOptions);

      // Safe mode should be more aggressive
      expect(safeResult.detections.length).toBeGreaterThanOrEqual(normalResult.detections.length);
    });

    it('should exclude specified categories', () => {
      const text = 'John Smith, SSN: 123-45-6789, email: john@example.com';

      const options: DeidentificationOptions = {
        enableSafeMode: true,
        preserveFormatting: true,
        confidenceThreshold: 0.7,
        replacementStrategy: 'generic',
        excludeCategories: ['PERSON_NAME'] // Don't deidentify names
      };

      const result = deidentifier.deidentify(text, options);

      expect(result.deidentifiedText).toContain('John Smith'); // Name preserved
      expect(result.deidentifiedText).toContain('[SSN]'); // SSN deidentified
      expect(result.deidentifiedText).toContain('[EMAIL]'); // Email deidentified
    });

    it('should calculate statistics correctly', () => {
      const text = 'John Smith, SSN: 123-45-6789, Phone: (555) 123-4567, Email: john@example.com';
      const result = deidentifier.deidentify(text);

      expect(result.statistics.totalDetections).toBeGreaterThan(0);
      expect(result.statistics.categoryCounts).toBeDefined();
      expect(result.statistics.confidenceAverage).toBeGreaterThan(0);
      expect(result.statistics.confidenceAverage).toBeLessThanOrEqual(1);
    });

    it('should handle empty text gracefully', () => {
      const result = deidentifier.deidentify('');

      expect(result.deidentifiedText).toBe('');
      expect(result.detections).toHaveLength(0);
      expect(result.statistics.totalDetections).toBe(0);
    });

    it('should not deidentify invalid SSN patterns', () => {
      const text = 'Invalid SSN: 000-00-0000 and 999-99-9999';
      const result = deidentifier.deidentify(text);

      // Should not deidentify obviously invalid SSNs
      expect(result.deidentifiedText).toContain('000-00-0000');
    });
  });

  describe('detectPHI', () => {
    it('should detect PHI without replacement', () => {
      const text = 'Patient John Smith, SSN: 123-45-6789';
      const detections = deidentifier.detectPHI(text);

      expect(detections.length).toBeGreaterThan(0);
      expect(detections.some(d => d.category === 'SSN')).toBe(true);
      expect(detections[0].text).toBe('123-45-6789');
    });
  });

  describe('validateDeidentification', () => {
    it('should validate clean text as compliant', () => {
      const cleanText = 'Patient [NAME] has diagnosis code Z99.9';
      const validation = deidentifier.validateDeidentification(cleanText);

      expect(validation.isValid).toBe(true);
      expect(validation.riskLevel).toBe('low');
      expect(validation.remainingPHI).toHaveLength(0);
    });

    it('should detect remaining PHI in text', () => {
      const dirtyText = 'Patient John Smith still has SSN: 123-45-6789';
      const validation = deidentifier.validateDeidentification(dirtyText);

      expect(validation.isValid).toBe(false);
      expect(validation.riskLevel).toBeOneOf(['medium', 'high']);
      expect(validation.remainingPHI.length).toBeGreaterThan(0);
    });

    it('should assess risk level correctly', () => {
      const highRiskText = 'John Smith, SSN: 123-45-6789, Phone: (555) 123-4567';
      const mediumRiskText = 'Some ID: A1B2C3, Another ID: X9Y8Z7, Third ID: M5N6P7, Fourth ID: Q1W2E3';
      const lowRiskText = 'Patient [NAME] has been treated successfully';

      const highRisk = deidentifier.validateDeidentification(highRiskText);
      const mediumRisk = deidentifier.validateDeidentification(mediumRiskText);
      const lowRisk = deidentifier.validateDeidentification(lowRiskText);

      expect(highRisk.riskLevel).toBe('high');
      expect(mediumRisk.riskLevel).toBe('medium');
      expect(lowRisk.riskLevel).toBe('low');
    });
  });
});