import crypto from 'crypto';

export interface EmailGateResult {
  emailOk: boolean;
  isRepeatUser: boolean;
  message?: string;
  redirectUrl?: string;
  remainingUses?: number;
  lastUsedDate?: string;
}

export interface EmailValidationResult {
  isValid: boolean;
  isDisposable: boolean;
  errors: string[];
  warnings: string[];
  normalizedEmail: string;
}

export interface UsageRecord {
  emailHash: string;
  usageCount: number;
  firstUsed: string;
  lastUsed: string;
  ipAddresses: string[];
  features: {
    billAnalyzer: number;
    aiChat: number;
  };
}

export class EnhancedEmailGate {
  private static readonly MAX_FREE_USES = 3;
  private static readonly RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
  private static readonly MAX_REQUESTS_PER_HOUR = 10;

  // In-memory storage (in production, would use Redis or database)
  private static usageStore: Map<string, UsageRecord> = new Map();
  private static ipRateLimit: Map<string, { count: number; resetTime: number }> = new Map();
  private static disposableEmailDomains: Set<string> = new Set([
    '10minutemail.com', 'guerrillamail.com', 'mailinator.com', 'yopmail.com',
    'tempmail.org', 'maildrop.cc', 'throwaway.email', '0-mail.com'
  ]);

  public static async checkEmailAccess(email: string, ipAddress?: string): Promise<EmailGateResult> {
    console.log('🔐 Checking email gate access...');

    // Rate limiting by IP
    if (ipAddress) {
      const ipBlocked = this.checkIPRateLimit(ipAddress);
      if (!ipBlocked) {
        return {
          emailOk: false,
          isRepeatUser: false,
          message: 'Rate limit exceeded. Please try again later.',
          redirectUrl: 'https://www.mywyng.co'
        };
      }
    }

    // Validate email format and check for disposable emails
    const validation = this.validateEmail(email);
    if (!validation.isValid) {
      return {
        emailOk: false,
        isRepeatUser: false,
        message: `Email validation failed: ${validation.errors.join(', ')}`
      };
    }

    if (validation.isDisposable) {
      return {
        emailOk: false,
        isRepeatUser: false,
        message: 'Disposable email addresses are not supported. Please use a permanent email address.',
        redirectUrl: 'https://www.mywyng.co'
      };
    }

    const normalizedEmail = validation.normalizedEmail;
    const emailHash = this.hashEmail(normalizedEmail);

    // Check usage history
    const usageRecord = this.usageStore.get(emailHash);

    if (!usageRecord) {
      // New user - allow access
      console.log('✅ New user detected');
      return {
        emailOk: true,
        isRepeatUser: false,
        remainingUses: this.MAX_FREE_USES - 1
      };
    }

    // Existing user
    if (usageRecord.usageCount >= this.MAX_FREE_USES) {
      console.log('🚫 Repeat user exceeded free limit');
      return {
        emailOk: false,
        isRepeatUser: true,
        message: 'You\'ve already used the Wyng Lite free experience. You can sign up for the full version here.',
        redirectUrl: 'https://www.mywyng.co',
        lastUsedDate: usageRecord.lastUsed
      };
    }

    // Existing user with remaining uses
    const remainingUses = this.MAX_FREE_USES - usageRecord.usageCount;
    console.log(`✅ Repeat user with ${remainingUses} uses remaining`);

    return {
      emailOk: true,
      isRepeatUser: true,
      remainingUses: remainingUses - 1, // Account for current use
      lastUsedDate: usageRecord.lastUsed
    };
  }

  public static async recordUsage(
    email: string,
    feature: 'billAnalyzer' | 'aiChat',
    ipAddress?: string
  ): Promise<void> {
    const validation = this.validateEmail(email);
    if (!validation.isValid) return;

    const emailHash = this.hashEmail(validation.normalizedEmail);
    const currentTime = new Date().toISOString();

    let usageRecord = this.usageStore.get(emailHash);

    if (!usageRecord) {
      usageRecord = {
        emailHash,
        usageCount: 0,
        firstUsed: currentTime,
        lastUsed: currentTime,
        ipAddresses: ipAddress ? [ipAddress] : [],
        features: { billAnalyzer: 0, aiChat: 0 }
      };
    }

    // Update usage
    usageRecord.usageCount++;
    usageRecord.lastUsed = currentTime;
    usageRecord.features[feature]++;

    // Track IP addresses (for fraud detection)
    if (ipAddress && !usageRecord.ipAddresses.includes(ipAddress)) {
      usageRecord.ipAddresses.push(ipAddress);
      // Keep only last 5 IPs
      if (usageRecord.ipAddresses.length > 5) {
        usageRecord.ipAddresses = usageRecord.ipAddresses.slice(-5);
      }
    }

    this.usageStore.set(emailHash, usageRecord);

    console.log(`📊 Recorded usage for ${feature}: ${usageRecord.usageCount} total uses`);
  }

  public static checkIPRateLimit(ipAddress: string): boolean {
    const now = Date.now();
    const rateLimitData = this.ipRateLimit.get(ipAddress);

    if (!rateLimitData) {
      // First request from this IP
      this.ipRateLimit.set(ipAddress, {
        count: 1,
        resetTime: now + this.RATE_LIMIT_WINDOW
      });
      return true;
    }

    if (now > rateLimitData.resetTime) {
      // Reset window
      this.ipRateLimit.set(ipAddress, {
        count: 1,
        resetTime: now + this.RATE_LIMIT_WINDOW
      });
      return true;
    }

    if (rateLimitData.count >= this.MAX_REQUESTS_PER_HOUR) {
      return false; // Rate limited
    }

    // Increment count
    rateLimitData.count++;
    return true;
  }

  public static validateEmail(email: string): EmailValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Basic format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      errors.push('Invalid email format');
    }

    // Check length
    if (normalizedEmail.length > 254) {
      errors.push('Email address too long');
    }

    // Check for multiple @ symbols
    if ((normalizedEmail.match(/@/g) || []).length !== 1) {
      errors.push('Email must contain exactly one @ symbol');
    }

    // Extract domain
    const domain = normalizedEmail.split('@')[1];
    let isDisposable = false;

    if (domain) {
      // Check for disposable email domains
      isDisposable = this.disposableEmailDomains.has(domain);

      // Additional disposable domain patterns
      if (!isDisposable) {
        const disposablePatterns = [
          /\d{1,2}(minute|hour|day)mail/,
          /temp.*mail/,
          /fake.*mail/,
          /trash.*mail/,
          /guerrilla/,
          /mailinator/
        ];

        isDisposable = disposablePatterns.some(pattern => pattern.test(domain));
      }

      // Check for suspicious patterns
      if (domain.includes('example.') || domain.includes('test.')) {
        warnings.push('Email domain appears to be for testing purposes');
      }

      // Check for single-character domains (often invalid)
      if (domain.length < 4) {
        errors.push('Email domain too short');
      }
    } else {
      errors.push('No domain found in email address');
    }

    // Check local part (before @)
    const localPart = normalizedEmail.split('@')[0];
    if (localPart) {
      if (localPart.length === 0) {
        errors.push('Email local part cannot be empty');
      }

      if (localPart.length > 64) {
        errors.push('Email local part too long');
      }

      // Check for suspicious patterns in local part
      if (/^(test|temp|fake|spam|junk|dummy)/.test(localPart)) {
        warnings.push('Email appears to be for testing purposes');
      }
    }

    return {
      isValid: errors.length === 0,
      isDisposable,
      errors,
      warnings,
      normalizedEmail
    };
  }

  public static getUsageStats(): {
    totalUsers: number;
    totalUsage: number;
    featureUsage: { billAnalyzer: number; aiChat: number };
    averageUsagePerUser: number;
  } {
    const records = Array.from(this.usageStore.values());

    const totalUsers = records.length;
    const totalUsage = records.reduce((sum, record) => sum + record.usageCount, 0);
    const featureUsage = records.reduce(
      (acc, record) => ({
        billAnalyzer: acc.billAnalyzer + record.features.billAnalyzer,
        aiChat: acc.aiChat + record.features.aiChat
      }),
      { billAnalyzer: 0, aiChat: 0 }
    );

    return {
      totalUsers,
      totalUsage,
      featureUsage,
      averageUsagePerUser: totalUsers > 0 ? totalUsage / totalUsers : 0
    };
  }

  public static clearOldSessions(maxAge: number = 30 * 24 * 60 * 60 * 1000): number {
    // Clear sessions older than maxAge (default 30 days)
    const cutoffDate = new Date(Date.now() - maxAge).toISOString();
    let removedCount = 0;

    for (const [hash, record] of Array.from(this.usageStore.entries())) {
      if (record.lastUsed < cutoffDate) {
        this.usageStore.delete(hash);
        removedCount++;
      }
    }

    // Clean up IP rate limit data
    const now = Date.now();
    for (const [ip, data] of Array.from(this.ipRateLimit.entries())) {
      if (now > data.resetTime) {
        this.ipRateLimit.delete(ip);
      }
    }

    console.log(`🧹 Cleaned up ${removedCount} old email records`);
    return removedCount;
  }

  // Helper method to detect potential fraud patterns
  public static detectFraudPatterns(email: string): {
    riskScore: number; // 0-100
    flags: string[];
  } {
    const validation = this.validateEmail(email);
    const emailHash = this.hashEmail(validation.normalizedEmail);
    const usageRecord = this.usageStore.get(emailHash);

    const flags: string[] = [];
    let riskScore = 0;

    if (validation.isDisposable) {
      flags.push('Disposable email domain');
      riskScore += 30;
    }

    if (usageRecord) {
      // Multiple IP addresses might indicate account sharing
      if (usageRecord.ipAddresses.length > 3) {
        flags.push('Multiple IP addresses');
        riskScore += 20;
      }

      // High usage in short time period
      const daysSinceFirst = (Date.now() - new Date(usageRecord.firstUsed).getTime()) / (24 * 60 * 60 * 1000);
      if (usageRecord.usageCount >= 2 && daysSinceFirst < 1) {
        flags.push('High usage frequency');
        riskScore += 15;
      }

      // Unusual feature usage patterns
      const totalFeatureUsage = usageRecord.features.billAnalyzer + usageRecord.features.aiChat;
      if (totalFeatureUsage > usageRecord.usageCount * 1.5) {
        flags.push('Unusual feature usage pattern');
        riskScore += 10;
      }
    }

    // Email pattern analysis
    const localPart = validation.normalizedEmail.split('@')[0];
    if (/\d{8,}/.test(localPart)) {
      flags.push('Email contains long number sequence');
      riskScore += 10;
    }

    if (/^[a-z]{1,3}\d+$/.test(localPart)) {
      flags.push('Generic email pattern detected');
      riskScore += 10;
    }

    return {
      riskScore: Math.min(100, riskScore),
      flags
    };
  }

  private static hashEmail(email: string): string {
    // Create a hash of the email for privacy
    return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
  }

  // Method to export data for compliance (GDPR, etc.)
  public static exportUserData(email: string): UsageRecord | null {
    const validation = this.validateEmail(email);
    if (!validation.isValid) return null;

    const emailHash = this.hashEmail(validation.normalizedEmail);
    const record = this.usageStore.get(emailHash);

    if (record) {
      // Return copy without the hash
      return {
        ...record,
        emailHash: '[REDACTED]' // Don't expose the hash
      };
    }

    return null;
  }

  // Method to delete user data for compliance
  public static deleteUserData(email: string): boolean {
    const validation = this.validateEmail(email);
    if (!validation.isValid) return false;

    const emailHash = this.hashEmail(validation.normalizedEmail);
    const deleted = this.usageStore.delete(emailHash);

    if (deleted) {
      console.log('🗑️ Deleted user data for compliance request');
    }

    return deleted;
  }
}