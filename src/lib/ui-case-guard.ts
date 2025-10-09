/**
 * UI Case Guard - Prevents case mixups and manages state isolation
 */

export interface CaseState {
  caseId: string | null;
  artifactDigest: string | null;
  processingState: 'idle' | 'uploading' | 'processing' | 'completed' | 'error';
  results: any | null;
  lastActivity: number;
}

export class UICaseGuard {
  private static instance: UICaseGuard;
  private currentCase: CaseState = {
    caseId: null,
    artifactDigest: null,
    processingState: 'idle',
    results: null,
    lastActivity: Date.now()
  };

  private stateChangeListeners: ((state: CaseState) => void)[] = [];

  static getInstance(): UICaseGuard {
    if (!UICaseGuard.instance) {
      UICaseGuard.instance = new UICaseGuard();
    }
    return UICaseGuard.instance;
  }

  /**
   * Start new case - clears previous state
   */
  public startNewCase(caseId: string): void {
    console.log(`🆕 Starting new case: ${caseId}`);

    // Clear previous state completely
    this.clearCurrentCase();

    this.currentCase = {
      caseId,
      artifactDigest: null,
      processingState: 'uploading',
      results: null,
      lastActivity: Date.now()
    };

    this.notifyStateChange();
  }

  /**
   * Set artifact digest for validation
   */
  public setArtifactDigest(caseId: string, digest: string): void {
    if (this.currentCase.caseId !== caseId) {
      console.warn(`⚠️ Digest update for wrong case: expected ${this.currentCase.caseId}, got ${caseId}`);
      return;
    }

    this.currentCase.artifactDigest = digest;
    this.currentCase.lastActivity = Date.now();
    this.notifyStateChange();
  }

  /**
   * Update processing state
   */
  public updateProcessingState(caseId: string, state: CaseState['processingState']): void {
    if (this.currentCase.caseId !== caseId) {
      console.warn(`⚠️ State update for wrong case: expected ${this.currentCase.caseId}, got ${caseId}`);
      return;
    }

    this.currentCase.processingState = state;
    this.currentCase.lastActivity = Date.now();
    this.notifyStateChange();
  }

  /**
   * Validate and set results - strict case correlation check
   */
  public setResults(caseId: string, artifactDigest: string, results: any): boolean {
    // Strict validation
    if (this.currentCase.caseId !== caseId) {
      console.warn(`⚠️ Results for wrong case: expected ${this.currentCase.caseId}, got ${caseId}`);
      return false;
    }

    // Validate artifact digest (first 8 chars to match API response)
    const expectedDigest = this.currentCase.artifactDigest?.substring(0, 8);
    const receivedDigest = artifactDigest.substring(0, 8);

    if (expectedDigest && expectedDigest !== receivedDigest) {
      console.warn(`⚠️ Artifact digest mismatch: expected ${expectedDigest}, got ${receivedDigest}`);
      return false;
    }

    // All validations passed - safe to set results
    this.currentCase.results = results;
    this.currentCase.processingState = 'completed';
    this.currentCase.lastActivity = Date.now();
    this.notifyStateChange();

    console.log(`✅ Results validated and set for case ${caseId}`);
    return true;
  }

  /**
   * Check if case is active
   */
  public isCaseActive(caseId: string): boolean {
    return this.currentCase.caseId === caseId;
  }

  /**
   * Get current case state
   */
  public getCurrentState(): CaseState {
    return { ...this.currentCase };
  }

  /**
   * Clear current case state
   */
  public clearCurrentCase(): void {
    const oldCaseId = this.currentCase.caseId;
    this.currentCase = {
      caseId: null,
      artifactDigest: null,
      processingState: 'idle',
      results: null,
      lastActivity: Date.now()
    };

    if (oldCaseId) {
      console.log(`🧹 Cleared case state: ${oldCaseId}`);
    }

    this.notifyStateChange();
  }

  /**
   * Subscribe to state changes
   */
  public onStateChange(listener: (state: CaseState) => void): () => void {
    this.stateChangeListeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.stateChangeListeners.indexOf(listener);
      if (index > -1) {
        this.stateChangeListeners.splice(index, 1);
      }
    };
  }

  /**
   * Block rendering from stale messages
   */
  public shouldBlockRender(messageData: any): boolean {
    if (!messageData.caseId) {
      console.warn('⚠️ Message without caseId - blocking render');
      return true;
    }

    if (messageData.caseId !== this.currentCase.caseId) {
      console.warn(`⚠️ Stale message from case ${messageData.caseId} - blocking render`);
      return true;
    }

    if (messageData.artifactDigest) {
      const expectedDigest = this.currentCase.artifactDigest?.substring(0, 8);
      const messageDigest = messageData.artifactDigest.substring(0, 8);

      if (expectedDigest && expectedDigest !== messageDigest) {
        console.warn(`⚠️ Message with wrong artifact digest - blocking render`);
        return true;
      }
    }

    return false;
  }

  /**
   * Auto-cleanup stale cases (call periodically)
   */
  public cleanupStaleCases(maxAgeMs: number = 5 * 60 * 1000): void {
    const now = Date.now();
    if (this.currentCase.caseId && (now - this.currentCase.lastActivity) > maxAgeMs) {
      console.log(`🧹 Auto-cleaning stale case: ${this.currentCase.caseId}`);
      this.clearCurrentCase();
    }
  }

  private notifyStateChange(): void {
    const state = this.getCurrentState();
    this.stateChangeListeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('Error in state change listener:', error);
      }
    });
  }
}

/**
 * React hook for using case guard
 */
export function useCaseGuard() {
  const guard = UICaseGuard.getInstance();

  return {
    startNewCase: (caseId: string) => guard.startNewCase(caseId),
    setArtifactDigest: (caseId: string, digest: string) => guard.setArtifactDigest(caseId, digest),
    updateProcessingState: (caseId: string, state: CaseState['processingState']) =>
      guard.updateProcessingState(caseId, state),
    setResults: (caseId: string, artifactDigest: string, results: any) =>
      guard.setResults(caseId, artifactDigest, results),
    isCaseActive: (caseId: string) => guard.isCaseActive(caseId),
    getCurrentState: () => guard.getCurrentState(),
    clearCurrentCase: () => guard.clearCurrentCase(),
    shouldBlockRender: (messageData: any) => guard.shouldBlockRender(messageData),
    onStateChange: (listener: (state: CaseState) => void) => guard.onStateChange(listener)
  };
}