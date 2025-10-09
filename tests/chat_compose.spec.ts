import { describe, it, expect, beforeAll } from '@jest/globals';
import { answerComposer } from '@/lib/chat/compose';
import { qakbRetriever } from '@/lib/qakb/index';
import { MergedCase, AnswerCard } from '@/types/qakb';
import { BenefitsContext } from '@/types/chat';

describe('Chat Answer Composition Tests', () => {
  let sampleCards: AnswerCard[];

  beforeAll(async () => {
    await qakbRetriever.initialize();
    sampleCards = await qakbRetriever.getCardsByTheme('Claims/Billing/EOB/Appeals');
  });

  describe('Answer Personalization', () => {
    it('should personalize answers with case financial facts', async () => {
      const mockCase: MergedCase = {
        caseId: 'test-personalization-001',
        narrative: 'I received a large medical bill',
        documents: [{
          artifactId: 'doc-001',
          filename: 'medical-bill.pdf',
          docType: 'BILL',
          pages: 1,
          ocrText: 'Medical Services - Total Billed: $5,000.00 - Insurance Paid: $3,500.00 - Your Responsibility: $1,500.00',
          ocrConf: 0.92,
          lineItems: []
        }],
        consolidatedTotals: {
          billed: 500000, // $5000 in cents
          allowed: 450000, // $4500 in cents
          planPaid: 350000, // $3500 in cents
          patientResp: 150000 // $1500 in cents
        }
      };

      const primaryCard = sampleCards[0];
      expect(primaryCard).toBeDefined();

      const result = await answerComposer.composeAnswer({
        mergedCase: mockCase,
        primaryCard,
        secondaryCards: [],
        userNarrative: mockCase.narrative
      });

      expect(result.answer).toContain('$5000.00'); // Total billed
      expect(result.answer).toContain('$1500.00'); // Patient responsibility
      expect(result.pricedSummary?.totals?.billed).toBe(500000);
      expect(result.pricedSummary?.totals?.patientResp).toBe(150000);

      console.log('✓ Answer personalized with financial facts');
    });

    it('should incorporate provider information', async () => {
      const mockCase: MergedCase = {
        caseId: 'test-provider-001',
        narrative: 'Question about my hospital bill',
        documents: [{
          artifactId: 'doc-002',
          filename: 'hospital-bill.pdf',
          docType: 'BILL',
          pages: 1,
          ocrText: 'City General Hospital - Account: 123456 - Total: $2,000.00',
          ocrConf: 0.88,
          lineItems: [],
          header: {
            providerName: 'City General Hospital',
            npi: '1234567890',
            claimId: 'CL-2024-001',
            accountId: 'ACC-123456'
          }
        }]
      };

      const primaryCard = sampleCards[0];
      const result = await answerComposer.composeAnswer({
        mergedCase: mockCase,
        primaryCard,
        secondaryCards: [],
        userNarrative: mockCase.narrative
      });

      expect(result.phoneScripts[0].body).toContain('City General Hospital');
      expect(result.appealLetters[0].body).toContain('CL-2024-001');

      console.log('✓ Provider information incorporated in scripts and letters');
    });

    it('should adapt answers for emergency scenarios', async () => {
      const mockCase: MergedCase = {
        caseId: 'test-emergency-001',
        narrative: 'Emergency room visit resulted in surprise bills',
        documents: [{
          artifactId: 'doc-003',
          filename: 'er-bill.pdf',
          docType: 'BILL',
          pages: 1,
          ocrText: 'Emergency Department - Out-of-Network Provider',
          ocrConf: 0.90,
          lineItems: []
        }],
        inferred: {
          emergency: true,
          nsaCandidate: true,
          facility: 'ER'
        }
      };

      // Get an NSA-related card
      const nsaCards = await qakbRetriever.getCardsByTheme('OON/Balance Billing');
      const nsaCard = nsaCards.find(card => card.question.includes('emergency'));
      expect(nsaCard).toBeDefined();

      if (nsaCard) {
        const result = await answerComposer.composeAnswer({
          mergedCase: mockCase,
          primaryCard: nsaCard,
          secondaryCards: [],
          userNarrative: mockCase.narrative
        });

        expect(result.answer).toContain('emergency');
        expect(result.answer).toContain('No Surprises Act');
        expect(result.checklist).toContain('Check if No Surprises Act protections apply to your emergency care');

        // Should have NSA-specific phone script
        const nsaScript = result.phoneScripts.find(ps => ps.body.includes('No Surprises Act'));
        expect(nsaScript).toBeDefined();

        // Should have NSA-specific appeal letter
        const nsaAppeal = result.appealLetters.find(al => al.body.includes('No Surprises Act'));
        expect(nsaAppeal).toBeDefined();

        console.log('✓ Emergency scenario adaptations applied');
      }
    });
  });

  describe('Benefits Integration', () => {
    it('should incorporate deductible information', async () => {
      const mockCase: MergedCase = {
        caseId: 'test-benefits-001',
        narrative: 'Why am I paying so much out of pocket?',
        documents: [],
        consolidatedTotals: {
          billed: 150000, // $1500
          allowed: 150000,
          planPaid: 100000, // $1000
          patientResp: 50000 // $500
        }
      };

      const benefits: BenefitsContext = {
        planType: 'HDHP',
        deductible: {
          individual: 200000 // $2000 deductible in cents
        },
        coinsurance: 20
      };

      const costCard = await qakbRetriever.getCardsByTheme('Costs');
      expect(costCard.length).toBeGreaterThan(0);

      const result = await answerComposer.composeAnswer({
        mergedCase: mockCase,
        primaryCard: costCard[0],
        secondaryCards: [],
        benefits,
        userNarrative: mockCase.narrative
      });

      expect(result.answer).toContain('HDHP');
      expect(result.answer).toContain('$2000.00'); // Deductible amount
      expect(result.checklist).toContain('Check how much you have paid toward your $2000.00 deductible this year');

      console.log('✓ Deductible information integrated');
    });

    it('should adapt for different plan types', async () => {
      const mockCase: MergedCase = {
        caseId: 'test-plan-type-001',
        narrative: 'Need referral for specialist',
        documents: []
      };

      const hmoCase = {
        planType: 'HMO' as const,
        referralRequired: true
      };

      const ppoCase = {
        planType: 'PPO' as const,
        referralRequired: false
      };

      const networkCards = await qakbRetriever.getCardsByTheme('Networks & Access');
      const referralCard = networkCards.find(card => card.question.includes('referral'));
      expect(referralCard).toBeDefined();

      if (referralCard) {
        // Test HMO scenario
        const hmoResult = await answerComposer.composeAnswer({
          mergedCase: mockCase,
          primaryCard: referralCard,
          secondaryCards: [],
          benefits: hmoCase,
          userNarrative: mockCase.narrative
        });

        expect(hmoResult.answer).toContain('HMO');

        // Test PPO scenario
        const ppoResult = await answerComposer.composeAnswer({
          mergedCase: mockCase,
          primaryCard: referralCard,
          secondaryCards: [],
          benefits: ppoCase,
          userNarrative: mockCase.narrative
        });

        expect(ppoResult.answer).toContain('PPO');

        console.log('✓ Plan type adaptations applied');
      }
    });
  });

  describe('Checklist Generation', () => {
    it('should generate case-specific checklist items', async () => {
      const mockCase: MergedCase = {
        caseId: 'test-checklist-001',
        narrative: 'Comparing EOB to provider bill',
        documents: [
          {
            artifactId: 'doc-eob',
            filename: 'eob.pdf',
            docType: 'EOB',
            pages: 1,
            ocrText: 'Explanation of Benefits',
            ocrConf: 0.9,
            lineItems: []
          },
          {
            artifactId: 'doc-bill',
            filename: 'bill.pdf',
            docType: 'BILL',
            pages: 1,
            ocrText: 'Medical Bill',
            ocrConf: 0.9,
            lineItems: []
          }
        ],
        matchedLineItems: [
          {
            lineId: 'line-001',
            code: { value: '99213', system: 'CPT', confidence: 0.9 },
            description: 'Office Visit',
            confidence: 0.85
          }
        ],
        consolidatedTotals: {
          billed: 200000, // $2000
          allowed: 150000, // $1500
          planPaid: 120000, // $1200
          patientResp: 30000 // $300
        }
      };

      const primaryCard = sampleCards[0];
      const result = await answerComposer.composeAnswer({
        mergedCase: mockCase,
        primaryCard,
        secondaryCards: [],
        userNarrative: mockCase.narrative
      });

      expect(result.checklist).toContain('Compare your EOB amounts to your provider bill amounts');
      expect(result.checklist.some(item => item.includes('99213'))).toBe(true);
      expect(result.checklist.length).toBeGreaterThan(primaryCard.checklist.length);

      console.log('✓ Case-specific checklist items generated');
      console.log(`  Original: ${primaryCard.checklist.length}, Enhanced: ${result.checklist.length}`);
    });

    it('should add high-value bill checklist items', async () => {
      const mockCase: MergedCase = {
        caseId: 'test-high-value-001',
        narrative: 'Received a very expensive medical bill',
        documents: [],
        consolidatedTotals: {
          billed: 500000, // $5000
          allowed: 400000,
          planPaid: 250000,
          patientResp: 150000 // $1500
        }
      };

      const primaryCard = sampleCards[0];
      const result = await answerComposer.composeAnswer({
        mergedCase: mockCase,
        primaryCard,
        secondaryCards: [],
        userNarrative: mockCase.narrative
      });

      const hasFinancialAssistanceItem = result.checklist.some(item =>
        item.includes('financial assistance') || item.includes('payment plan')
      );
      expect(hasFinancialAssistanceItem).toBe(true);

      console.log('✓ High-value bill checklist items added');
    });
  });

  describe('Phone Script Personalization', () => {
    it('should personalize scripts with case details', async () => {
      const mockCase: MergedCase = {
        caseId: 'test-script-001',
        narrative: 'Need to call about claim',
        documents: [{
          artifactId: 'doc-001',
          filename: 'claim-details.pdf',
          docType: 'EOB',
          pages: 1,
          ocrText: 'Claim processed',
          ocrConf: 0.9,
          lineItems: [],
          header: {
            providerName: 'Dr. Smith Medical Practice',
            claimId: 'CL-2024-12345'
          }
        }],
        matchedLineItems: [{
          lineId: 'line-001',
          description: 'Annual Physical Exam',
          confidence: 0.9
        }]
      };

      const primaryCard = sampleCards[0];
      const result = await answerComposer.composeAnswer({
        mergedCase: mockCase,
        primaryCard,
        secondaryCards: [],
        userNarrative: mockCase.narrative
      });

      const primaryScript = result.phoneScripts[0];
      expect(primaryScript.body).toContain('CL-2024-12345');
      expect(primaryScript.body).toContain('Dr. Smith Medical Practice');

      console.log('✓ Phone script personalized with case details');
    });

    it('should generate multiple relevant scripts', async () => {
      const mockCase: MergedCase = {
        caseId: 'test-multi-script-001',
        narrative: 'EOB and bill amounts don\'t match, plus potential NSA issue',
        documents: [
          {
            artifactId: 'doc-eob',
            filename: 'eob.pdf',
            docType: 'EOB',
            pages: 1,
            ocrText: 'EOB content',
            ocrConf: 0.9,
            lineItems: []
          },
          {
            artifactId: 'doc-bill',
            filename: 'bill.pdf',
            docType: 'BILL',
            pages: 1,
            ocrText: 'Bill content',
            ocrConf: 0.9,
            lineItems: []
          }
        ],
        consolidatedTotals: {
          billed: 300000,
          planPaid: 200000,
          patientResp: 100000
        },
        inferred: {
          nsaCandidate: true
        }
      };

      const primaryCard = sampleCards[0];
      const result = await answerComposer.composeAnswer({
        mergedCase: mockCase,
        primaryCard,
        secondaryCards: [],
        userNarrative: mockCase.narrative
      });

      expect(result.phoneScripts.length).toBeGreaterThan(1);

      const hasDiscrepancyScript = result.phoneScripts.some(ps =>
        ps.title.includes('Discrepancy') || ps.body.includes('don\'t match')
      );
      const hasNSAScript = result.phoneScripts.some(ps =>
        ps.title.includes('Surprises') || ps.body.includes('No Surprises Act')
      );

      expect(hasDiscrepancyScript).toBe(true);
      expect(hasNSAScript).toBe(true);

      console.log('✓ Multiple relevant phone scripts generated');
    });
  });

  describe('Appeal Letter Generation', () => {
    it('should generate formal appeal with case specifics', async () => {
      const mockCase: MergedCase = {
        caseId: 'test-appeal-001',
        narrative: 'Need to appeal denied claim',
        documents: [{
          artifactId: 'doc-001',
          filename: 'denial-notice.pdf',
          docType: 'EOB',
          pages: 1,
          ocrText: 'Claim denied - not medically necessary',
          ocrConf: 0.9,
          lineItems: [],
          header: {
            claimId: 'CL-2024-APPEAL-001'
          }
        }],
        matchedLineItems: [
          {
            lineId: 'line-001',
            code: { value: '99214', system: 'CPT', confidence: 0.9 },
            description: 'Office Visit Level 4',
            charges: { billed: 25000 },
            confidence: 0.9
          },
          {
            lineId: 'line-002',
            code: { value: '80053', system: 'CPT', confidence: 0.9 },
            description: 'Comprehensive Metabolic Panel',
            charges: { billed: 15000 },
            confidence: 0.9
          }
        ],
        consolidatedTotals: {
          billed: 40000, // $400
          patientResp: 40000
        }
      };

      const appealCard = sampleCards.find(card =>
        card.question.toLowerCase().includes('appeal')
      );
      expect(appealCard).toBeDefined();

      if (appealCard) {
        const result = await answerComposer.composeAnswer({
          mergedCase: mockCase,
          primaryCard: appealCard,
          secondaryCards: [],
          userNarrative: mockCase.narrative
        });

        const formalAppeal = result.appealLetters.find(al =>
          al.title.includes('Formal')
        );
        expect(formalAppeal).toBeDefined();

        if (formalAppeal) {
          expect(formalAppeal.body).toContain('CL-2024-APPEAL-001');
          expect(formalAppeal.body).toContain('Office Visit Level 4');
          expect(formalAppeal.body).toContain('99214');
          expect(formalAppeal.body).toContain('Comprehensive Metabolic Panel');
          expect(formalAppeal.body).toContain('80053');
          expect(formalAppeal.body).toContain('$400.00');

          console.log('✓ Formal appeal letter with case specifics generated');
        }
      }
    });

    it('should generate NSA-specific appeal when applicable', async () => {
      const mockCase: MergedCase = {
        caseId: 'test-nsa-appeal-001',
        narrative: 'Emergency surprise bill appeal',
        documents: [{
          artifactId: 'doc-001',
          filename: 'surprise-bill.pdf',
          docType: 'BILL',
          pages: 1,
          ocrText: 'Emergency services - out-of-network provider',
          ocrConf: 0.9,
          lineItems: [],
          header: {
            providerName: 'Emergency Specialists Group',
            claimId: 'CL-2024-ER-001'
          }
        }],
        inferred: {
          emergency: true,
          nsaCandidate: true,
          facility: 'ER'
        }
      };

      const nsaCards = await qakbRetriever.getCardsByTheme('OON/Balance Billing');
      const nsaCard = nsaCards[0];

      const result = await answerComposer.composeAnswer({
        mergedCase: mockCase,
        primaryCard: nsaCard,
        secondaryCards: [],
        userNarrative: mockCase.narrative
      });

      const nsaAppeal = result.appealLetters.find(al =>
        al.title.includes('No Surprises Act')
      );
      expect(nsaAppeal).toBeDefined();

      if (nsaAppeal) {
        expect(nsaAppeal.body).toContain('No Surprises Act');
        expect(nsaAppeal.body).toContain('21st Century Cures Act');
        expect(nsaAppeal.body).toContain('emergency care');
        expect(nsaAppeal.body).toContain('Emergency Specialists Group');
        expect(nsaAppeal.body).toContain('CL-2024-ER-001');

        console.log('✓ NSA-specific appeal letter generated');
      }
    });
  });

  describe('Source Citation Consolidation', () => {
    it('should consolidate citations with proper authority hierarchy', async () => {
      const mockCase: MergedCase = {
        caseId: 'test-citations-001',
        narrative: 'Multiple citation scenario',
        documents: []
      };

      const primaryCard = sampleCards[0];
      const secondaryCards = sampleCards.slice(1, 4);

      const result = await answerComposer.composeAnswer({
        mergedCase: mockCase,
        primaryCard,
        secondaryCards,
        userNarrative: mockCase.narrative
      });

      expect(result.sources.length).toBeGreaterThan(0);

      // Check authority hierarchy
      let lastAuthorityOrder = 0;
      const authorityOrder = { 'Federal': 1, 'CMS': 2, 'StateDOI': 3, 'PayerPolicy': 4 };

      for (const source of result.sources) {
        const currentOrder = authorityOrder[source.authority];
        expect(currentOrder).toBeGreaterThanOrEqual(lastAuthorityOrder);
        lastAuthorityOrder = currentOrder;
      }

      // Should not have duplicate citations
      const citationKeys = result.sources.map(s => `${s.authority}-${s.title}`);
      const uniqueKeys = new Set(citationKeys);
      expect(citationKeys.length).toBe(uniqueKeys.size);

      console.log('✓ Citations consolidated with proper hierarchy');
      console.log(`  Total sources: ${result.sources.length}`);
      console.log(`  Authorities: ${result.sources.map(s => s.authority).join(', ')}`);
    });
  });

  describe('Confidence Calculation', () => {
    it('should calculate confidence based on OCR and card quality', async () => {
      const highConfidenceCase: MergedCase = {
        caseId: 'test-confidence-high',
        narrative: 'Clear case scenario',
        documents: [{
          artifactId: 'doc-001',
          filename: 'clear-document.pdf',
          docType: 'EOB',
          pages: 1,
          ocrText: 'High quality OCR text',
          ocrConf: 0.95, // High OCR confidence
          lineItems: []
        }]
      };

      const lowConfidenceCase: MergedCase = {
        caseId: 'test-confidence-low',
        narrative: 'Unclear case scenario',
        documents: [{
          artifactId: 'doc-002',
          filename: 'blurry-document.pdf',
          docType: 'UNKNOWN',
          pages: 1,
          ocrText: 'Poor quality OCR text',
          ocrConf: 0.60, // Low OCR confidence
          lineItems: []
        }]
      };

      const primaryCard = sampleCards[0];

      const highResult = await answerComposer.composeAnswer({
        mergedCase: highConfidenceCase,
        primaryCard,
        secondaryCards: [],
        userNarrative: highConfidenceCase.narrative
      });

      const lowResult = await answerComposer.composeAnswer({
        mergedCase: lowConfidenceCase,
        primaryCard,
        secondaryCards: [],
        userNarrative: lowConfidenceCase.narrative
      });

      expect(highResult.confidence.overall).toBeGreaterThan(lowResult.confidence.overall);
      expect(highResult.confidence.ocr).toBe(0.95);
      expect(lowResult.confidence.ocr).toBe(0.60);

      console.log('✓ Confidence calculation reflects OCR and card quality');
      console.log(`  High confidence case: ${highResult.confidence.overall}`);
      console.log(`  Low confidence case: ${lowResult.confidence.overall}`);
    });
  });
});