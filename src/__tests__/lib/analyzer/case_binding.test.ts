import { CaseBindingManager, WorkerResponse } from '@/lib/case-binding';

describe('Case Binding System - Prevents Cross-Contamination', () => {
  let caseManager: CaseBindingManager;

  beforeEach(() => {
    caseManager = CaseBindingManager.getInstance();
    caseManager.clearAllCases();
  });

  describe('Case correlation and artifact validation', () => {
    it('should create unique case bindings for each upload', () => {
      const hospitalBillFile = new File(['hospital data'], 'hospital_bill.pdf', { type: 'application/pdf' });
      const eobFile = new File(['eob data'], 'office_eob.pdf', { type: 'application/pdf' });

      const { caseId: caseA, artifactBinding: artifactA } = caseManager.createCaseBinding(hospitalBillFile);
      const { caseId: caseB, artifactBinding: artifactB } = caseManager.createCaseBinding(eobFile);

      // Cases should have unique IDs
      expect(caseA).not.toBe(caseB);
      expect(artifactA.artifactId).not.toBe(artifactB.artifactId);

      // Both cases should be active
      expect(caseManager.isCaseActive(caseA)).toBe(true);
      expect(caseManager.isCaseActive(caseB)).toBe(true);
    });

    it('should validate artifact digests correctly', () => {
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const { caseId, artifactBinding } = caseManager.createCaseBinding(file);

      const buffer = Buffer.from('test content');
      caseManager.setArtifactDigest(caseId, artifactBinding.artifactId, buffer);

      const updatedBinding = caseManager.getCaseBindings(caseId)[0];
      expect(updatedBinding.artifactDigest).toBeDefined();
      expect(updatedBinding.artifactDigest.length).toBe(64); // SHA256 hash length
    });

    it('should reject worker responses with mismatched digests', () => {
      const file = new File(['correct content'], 'test.pdf', { type: 'application/pdf' });
      const { caseId, artifactBinding } = caseManager.createCaseBinding(file);

      const correctBuffer = Buffer.from('correct content');
      caseManager.setArtifactDigest(caseId, artifactBinding.artifactId, correctBuffer);

      // Create worker response with different digest (simulating corruption/tampering)
      const wrongResponse: WorkerResponse = {
        caseId,
        artifactId: artifactBinding.artifactId,
        artifactDigest: 'wrong-digest-hash-value',
        engine: 'test',
        pages: 1,
        docType: 'BILL',
        ocr: {},
        kvs: [],
        tables: [],
        metadata: {},
        ts: new Date().toISOString()
      };

      expect(caseManager.validateWorkerResponse(wrongResponse)).toBe(false);
    });

    it('should accept worker responses with correct case/artifact correlation', () => {
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const { caseId, artifactBinding } = caseManager.createCaseBinding(file);

      const buffer = Buffer.from('test content');
      caseManager.setArtifactDigest(caseId, artifactBinding.artifactId, buffer);

      const updatedBinding = caseManager.getCaseBindings(caseId)[0];

      const correctResponse: WorkerResponse = {
        caseId,
        artifactId: artifactBinding.artifactId,
        artifactDigest: updatedBinding.artifactDigest,
        engine: 'test',
        pages: 1,
        docType: 'BILL',
        ocr: {},
        kvs: [],
        tables: [],
        metadata: {},
        ts: new Date().toISOString()
      };

      expect(caseManager.validateWorkerResponse(correctResponse)).toBe(true);
    });
  });

  describe('Job sequence handling for out-of-order messages', () => {
    it('should handle sequential job sequences correctly', () => {
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const { caseId, artifactBinding } = caseManager.createCaseBinding(file);

      const jobSeq1 = caseManager.getNextJobSeq(caseId);
      const jobSeq2 = caseManager.getNextJobSeq(caseId);
      const jobSeq3 = caseManager.getNextJobSeq(caseId);

      expect(jobSeq1).toBe(1);
      expect(jobSeq2).toBe(2);
      expect(jobSeq3).toBe(3);
    });

    it('should reject out-of-order worker responses', () => {
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const { caseId, artifactBinding } = caseManager.createCaseBinding(file);

      const buffer = Buffer.from('test content');
      caseManager.setArtifactDigest(caseId, artifactBinding.artifactId, buffer);

      // Set expected job sequence
      caseManager.setArtifactJobSeq(caseId, artifactBinding.artifactId, 5);

      const updatedBinding = caseManager.getCaseBindings(caseId)[0];

      // Worker response with older job sequence (out of order)
      const oldResponse: WorkerResponse = {
        caseId,
        artifactId: artifactBinding.artifactId,
        artifactDigest: updatedBinding.artifactDigest,
        engine: 'test',
        pages: 1,
        docType: 'BILL',
        ocr: {},
        kvs: [],
        tables: [],
        metadata: {},
        ts: new Date().toISOString(),
        jobSeq: 3 // Older than expected 5
      };

      expect(caseManager.validateWorkerResponse(oldResponse)).toBe(false);

      // Worker response with current or newer job sequence should be accepted
      const currentResponse: WorkerResponse = {
        ...oldResponse,
        jobSeq: 5
      };

      expect(caseManager.validateWorkerResponse(currentResponse)).toBe(true);
    });
  });

  describe('Multi-upload scenario isolation', () => {
    it('should maintain separate contexts for rapid successive uploads', async () => {
      // Simulate rapid uploads (hospital bill then EOB)
      const hospitalFile = new File(['hospital content'], 'hospital.pdf', { type: 'application/pdf' });
      const eobFile = new File(['eob content'], 'eob.pdf', { type: 'application/pdf' });

      const { caseId: hospitalCaseId, artifactBinding: hospitalArtifact } =
        caseManager.createCaseBinding(hospitalFile);

      // Small delay to simulate real upload timing
      await new Promise(resolve => setTimeout(resolve, 10));

      const { caseId: eobCaseId, artifactBinding: eobArtifact } =
        caseManager.createCaseBinding(eobFile);

      // Set digests
      const hospitalBuffer = Buffer.from('hospital content');
      const eobBuffer = Buffer.from('eob content');

      caseManager.setArtifactDigest(hospitalCaseId, hospitalArtifact.artifactId, hospitalBuffer);
      caseManager.setArtifactDigest(eobCaseId, eobArtifact.artifactId, eobBuffer);

      // Verify isolation
      const hospitalBindings = caseManager.getCaseBindings(hospitalCaseId);
      const eobBindings = caseManager.getCaseBindings(eobCaseId);

      expect(hospitalBindings).toHaveLength(1);
      expect(eobBindings).toHaveLength(1);
      expect(hospitalBindings[0].filename).toBe('hospital.pdf');
      expect(eobBindings[0].filename).toBe('eob.pdf');

      // Cross-validation should fail
      const hospitalBinding = hospitalBindings[0];
      const eobBinding = eobBindings[0];

      const crossContaminatedResponse: WorkerResponse = {
        caseId: hospitalCaseId, // Hospital case
        artifactId: eobArtifact.artifactId, // But EOB artifact
        artifactDigest: eobBinding.artifactDigest,
        engine: 'test',
        pages: 1,
        docType: 'EOB',
        ocr: {},
        kvs: [],
        tables: [],
        metadata: {},
        ts: new Date().toISOString()
      };

      expect(caseManager.validateWorkerResponse(crossContaminatedResponse)).toBe(false);
    });

    it('should maintain lineId uniqueness across cases', () => {
      const file1 = new File(['content1'], 'doc1.pdf', { type: 'application/pdf' });
      const file2 = new File(['content2'], 'doc2.pdf', { type: 'application/pdf' });

      const { caseId: case1 } = caseManager.createCaseBinding(file1);
      const { caseId: case2 } = caseManager.createCaseBinding(file2);

      // Generate line IDs for same content but different cases
      const lineId1 = caseManager.generateLineItemId(
        case1,
        'artifact1',
        '99213',
        'Office visit',
        '2024-03-15',
        8500,
        1
      );

      const lineId2 = caseManager.generateLineItemId(
        case2,
        'artifact2',
        '99213',
        'Office visit',
        '2024-03-15',
        8500,
        1
      );

      // Line IDs should be different despite same content
      expect(lineId1).not.toBe(lineId2);
      expect(lineId1).toContain(case1);
      expect(lineId2).toContain(case2);
    });
  });

  describe('Case cleanup and memory management', () => {
    it('should properly clean up individual cases', () => {
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const { caseId } = caseManager.createCaseBinding(file);

      expect(caseManager.isCaseActive(caseId)).toBe(true);

      caseManager.clearCase(caseId);

      expect(caseManager.isCaseActive(caseId)).toBe(false);
      expect(caseManager.getCaseBindings(caseId)).toHaveLength(0);
    });

    it('should clean up all cases for session reset', () => {
      const file1 = new File(['test1'], 'test1.pdf', { type: 'application/pdf' });
      const file2 = new File(['test2'], 'test2.pdf', { type: 'application/pdf' });

      const { caseId: case1 } = caseManager.createCaseBinding(file1);
      const { caseId: case2 } = caseManager.createCaseBinding(file2);

      expect(caseManager.isCaseActive(case1)).toBe(true);
      expect(caseManager.isCaseActive(case2)).toBe(true);

      caseManager.clearAllCases();

      expect(caseManager.isCaseActive(case1)).toBe(false);
      expect(caseManager.isCaseActive(case2)).toBe(false);
    });
  });
});