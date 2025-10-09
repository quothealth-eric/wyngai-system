import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export interface CaseBinding {
  caseId: string;
  artifactId: string;
  artifactDigest: string;
  uploadedAt: string;
  filename: string;
  size: number;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
}

export interface WorkerResponse {
  caseId: string;
  artifactId: string;
  artifactDigest: string;
  engine: string;
  pages: number;
  docType: string;
  ocr: any;
  kvs: any[];
  tables: any[];
  metadata: any;
  ts: string;
}

export class CaseBindingManager {
  private static instance: CaseBindingManager;
  private caseBindings = new Map<string, CaseBinding[]>();
  private activeCases = new Set<string>();

  static getInstance(): CaseBindingManager {
    if (!CaseBindingManager.instance) {
      CaseBindingManager.instance = new CaseBindingManager();
    }
    return CaseBindingManager.instance;
  }

  /**
   * Generate new case ID and artifact binding
   */
  public createCaseBinding(file: File): { caseId: string; artifactBinding: CaseBinding } {
    const caseId = uuidv4();
    const artifactId = uuidv4();

    // Compute artifact digest (will be done when buffer is available)
    const artifactBinding: CaseBinding = {
      caseId,
      artifactId,
      artifactDigest: '', // Will be set when buffer is processed
      uploadedAt: new Date().toISOString(),
      filename: file.name,
      size: file.size,
      status: 'uploaded'
    };

    // Initialize case bindings array if needed
    if (!this.caseBindings.has(caseId)) {
      this.caseBindings.set(caseId, []);
    }

    this.caseBindings.get(caseId)!.push(artifactBinding);
    this.activeCases.add(caseId);

    console.log(`🔗 Created case binding: ${caseId} -> ${artifactId} (${file.name})`);
    return { caseId, artifactBinding };
  }

  /**
   * Compute and set artifact digest
   */
  public setArtifactDigest(caseId: string, artifactId: string, buffer: Buffer): void {
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');

    const caseBindings = this.caseBindings.get(caseId);
    if (caseBindings) {
      const binding = caseBindings.find(b => b.artifactId === artifactId);
      if (binding) {
        binding.artifactDigest = digest;
        console.log(`🔐 Set artifact digest: ${artifactId} -> ${digest.substring(0, 8)}...`);
      }
    }
  }

  /**
   * Validate worker response against case binding
   */
  public validateWorkerResponse(response: WorkerResponse): boolean {
    const caseBindings = this.caseBindings.get(response.caseId);
    if (!caseBindings) {
      console.warn(`⚠️ Unknown caseId in worker response: ${response.caseId}`);
      return false;
    }

    const binding = caseBindings.find(b =>
      b.artifactId === response.artifactId &&
      b.artifactDigest === response.artifactDigest
    );

    if (!binding) {
      console.warn(`⚠️ Invalid artifact binding: ${response.artifactId} with digest ${response.artifactDigest.substring(0, 8)}...`);
      return false;
    }

    console.log(`✅ Validated worker response for case ${response.caseId}`);
    return true;
  }

  /**
   * Update binding status
   */
  public updateBindingStatus(caseId: string, artifactId: string, status: CaseBinding['status']): void {
    const caseBindings = this.caseBindings.get(caseId);
    if (caseBindings) {
      const binding = caseBindings.find(b => b.artifactId === artifactId);
      if (binding) {
        binding.status = status;
      }
    }
  }

  /**
   * Get case bindings
   */
  public getCaseBindings(caseId: string): CaseBinding[] {
    return this.caseBindings.get(caseId) || [];
  }

  /**
   * Check if case is active
   */
  public isCaseActive(caseId: string): boolean {
    return this.activeCases.has(caseId);
  }

  /**
   * Clear case data (for UI state reset)
   */
  public clearCase(caseId: string): void {
    this.caseBindings.delete(caseId);
    this.activeCases.delete(caseId);
    console.log(`🧹 Cleared case data: ${caseId}`);
  }

  /**
   * Clear all cases (for session reset)
   */
  public clearAllCases(): void {
    this.caseBindings.clear();
    this.activeCases.clear();
    console.log('🧹 Cleared all case data');
  }

  /**
   * Generate line item ID with case correlation
   */
  public generateLineItemId(caseId: string, artifactId: string, code: string, description: string, dos: string, amount: number, rowIdx: number): string {
    const input = `${code}|${description}|${dos}|${amount}|${artifactId}|${rowIdx}`;
    const hash = crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
    return `${caseId}_${hash}`;
  }
}