import {
  PHIPattern,
  PHIDetectionResult,
  DeidentificationResult,
  DeidentificationOptions,
  PHICategory
} from './types';
import { PHIPatterns } from './patterns';

export class PHIDeidentifier {
  private consistentReplacements = new Map<string, string>();
  private replacementCounters = new Map<PHICategory, number>();

  /**
   * Deidentify text by detecting and replacing PHI
   */
  public deidentify(
    text: string,
    options: DeidentificationOptions = this.getDefaultOptions()
  ): DeidentificationResult {
    console.log('🔒 Starting PHI deidentification...');

    const detections: PHIDetectionResult[] = [];
    let deidentifiedText = text;

    // Get patterns to use based on options
    const patterns = this.getApplicablePatterns(options);

    console.log(`🔍 Using ${patterns.length} PHI detection patterns (threshold: ${options.confidenceThreshold})`);

    // Process each pattern
    for (const pattern of patterns) {
      const patternDetections = this.detectPattern(deidentifiedText, pattern, options);
      detections.push(...patternDetections);
    }

    // Sort detections by position (reverse order for replacement)
    detections.sort((a, b) => b.start - a.start);

    // Apply replacements
    for (const detection of detections) {
      const replacement = this.generateReplacement(detection, options);
      deidentifiedText = deidentifiedText.substring(0, detection.start) +
                        replacement +
                        deidentifiedText.substring(detection.end);

      // Update the replacement in the detection
      detection.replacement = replacement;
    }

    // Calculate statistics
    const statistics = this.calculateStatistics(detections);

    console.log(`✅ Deidentification complete: ${detections.length} PHI items detected and replaced`);

    return {
      originalText: text,
      deidentifiedText,
      detections,
      statistics,
      metadata: {
        processedAt: new Date().toISOString(),
        method: 'pattern_based',
        safeModeEnabled: options.enableSafeMode
      }
    };
  }

  /**
   * Detect PHI patterns in text without replacement (for analysis)
   */
  public detectPHI(
    text: string,
    options: DeidentificationOptions = this.getDefaultOptions()
  ): PHIDetectionResult[] {
    const detections: PHIDetectionResult[] = [];
    const patterns = this.getApplicablePatterns(options);

    for (const pattern of patterns) {
      const patternDetections = this.detectPattern(text, pattern, options);
      detections.push(...patternDetections);
    }

    return detections.sort((a, b) => a.start - b.start);
  }

  /**
   * Validate text is properly deidentified
   */
  public validateDeidentification(text: string): {
    isValid: boolean;
    remainingPHI: PHIDetectionResult[];
    riskLevel: 'low' | 'medium' | 'high';
  } {
    const strictOptions: DeidentificationOptions = {
      enableSafeMode: true,
      preserveFormatting: true,
      confidenceThreshold: 0.6, // Lower threshold for validation
      replacementStrategy: 'generic'
    };

    const remainingPHI = this.detectPHI(text, strictOptions);
    const highConfidencePHI = remainingPHI.filter(phi => phi.confidence >= 0.8);

    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (highConfidencePHI.length > 0) {
      riskLevel = 'high';
    } else if (remainingPHI.length > 3) {
      riskLevel = 'medium';
    }

    return {
      isValid: remainingPHI.length === 0,
      remainingPHI,
      riskLevel
    };
  }

  /**
   * Get default deidentification options
   */
  private getDefaultOptions(): DeidentificationOptions {
    return {
      enableSafeMode: true,
      preserveFormatting: true,
      confidenceThreshold: 0.7,
      replacementStrategy: 'consistent',
      excludeCategories: []
    };
  }

  /**
   * Get patterns to apply based on options
   */
  private getApplicablePatterns(options: DeidentificationOptions): PHIPattern[] {
    let patterns = PHIPatterns.getPatternsAboveThreshold(options.confidenceThreshold);

    // Add custom patterns if provided
    if (options.customPatterns) {
      patterns = [...patterns, ...options.customPatterns];
    }

    // Exclude categories if specified
    if (options.excludeCategories && options.excludeCategories.length > 0) {
      patterns = patterns.filter(pattern =>
        !options.excludeCategories!.includes(pattern.category)
      );
    }

    // In safe mode, use more aggressive patterns
    if (options.enableSafeMode) {
      patterns = PHIPatterns.getPatternsAboveThreshold(0.6);
    }

    return patterns;
  }

  /**
   * Detect occurrences of a specific pattern
   */
  private detectPattern(
    text: string,
    pattern: PHIPattern,
    options: DeidentificationOptions
  ): PHIDetectionResult[] {
    const detections: PHIDetectionResult[] = [];
    let match;

    // Reset regex lastIndex to ensure we find all matches
    pattern.pattern.lastIndex = 0;

    while ((match = pattern.pattern.exec(text)) !== null) {
      const matchedText = match[0];
      const start = match.index;
      const end = start + matchedText.length;

      // Get context around the match
      const contextStart = Math.max(0, start - 20);
      const contextEnd = Math.min(text.length, end + 20);
      const context = text.substring(contextStart, contextEnd);

      // Additional validation for some patterns
      if (this.isValidDetection(matchedText, pattern)) {
        detections.push({
          text: matchedText,
          start,
          end,
          category: pattern.category,
          patternId: pattern.id,
          confidence: pattern.confidence,
          context,
          replacement: '' // Will be set during replacement
        });
      }

      // Prevent infinite loops on zero-width matches
      if (match.index === pattern.pattern.lastIndex) {
        pattern.pattern.lastIndex++;
      }
    }

    return detections;
  }

  /**
   * Additional validation for detected patterns
   */
  private isValidDetection(text: string, pattern: PHIPattern): boolean {
    // Skip obvious false positives
    const falsePositives = [
      // Common non-PHI numbers that might match SSN pattern
      '000-00-0000', '123-45-6789', '111-11-1111',
      // Common test phone numbers
      '555-555-5555', '000-000-0000',
      // Common placeholder emails
      'test@test.com', 'example@example.com'
    ];

    if (falsePositives.includes(text.toLowerCase())) {
      return false;
    }

    // Additional category-specific validation
    switch (pattern.category) {
      case 'SSN':
        // Validate SSN format and exclude invalid ranges
        return this.isValidSSN(text);

      case 'PHONE':
        // Validate phone number format
        return this.isValidPhoneNumber(text);

      case 'EMAIL':
        // Basic email validation
        return this.isValidEmail(text);

      default:
        return true;
    }
  }

  /**
   * Validate SSN format and ranges
   */
  private isValidSSN(ssn: string): boolean {
    const digits = ssn.replace(/\D/g, '');

    // Must be 9 digits
    if (digits.length !== 9) return false;

    // Invalid SSN patterns
    if (digits === '000000000') return false;
    if (digits.startsWith('000')) return false;
    if (digits.substring(3, 5) === '00') return false;
    if (digits.substring(5) === '0000') return false;

    return true;
  }

  /**
   * Validate phone number format
   */
  private isValidPhoneNumber(phone: string): boolean {
    const digits = phone.replace(/\D/g, '');

    // Must be 10 digits (US format)
    if (digits.length !== 10) return false;

    // Area code cannot start with 0 or 1
    if (digits[0] === '0' || digits[0] === '1') return false;

    return true;
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    // Very basic validation - the regex should handle most of this
    return email.includes('@') && email.includes('.') && email.length > 5;
  }

  /**
   * Generate replacement text based on strategy
   */
  private generateReplacement(
    detection: PHIDetectionResult,
    options: DeidentificationOptions
  ): string {
    switch (options.replacementStrategy) {
      case 'generic':
        return `[${detection.category}]`;

      case 'consistent':
        return this.getConsistentReplacement(detection);

      case 'random':
        return this.getRandomReplacement(detection);

      default:
        return `[${detection.category}]`;
    }
  }

  /**
   * Get consistent replacement (same PHI -> same replacement)
   */
  private getConsistentReplacement(detection: PHIDetectionResult): string {
    const key = `${detection.category}:${detection.text}`;

    if (this.consistentReplacements.has(key)) {
      return this.consistentReplacements.get(key)!;
    }

    // Generate new consistent replacement
    const counter = this.replacementCounters.get(detection.category) || 0;
    this.replacementCounters.set(detection.category, counter + 1);

    const replacement = `[${detection.category}_${counter + 1}]`;
    this.consistentReplacements.set(key, replacement);

    return replacement;
  }

  /**
   * Get random replacement (for extra security)
   */
  private getRandomReplacement(detection: PHIDetectionResult): string {
    const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `[${detection.category}_${randomId}]`;
  }

  /**
   * Calculate deidentification statistics
   */
  private calculateStatistics(detections: PHIDetectionResult[]): {
    totalDetections: number;
    categoryCounts: Record<PHICategory, number>;
    confidenceAverage: number;
  } {
    const categoryCounts = {} as Record<PHICategory, number>;
    let totalConfidence = 0;

    detections.forEach(detection => {
      categoryCounts[detection.category] = (categoryCounts[detection.category] || 0) + 1;
      totalConfidence += detection.confidence;
    });

    const confidenceAverage = detections.length > 0
      ? totalConfidence / detections.length
      : 0;

    return {
      totalDetections: detections.length,
      categoryCounts,
      confidenceAverage
    };
  }

  /**
   * Clear replacement cache (for new documents)
   */
  public clearCache(): void {
    this.consistentReplacements.clear();
    this.replacementCounters.clear();
  }
}