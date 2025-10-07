import { describe, it, expect, beforeAll } from '@jest/globals';
import { qakbRetriever, QAKBRetriever } from '@/lib/qakb/index';
import { themeRouter } from '@/lib/chat/router';
import { OCRProcessor } from '@/lib/chat/ocr';
import { answerComposer } from '@/lib/chat/compose';
import { AnswerCard, QAKBQuery, MergedCase } from '@/types/qakb';
import { DocumentArtifact } from '@/types/chat';

describe('QAKB Coverage and Composition Tests', () => {
  beforeAll(async () => {
    // Initialize the QAKB retriever
    await qakbRetriever.initialize();
  });

  describe('QAKB Card Coverage', () => {
    it('should have cards for all major themes', async () => {
      const allThemes = await qakbRetriever.getAllThemes();

      // Essential themes that should be covered
      const essentialThemes = [
        'Claims/Billing/EOB/Appeals',
        'OON/Balance Billing',
        'Costs',
        'Networks & Access',
        'Plan Types & Choosing',
        'Government Programs',
        'Prescriptions'
      ];

      for (const theme of essentialThemes) {
        const themeCards = await qakbRetriever.getCardsByTheme(theme);
        expect(themeCards.length).toBeGreaterThan(0);
        console.log(`✓ ${theme}: ${themeCards.length} cards`);
      }
    });

    it('should have high-priority questions covered', async () => {
      const highPriorityQuestions = [
        'How do I read my Explanation of Benefits (EOB)?',
        'Why was my claim denied?',
        'How do I appeal a claim denial?',
        'What is the No Surprises Act?',
        'Can I be balance billed for emergency care?',
        'What\'s the difference between a copay and coinsurance?'
      ];

      for (const question of highPriorityQuestions) {
        // Search for cards that match this question
        const result = await qakbRetriever.retrieveAnswers({
          narrative: question,
          themes: [],
          caseContext: {
            hasDocuments: false,
            hasClaims: false,
            hasLineItems: false
          }
        });

        expect(result.primaryCard).toBeDefined();
        expect(result.primaryCard.question.toLowerCase()).toContain(
          question.toLowerCase().split(' ').slice(0, 3).join(' ')
        );
        console.log(`✓ Question covered: ${question}`);
      }
    });

    it('should have proper citation authority hierarchy', async () => {
      const allThemes = await qakbRetriever.getAllThemes();

      for (const theme of allThemes.slice(0, 5)) { // Test subset
        const cards = await qakbRetriever.getCardsByTheme(theme);

        for (const card of cards.slice(0, 2)) { // Test subset of cards
          expect(card.sources).toBeDefined();
          expect(card.sources.length).toBeGreaterThan(0);

          // Check authority hierarchy
          const authorities = card.sources.map(s => s.authority);
          const hasValidAuthority = authorities.every(auth =>
            ['Federal', 'CMS', 'StateDOI', 'PayerPolicy'].includes(auth)
          );
          expect(hasValidAuthority).toBe(true);

          console.log(`✓ ${theme} card has valid citations: ${authorities.join(', ')}`);
        }
      }
    });
  });

  describe('Theme Classification', () => {
    it('should classify emergency scenarios correctly', async () => {
      const emergencyNarrative = 'I went to the emergency room and got a surprise bill from an out-of-network doctor';

      const classification = await themeRouter.classifyThemes(emergencyNarrative);

      expect(classification.themes).toContain('OON/Balance Billing');
      expect(classification.confidence).toBeGreaterThan(0.5);

      console.log(`✓ Emergency scenario classified: ${classification.themes.join(', ')}`);
    });

    it('should classify EOB questions correctly', async () => {
      const eobNarrative = 'I don\'t understand my explanation of benefits and why the amounts don\'t match my bill';

      const classification = await themeRouter.classifyThemes(eobNarrative);

      expect(classification.themes).toContain('Claims/Billing/EOB/Appeals');
      expect(classification.confidence).toBeGreaterThan(0.6);

      console.log(`✓ EOB question classified: ${classification.themes.join(', ')}`);
    });

    it('should classify cost/deductible questions correctly', async () => {
      const costNarrative = 'I don\'t understand why I\'m paying so much when I have insurance. What is my deductible?';

      const classification = await themeRouter.classifyThemes(costNarrative);

      expect(classification.themes).toContain('Costs');
      expect(classification.confidence).toBeGreaterThan(0.5);

      console.log(`✓ Cost question classified: ${classification.themes.join(', ')}`);
    });
  });

  describe('QAKB Retrieval', () => {
    it('should retrieve relevant cards for No Surprises Act scenarios', async () => {
      const query: QAKBQuery = {
        narrative: 'I received a surprise medical bill from emergency care at an out-of-network hospital',
        themes: ['OON/Balance Billing'],
        caseContext: {
          hasDocuments: true,
          hasClaims: true,
          hasLineItems: false,
          emergency: true,
          nsaCandidate: true
        }
      };

      const result = await qakbRetriever.retrieveAnswers(query);

      expect(result.primaryCard.theme).toBe('OON/Balance Billing');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.matchReason).toContain('No Surprises Act');

      console.log(`✓ NSA scenario - Primary card: ${result.primaryCard.question}`);
      console.log(`✓ Confidence: ${result.confidence}, Reason: ${result.matchReason}`);
    });

    it('should retrieve relevant cards for appeal scenarios', async () => {
      const query: QAKBQuery = {
        narrative: 'My insurance denied my claim and I want to appeal the decision',
        themes: ['Claims/Billing/EOB/Appeals'],
        caseContext: {
          hasDocuments: true,
          hasClaims: true,
          hasLineItems: true,
          emergency: false,
          nsaCandidate: false
        }
      };

      const result = await qakbRetriever.retrieveAnswers(query);

      expect(result.primaryCard.theme).toBe('Claims/Billing/EOB/Appeals');
      expect(result.primaryCard.question.toLowerCase()).toContain('appeal');
      expect(result.secondaryCards.length).toBeGreaterThan(0);

      console.log(`✓ Appeal scenario - Primary card: ${result.primaryCard.question}`);
      console.log(`✓ Secondary cards: ${result.secondaryCards.length}`);
    });
  });

  describe('Answer Composition', () => {
    it('should compose personalized answers with case facts', async () => {
      // Create mock case data
      const mockCase: MergedCase = {
        caseId: 'test-case-001',
        narrative: 'I received a high medical bill',
        documents: [{
          artifactId: 'doc-001',
          filename: 'test-bill.pdf',
          docType: 'BILL',
          pages: 1,
          ocrText: 'Medical Bill - Total: $2,500.00 - Patient Responsibility: $500.00',
          ocrConf: 0.9,
          lineItems: [],
          totals: {
            billed: 250000, // $2500 in cents
            allowed: 200000, // $2000 in cents
            planPaid: 150000, // $1500 in cents
            patientResp: 50000 // $500 in cents
          }
        }],
        consolidatedTotals: {
          billed: 250000,
          allowed: 200000,
          planPaid: 150000,
          patientResp: 50000
        }
      };

      const primaryCard = await qakbRetriever.getCardById('costs-whats-the-difference-between-a-copay-and');
      expect(primaryCard).toBeDefined();

      if (primaryCard) {
        const composedAnswer = await answerComposer.composeAnswer({
          mergedCase: mockCase,
          primaryCard,
          secondaryCards: [],
          userNarrative: 'I received a high medical bill'
        });

        expect(composedAnswer.answer).toContain('$2500.00'); // Total billed
        expect(composedAnswer.answer).toContain('$500.00'); // Patient responsibility
        expect(composedAnswer.checklist.length).toBeGreaterThan(0);
        expect(composedAnswer.phoneScripts.length).toBeGreaterThan(0);
        expect(composedAnswer.pricedSummary).toBeDefined();
        expect(composedAnswer.confidence.overall).toBeGreaterThan(0.5);

        console.log(`✓ Personalized answer includes case facts`);
        console.log(`✓ Checklist items: ${composedAnswer.checklist.length}`);
        console.log(`✓ Phone scripts: ${composedAnswer.phoneScripts.length}`);
      }
    });

    it('should generate appropriate phone scripts with case details', async () => {
      const mockCase: MergedCase = {
        caseId: 'test-case-002',
        narrative: 'Emergency room surprise bill',
        documents: [{
          artifactId: 'doc-002',
          filename: 'emergency-bill.pdf',
          docType: 'BILL',
          pages: 1,
          ocrText: 'Emergency Department - Provider: City Hospital - Amount Due: $3,200.00',
          ocrConf: 0.85,
          lineItems: [],
          header: {
            providerName: 'City Hospital Emergency Department',
            claimId: 'CL-2024-001234'
          }
        }],
        inferred: {
          emergency: true,
          nsaCandidate: true,
          facility: 'ER'
        }
      };

      const nsaCard = await qakbRetriever.getCardsByTheme('OON/Balance Billing');
      expect(nsaCard.length).toBeGreaterThan(0);

      const composedAnswer = await answerComposer.composeAnswer({
        mergedCase: mockCase,
        primaryCard: nsaCard[0],
        secondaryCards: [],
        userNarrative: 'Emergency room surprise bill'
      });

      const phoneScript = composedAnswer.phoneScripts.find(ps =>
        ps.title.toLowerCase().includes('surprises') || ps.body.toLowerCase().includes('surprises')
      );

      expect(phoneScript).toBeDefined();
      expect(phoneScript?.body).toContain('City Hospital');
      expect(phoneScript?.body).toContain('No Surprises Act');

      console.log(`✓ NSA phone script generated with case details`);
    });

    it('should create appeal letters with case specifics', async () => {
      const mockCase: MergedCase = {
        caseId: 'test-case-003',
        narrative: 'Claim was denied, need to appeal',
        documents: [{
          artifactId: 'doc-003',
          filename: 'denial-eob.pdf',
          docType: 'EOB',
          pages: 1,
          ocrText: 'Claim Denied - Code: CPT-99214 - Reason: Not medically necessary',
          ocrConf: 0.88,
          lineItems: [{
            lineId: 'line-001',
            code: { value: '99214', system: 'CPT', confidence: 0.9 },
            description: 'Office Visit Level 4',
            charges: {
              billed: 25000, // $250 in cents
              patientResp: 25000
            },
            confidence: 0.85
          }],
          header: {
            claimId: 'CL-2024-005678'
          }
        }],
        matchedLineItems: [{
          lineId: 'line-001',
          code: { value: '99214', system: 'CPT', confidence: 0.9 },
          description: 'Office Visit Level 4',
          charges: {
            billed: 25000,
            patientResp: 25000
          },
          confidence: 0.85
        }]
      };

      const appealCard = await qakbRetriever.getCardsByTheme('Claims/Billing/EOB/Appeals');
      const appealCardMatch = appealCard.find(card =>
        card.question.toLowerCase().includes('appeal')
      );
      expect(appealCardMatch).toBeDefined();

      if (appealCardMatch) {
        const composedAnswer = await answerComposer.composeAnswer({
          mergedCase: mockCase,
          primaryCard: appealCardMatch,
          secondaryCards: [],
          userNarrative: 'Claim was denied, need to appeal'
        });

        const appealLetter = composedAnswer.appealLetters[0];
        expect(appealLetter).toBeDefined();
        expect(appealLetter.body).toContain('CL-2024-005678');
        expect(appealLetter.body).toContain('Office Visit Level 4');
        expect(appealLetter.body).toContain('99214');
        expect(appealLetter.body).toContain('$250.00');

        console.log(`✓ Appeal letter generated with case specifics`);
      }
    });
  });

  describe('End-to-End Coverage Scenarios', () => {
    const testScenarios = [
      {
        name: 'Emergency Room Surprise Bill',
        narrative: 'I went to the ER and got a surprise bill from an out-of-network anesthesiologist',
        expectedTheme: 'OON/Balance Billing',
        expectedKeywords: ['surprise', 'emergency', 'no surprises act']
      },
      {
        name: 'EOB Confusion',
        narrative: 'My EOB shows different amounts than my doctor bill and I don\'t understand why',
        expectedTheme: 'Claims/Billing/EOB/Appeals',
        expectedKeywords: ['eob', 'explanation', 'bill']
      },
      {
        name: 'High Deductible Question',
        narrative: 'I have a high deductible plan and don\'t understand what I need to pay',
        expectedTheme: 'Costs',
        expectedKeywords: ['deductible', 'cost', 'pay']
      },
      {
        name: 'Prior Authorization Denial',
        narrative: 'My insurance requires prior authorization and denied my procedure',
        expectedTheme: 'Claims/Billing/EOB/Appeals',
        expectedKeywords: ['prior authorization', 'denied', 'appeal']
      },
      {
        name: 'Out-of-Network Provider',
        narrative: 'I accidentally went to an out-of-network provider and got a huge bill',
        expectedTheme: 'Networks & Access',
        expectedKeywords: ['out-of-network', 'provider', 'network']
      }
    ];

    testScenarios.forEach(scenario => {
      it(`should handle ${scenario.name} scenario end-to-end`, async () => {
        // Step 1: Theme classification
        const classification = await themeRouter.classifyThemes(scenario.narrative);

        expect(classification.themes).toContain(scenario.expectedTheme);
        console.log(`✓ ${scenario.name}: Classified as ${classification.themes.join(', ')}`);

        // Step 2: QAKB retrieval
        const query: QAKBQuery = {
          narrative: scenario.narrative,
          themes: classification.themes,
          caseContext: {
            hasDocuments: true,
            hasClaims: true,
            hasLineItems: false,
            emergency: scenario.name.includes('Emergency'),
            nsaCandidate: scenario.name.includes('Surprise')
          }
        };

        const qakbResult = await qakbRetriever.retrieveAnswers(query);
        expect(qakbResult.primaryCard).toBeDefined();
        expect(qakbResult.confidence).toBeGreaterThan(0.4);

        console.log(`✓ ${scenario.name}: Retrieved card - ${qakbResult.primaryCard.question}`);

        // Step 3: Verify answer relevance
        const answer = qakbResult.primaryCard.answer.toLowerCase();
        const hasRelevantKeywords = scenario.expectedKeywords.some(keyword =>
          answer.includes(keyword.toLowerCase())
        );
        expect(hasRelevantKeywords).toBe(true);

        console.log(`✓ ${scenario.name}: Answer contains relevant keywords`);
      });
    });
  });
});

describe('QAKB Performance and Cache Tests', () => {
  it('should load cards efficiently', async () => {
    const startTime = Date.now();

    await qakbRetriever.initialize();
    const stats = qakbRetriever.getCacheStats();

    const loadTime = Date.now() - startTime;

    expect(stats.cardCount).toBeGreaterThan(50);
    expect(loadTime).toBeLessThan(2000); // Should load in under 2 seconds

    console.log(`✓ Loaded ${stats.cardCount} cards in ${loadTime}ms`);
  });

  it('should retrieve answers quickly', async () => {
    const queries = [
      'I need help understanding my medical bill',
      'My claim was denied, what should I do?',
      'I got a surprise bill from the emergency room',
      'What is the difference between HMO and PPO?',
      'How do I appeal an insurance decision?'
    ];

    for (const narrative of queries) {
      const startTime = Date.now();

      const result = await qakbRetriever.retrieveAnswers({
        narrative,
        themes: [],
        caseContext: {
          hasDocuments: false,
          hasClaims: false,
          hasLineItems: false
        }
      });

      const retrievalTime = Date.now() - startTime;

      expect(result.primaryCard).toBeDefined();
      expect(retrievalTime).toBeLessThan(500); // Should retrieve in under 500ms

      console.log(`✓ Query "${narrative.substring(0, 30)}..." answered in ${retrievalTime}ms`);
    }
  });
});