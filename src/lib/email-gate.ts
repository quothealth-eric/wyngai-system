import crypto from 'crypto';

interface EmailGateResult {
  emailOk: boolean;
  message?: string;
  redirectUrl?: string;
}

export class EmailGate {
  private static readonly SALT = process.env.EMAIL_GATE_SALT || 'wyng-lite-email-salt-2024';
  private static readonly REDIRECT_URL = 'https://getwyng.co';
  private static usageStore = new Map<string, { count: number; firstUse: Date }>();

  public static async checkEmailAccess(email: string): Promise<EmailGateResult> {
    try {
      // Hash the email for privacy
      const emailHash = this.hashEmail(email);

      // Check usage in our simple in-memory store
      // In production, this would be a proper KV store like Vercel KV or Redis
      const usage = this.usageStore.get(emailHash);

      if (!usage) {
        // First time user - allow access and record usage
        this.usageStore.set(emailHash, { count: 1, firstUse: new Date() });
        return { emailOk: true };
      }

      // User has used the service before
      return {
        emailOk: false,
        message: "Looks like you've already used the free version. You can sign up for the full Wyng experience here.",
        redirectUrl: this.REDIRECT_URL
      };

    } catch (error) {
      console.error('Email gate check failed:', error);
      // On error, allow access (fail open)
      return { emailOk: true };
    }
  }

  public static async recordUsage(email: string): Promise<void> {
    try {
      const emailHash = this.hashEmail(email);
      const usage = this.usageStore.get(emailHash);

      if (usage) {
        usage.count += 1;
      } else {
        this.usageStore.set(emailHash, { count: 1, firstUse: new Date() });
      }
    } catch (error) {
      console.error('Failed to record email usage:', error);
    }
  }

  public static async checkIPRateLimit(ip: string): Promise<boolean> {
    // Simple IP-based rate limiting as secondary protection
    const ipKey = `ip_${ip}`;
    const usage = this.usageStore.get(ipKey);
    const now = new Date();
    const oneHour = 60 * 60 * 1000;

    if (!usage) {
      this.usageStore.set(ipKey, { count: 1, firstUse: now });
      return true;
    }

    // Reset counter if more than an hour has passed
    if (now.getTime() - usage.firstUse.getTime() > oneHour) {
      this.usageStore.set(ipKey, { count: 1, firstUse: now });
      return true;
    }

    // Allow up to 10 requests per hour per IP
    if (usage.count >= 10) {
      return false;
    }

    usage.count += 1;
    return true;
  }

  private static hashEmail(email: string): string {
    return crypto
      .createHash('sha256')
      .update(email.toLowerCase() + this.SALT)
      .digest('hex');
  }

  // Method to clean up old entries (call periodically)
  public static cleanupOldEntries(): void {
    const now = new Date();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    Array.from(this.usageStore.entries()).forEach(([key, usage]) => {
      if (now.getTime() - usage.firstUse.getTime() > oneWeek) {
        this.usageStore.delete(key);
      }
    });
  }
}

// Cleanup old entries every hour (in a real app, this would be a cron job)
if (typeof window === 'undefined') { // Server-side only
  setInterval(() => {
    EmailGate.cleanupOldEntries();
  }, 60 * 60 * 1000);
}