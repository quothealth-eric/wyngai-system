#!/usr/bin/env tsx

/**
 * Health Insurance Q&A Corpus Ingestion Script
 *
 * This script processes the health_insurance_search_questions.json file
 * and ingests it into our Supabase database for the WyngAI Search platform.
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Environment setup
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE!;
const openaiApiKey = process.env.OPENAI_API_KEY!;

if (!supabaseUrl || !supabaseServiceRole || !openaiApiKey) {
  console.error('❌ Missing required environment variables');
  console.error('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE, OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRole);
const openai = new OpenAI({ apiKey: openaiApiKey });

interface QAItem {
  id: string;
  question: string;
  intent: string;
  context?: string;
  answer: string;
  sources?: Array<{
    title: string;
    url: string;
    publisher: string;
  }>;
  state_specific?: string;
  category?: string;
  themes?: string[];
  priority?: number;
}

interface HealthInsuranceCorpus {
  metadata: {
    title: string;
    version: string;
    generated_at: string;
    description: string;
  };
  sources: Record<string, {
    title: string;
    url: string;
    publisher: string;
  }>;
  questions: QAItem[];
}

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: text,
      dimensions: 1536
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    throw error;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ingestQACorpus() {
  console.log('🚀 Starting Health Insurance Q&A Corpus Ingestion...');

  // Read and parse the corpus file
  const corpusPath = '/Users/ericchiyembekeza/Desktop/Apps/getwyng/health_insurance_search_questions.json';

  if (!fs.existsSync(corpusPath)) {
    console.error(`❌ Corpus file not found at: ${corpusPath}`);
    process.exit(1);
  }

  console.log('📖 Reading corpus file...');
  const corpusContent = fs.readFileSync(corpusPath, 'utf-8');
  let corpus: HealthInsuranceCorpus;

  try {
    corpus = JSON.parse(corpusContent);
  } catch (error) {
    console.error('❌ Failed to parse corpus JSON:', error);
    process.exit(1);
  }

  console.log(`📊 Corpus loaded: ${corpus.questions.length} questions`);
  console.log(`📅 Version: ${corpus.metadata.version}`);
  console.log(`📝 Description: ${corpus.metadata.description}`);

  // Clear existing corpus data
  console.log('🗑️ Clearing existing Q&A corpus...');
  await supabase.from('qa_embeddings').delete().neq('qa_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('qa_corpus').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Process questions in batches
  const batchSize = 10;
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < corpus.questions.length; i += batchSize) {
    const batch = corpus.questions.slice(i, i + batchSize);
    console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(corpus.questions.length / batchSize)} (${batch.length} items)`);

    for (const item of batch) {
      try {
        // Extract and classify the Q&A item
        const question = item.question;
        const answer = item.answer;
        const intent = item.intent || 'general_inquiry';
        const category = item.category || classifyCategory(question, answer);
        const themes = item.themes || extractThemes(question, answer);
        const stateSpecific = item.state_specific || extractStateSpecific(question, answer);

        // Determine authority rank based on sources
        let authorityRank = 0.7; // default
        if (item.sources && item.sources.length > 0) {
          const hasGovSource = item.sources.some(s =>
            s.publisher.includes('CMS') ||
            s.publisher.includes('HealthCare.gov') ||
            s.publisher.includes('Medicare.gov') ||
            s.publisher.includes('Medicaid.gov')
          );
          authorityRank = hasGovSource ? 0.9 : 0.75;
        }

        // Insert Q&A record
        const { data: qaRecord, error: qaError } = await supabase
          .from('qa_corpus')
          .insert({
            question,
            answer,
            intent,
            themes,
            sources: item.sources || [],
            authority_rank: authorityRank,
            category,
            state_specific: stateSpecific
          })
          .select('id')
          .single();

        if (qaError) {
          console.error(`❌ Failed to insert Q&A record:`, qaError);
          failed++;
          continue;
        }

        // Generate embeddings
        console.log(`🔢 Generating embeddings for: "${question.substring(0, 60)}..."`);
        const questionEmbedding = await generateEmbedding(question);
        const answerEmbedding = await generateEmbedding(answer);

        // Insert embeddings
        const { error: embeddingError } = await supabase
          .from('qa_embeddings')
          .insert({
            qa_id: qaRecord.id,
            question_embedding: questionEmbedding,
            answer_embedding: answerEmbedding
          });

        if (embeddingError) {
          console.error(`❌ Failed to insert embeddings:`, embeddingError);
          failed++;
          continue;
        }

        processed++;
        console.log(`✅ Processed: ${processed}/${corpus.questions.length}`);

        // Rate limiting for OpenAI API
        await sleep(100);

      } catch (error) {
        console.error(`❌ Error processing item:`, error);
        failed++;
      }
    }

    // Batch delay
    await sleep(500);
  }

  console.log(`\n🎉 Ingestion completed!`);
  console.log(`✅ Successfully processed: ${processed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Success rate: ${((processed / corpus.questions.length) * 100).toFixed(1)}%`);

  // Verify ingestion
  const { count } = await supabase
    .from('qa_corpus')
    .select('*', { count: 'exact', head: true });

  console.log(`\n📈 Database verification:`);
  console.log(`💾 Total Q&A records in database: ${count}`);
}

function classifyCategory(question: string, answer: string): string {
  const text = (question + ' ' + answer).toLowerCase();

  if (text.includes('marketplace') || text.includes('healthcare.gov') || text.includes('aca')) {
    return 'marketplace';
  } else if (text.includes('medicare')) {
    return 'medicare';
  } else if (text.includes('medicaid') || text.includes('chip')) {
    return 'medicaid';
  } else if (text.includes('appeal') || text.includes('denial') || text.includes('claim')) {
    return 'appeals';
  } else if (text.includes('cobra')) {
    return 'cobra';
  } else if (text.includes('employer') || text.includes('job')) {
    return 'employer';
  } else if (text.includes('premium') || text.includes('deductible') || text.includes('copay')) {
    return 'costs';
  } else {
    return 'general';
  }
}

function extractThemes(question: string, answer: string): string[] {
  const text = (question + ' ' + answer).toLowerCase();
  const themes: string[] = [];

  const themeMap = {
    'enrollment': ['enrollment', 'enroll', 'sign up', 'register'],
    'eligibility': ['eligible', 'qualify', 'qualification'],
    'coverage': ['coverage', 'covered', 'benefit'],
    'costs': ['cost', 'price', 'premium', 'deductible', 'copay', 'coinsurance'],
    'providers': ['doctor', 'provider', 'network', 'physician'],
    'prescriptions': ['prescription', 'drug', 'medication', 'pharmacy'],
    'appeals': ['appeal', 'dispute', 'denial', 'review'],
    'emergency': ['emergency', 'urgent', 'urgent care'],
    'mental_health': ['mental health', 'behavioral health', 'therapy'],
    'preventive': ['preventive', 'screening', 'wellness', 'checkup']
  };

  for (const [theme, keywords] of Object.entries(themeMap)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      themes.push(theme);
    }
  }

  return themes.length > 0 ? themes : ['general'];
}

function extractStateSpecific(question: string, answer: string): string | null {
  const text = (question + ' ' + answer).toLowerCase();

  const statePatterns = [
    /\b(alabama|al)\b/, /\b(alaska|ak)\b/, /\b(arizona|az)\b/, /\b(arkansas|ar)\b/,
    /\b(california|ca)\b/, /\b(colorado|co)\b/, /\b(connecticut|ct)\b/, /\b(delaware|de)\b/,
    /\b(florida|fl)\b/, /\b(georgia|ga)\b/, /\b(hawaii|hi)\b/, /\b(idaho|id)\b/,
    /\b(illinois|il)\b/, /\b(indiana|in)\b/, /\b(iowa|ia)\b/, /\b(kansas|ks)\b/,
    /\b(kentucky|ky)\b/, /\b(louisiana|la)\b/, /\b(maine|me)\b/, /\b(maryland|md)\b/,
    /\b(massachusetts|ma)\b/, /\b(michigan|mi)\b/, /\b(minnesota|mn)\b/, /\b(mississippi|ms)\b/,
    /\b(missouri|mo)\b/, /\b(montana|mt)\b/, /\b(nebraska|ne)\b/, /\b(nevada|nv)\b/,
    /\b(new hampshire|nh)\b/, /\b(new jersey|nj)\b/, /\b(new mexico|nm)\b/, /\b(new york|ny)\b/,
    /\b(north carolina|nc)\b/, /\b(north dakota|nd)\b/, /\b(ohio|oh)\b/, /\b(oklahoma|ok)\b/,
    /\b(oregon|or)\b/, /\b(pennsylvania|pa)\b/, /\b(rhode island|ri)\b/, /\b(south carolina|sc)\b/,
    /\b(south dakota|sd)\b/, /\b(tennessee|tn)\b/, /\b(texas|tx)\b/, /\b(utah|ut)\b/,
    /\b(vermont|vt)\b/, /\b(virginia|va)\b/, /\b(washington|wa)\b/, /\b(west virginia|wv)\b/,
    /\b(wisconsin|wi)\b/, /\b(wyoming|wy)\b/
  ];

  for (const pattern of statePatterns) {
    const match = text.match(pattern);
    if (match) {
      // Convert to state code if full name was matched
      const stateMap: Record<string, string> = {
        'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
        'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
        'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
        'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
        'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
        'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
        'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
        'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
        'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
        'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
        'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
        'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
        'wisconsin': 'WI', 'wyoming': 'WY'
      };

      const stateName = match[1].toLowerCase();
      return stateMap[stateName] || stateName.toUpperCase();
    }
  }

  return null;
}

// Run the ingestion
if (require.main === module) {
  ingestQACorpus()
    .then(() => {
      console.log('✅ Ingestion script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Ingestion script failed:', error);
      process.exit(1);
    });
}

export { ingestQACorpus };