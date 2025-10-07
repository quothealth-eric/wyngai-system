import fs from 'fs';
import path from 'path';
import { AnswerCard, PolicyCitation } from '@/types/qakb';

interface ThemeQuestion {
  question: string;
  keywords: string[];
  priority: "high" | "medium" | "low";
}

interface ThemeCategory {
  category: string;
  subcategories?: string[];
  questions: ThemeQuestion[];
}

interface ThemeBank {
  categories: ThemeCategory[];
}

function generateCardId(category: string, question: string): string {
  const normalized = `${category}-${question}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized.substring(0, 50);
}

function createPolicyCitations(category: string): PolicyCitation[] {
  const citations: PolicyCitation[] = [];

  // Federal citations based on category
  switch (category) {
    case 'OON/Balance Billing':
      citations.push({
        title: 'No Surprises Act (NSA)',
        authority: 'Federal',
        citation: '21st Century Cures Act Section 2799A-1, USC Title 42 Chapter 6A'
      });
      break;
    case 'Claims/Billing/EOB/Appeals':
      citations.push({
        title: 'ERISA Claims Procedures',
        authority: 'Federal',
        citation: '29 CFR 2560.503-1'
      });
      citations.push({
        title: 'ACA Internal Appeals',
        authority: 'Federal',
        citation: '45 CFR 147.136'
      });
      break;
    case 'Government Programs':
      citations.push({
        title: 'Medicare Benefits',
        authority: 'CMS',
        citation: '42 CFR Part 411'
      });
      citations.push({
        title: 'Medicaid Eligibility',
        authority: 'CMS',
        citation: '42 CFR Part 435'
      });
      break;
    case 'Costs':
      citations.push({
        title: 'ACA Essential Health Benefits',
        authority: 'Federal',
        citation: '42 USC 18022, 45 CFR 156.110'
      });
      break;
    case 'Networks & Access':
      citations.push({
        title: 'ACA Network Adequacy',
        authority: 'Federal',
        citation: '45 CFR 156.230'
      });
      break;
    default:
      citations.push({
        title: 'Affordable Care Act',
        authority: 'Federal',
        citation: '42 USC 18001 et seq.'
      });
  }

  return citations;
}

function generateAnswer(category: string, question: string): {
  answer: string;
  checklist: string[];
  phoneScript: string;
  appealSnippet: string;
} {
  // This is a simplified version - in production, this would use more sophisticated
  // answer generation based on the specific question and category
  const baseAnswer = `This is a comprehensive answer for "${question}" in the ${category} category. `;

  let specificGuidance = '';
  let checklist: string[] = [];
  let phoneScript = '';
  let appealSnippet = '';

  switch (category) {
    case 'Claims/Billing/EOB/Appeals':
      specificGuidance = 'Review your Explanation of Benefits (EOB) carefully and compare it to your provider bill. ';
      checklist = [
        'Locate your EOB statement',
        'Compare EOB amounts to provider bill',
        'Check if services were covered',
        'Verify in-network status of providers',
        'Contact insurance if discrepancies exist'
      ];
      phoneScript = `Hi, I'm calling about claim [CLAIM_NUMBER] from [DATE]. I have questions about my EOB and need clarification on the coverage determination. Can you walk me through why this claim was processed this way?`;
      appealSnippet = `I am formally appealing the coverage determination for claim [CLAIM_NUMBER] dated [DATE]. Based on my policy benefits and the medical necessity of the services, I believe this claim should be covered. Please find attached supporting documentation.`;
      break;

    case 'Costs':
      specificGuidance = 'Understanding your cost-sharing structure is key to managing healthcare expenses. ';
      checklist = [
        'Review your Summary of Benefits and Coverage (SBC)',
        'Understand your deductible amount and what counts toward it',
        'Know your copay amounts for different services',
        'Understand your coinsurance percentage',
        'Track progress toward your out-of-pocket maximum'
      ];
      phoneScript = `Hi, I'm calling to understand my cost-sharing for [SERVICE TYPE]. Can you explain what my out-of-pocket cost would be and whether this counts toward my deductible?`;
      appealSnippet = `I am disputing the cost-sharing calculation for services rendered on [DATE]. According to my benefits, my cost should be [EXPECTED_AMOUNT] but I was charged [ACTUAL_AMOUNT].`;
      break;

    case 'Networks & Access':
      specificGuidance = 'Always verify provider network status before receiving care to avoid unexpected costs. ';
      checklist = [
        'Use your insurance\'s provider directory',
        'Call the provider to confirm they accept your insurance',
        'Verify the provider is in-network for your specific plan',
        'Understand referral requirements for specialists',
        'Check if prior authorization is needed'
      ];
      phoneScript = `Hi, I need to verify that Dr. [PROVIDER_NAME] is in-network for my plan [PLAN_NAME]. Can you confirm their network status and if I need a referral?`;
      appealSnippet = `I received care from what I believed was an in-network provider based on your directory. I am appealing the out-of-network charges as I relied on your published information.`;
      break;

    case 'OON/Balance Billing':
      specificGuidance = 'The No Surprises Act protects you from most surprise medical bills for emergency care and certain non-emergency care. ';
      checklist = [
        'Identify if this is a surprise bill covered by the No Surprises Act',
        'Check if you received proper notice and consent forms',
        'Verify the provider\'s network status',
        'Review your EOB for payment amounts',
        'Contact your insurance about balance billing protections'
      ];
      phoneScript = `Hi, I received a balance bill from [PROVIDER] for services on [DATE]. I believe this may be a surprise bill covered by the No Surprises Act. Can you help me understand my protections?`;
      appealSnippet = `I am disputing this balance bill under the No Surprises Act. I did not receive proper notice and consent, and I believe I should be protected from this surprise billing.`;
      break;

    default:
      specificGuidance = 'For specific guidance on your situation, contact your insurance company or consult with a qualified professional. ';
      checklist = [
        'Review your plan documents',
        'Contact your insurance company for clarification',
        'Keep detailed records of all communications',
        'Consider consulting with a qualified professional if needed'
      ];
      phoneScript = `Hi, I have a question about my coverage. Can you help me understand [SPECIFIC_QUESTION]?`;
      appealSnippet = `I am requesting a review of [SPECIFIC_ISSUE]. Please provide a detailed explanation of your coverage determination.`;
  }

  const fullAnswer = baseAnswer + specificGuidance +
    'Remember that this is educational information only and not legal advice. ' +
    'Always consult with qualified professionals for specific legal or medical guidance.';

  return {
    answer: fullAnswer,
    checklist,
    phoneScript,
    appealSnippet
  };
}

export async function buildAnswerCards(): Promise<void> {
  try {
    // Read the theme bank
    const themeBankPath = path.join(process.cwd(), 'knowledge', 'theme_bank.json');
    const themeBankData = JSON.parse(fs.readFileSync(themeBankPath, 'utf8')) as ThemeBank;

    const cards: AnswerCard[] = [];

    // Generate cards for each question in each category
    for (const category of themeBankData.categories) {
      for (const question of category.questions) {
        const cardId = generateCardId(category.category, question.question);
        const sources = createPolicyCitations(category.category);
        const generatedContent = generateAnswer(category.category, question.question);

        const card: AnswerCard = {
          cardId,
          theme: category.category,
          question: question.question,
          intent: `Answer questions about ${category.category.toLowerCase()} - specifically: ${question.question}`,
          answer: generatedContent.answer,
          checklist: generatedContent.checklist,
          phoneScript: generatedContent.phoneScript,
          appealSnippet: generatedContent.appealSnippet,
          sources,
          meta: {
            version: '1.0.0',
            lastUpdatedISO: new Date().toISOString(),
            author: 'QAKB Builder',
            confidence: question.priority === 'high' ? 0.9 : question.priority === 'medium' ? 0.8 : 0.7
          }
        };

        cards.push(card);
      }
    }

    // Write cards to JSONL file
    const cardsPath = path.join(process.cwd(), 'knowledge', 'cards', 'cards.jsonl');
    const cardsContent = cards.map(card => JSON.stringify(card)).join('\n');
    fs.writeFileSync(cardsPath, cardsContent, 'utf8');

    console.log(`Generated ${cards.length} answer cards successfully`);

    // Also write a summary for verification
    const summaryPath = path.join(process.cwd(), 'knowledge', 'cards', 'summary.json');
    const summary = {
      totalCards: cards.length,
      categoriesCovered: [...new Set(cards.map(c => c.theme))],
      lastGenerated: new Date().toISOString(),
      version: '1.0.0'
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

  } catch (error) {
    console.error('Error building answer cards:', error);
    throw error;
  }
}

// CLI usage
if (require.main === module) {
  buildAnswerCards()
    .then(() => console.log('Answer cards built successfully'))
    .catch(error => {
      console.error('Failed to build answer cards:', error);
      process.exit(1);
    });
}