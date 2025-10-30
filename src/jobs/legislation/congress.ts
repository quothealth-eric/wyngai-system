#!/usr/bin/env tsx

/**
 * Congress.gov API Integration for Healthcare Legislation
 *
 * This module fetches, processes, and ingests healthcare-related bills
 * from the Congress.gov API into our WyngAI Search platform.
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as cheerio from 'cheerio';

// Environment setup
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE!;
const openaiApiKey = process.env.OPENAI_API_KEY!;
const congressApiKey = process.env.CONGRESS_API_KEY!;

if (!supabaseUrl || !supabaseServiceRole || !openaiApiKey || !congressApiKey) {
  console.error('❌ Missing required environment variables');
  console.error('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE, OPENAI_API_KEY, CONGRESS_API_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRole);
const openai = new OpenAI({ apiKey: openaiApiKey });

const CONGRESS_API_BASE = 'https://api.congress.gov/v3';

interface CongressBill {
  congress: number;
  latestAction: {
    actionDate: string;
    text: string;
  };
  number: string;
  originChamber: string;
  title: string;
  type: string;
  updateDate: string;
  url: string;
  introducedDate?: string;
  committees?: Array<{
    name: string;
    chamber: string;
  }>;
  subjects?: Array<{
    name: string;
  }>;
}

interface BillText {
  date: string;
  type: string;
  url: string;
  formats: Array<{
    type: string;
    url: string;
  }>;
}

interface ProcessingOptions {
  topic?: string;
  since?: string;
  congress?: number;
  limit?: number;
  forceRefresh?: boolean;
}

class CongressAPIError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'CongressAPIError';
  }
}

async function fetchFromCongressAPI(endpoint: string): Promise<any> {
  const url = `${CONGRESS_API_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${congressApiKey}`;

  console.log(`🌐 Fetching: ${endpoint}`);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WyngAI-Search/1.0 (healthcare-policy-research)',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new CongressAPIError(`Congress API error: ${response.status} ${response.statusText}`, response.status);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof CongressAPIError) {
      throw error;
    }
    throw new CongressAPIError(`Failed to fetch from Congress API: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

async function generateNonPartisanSummary(billTitle: string, billText: string): Promise<{
  summary: string;
  implications: any;
  nonPartisanSummary: string;
}> {
  try {
    const prompt = `
You are a neutral policy analyst. Analyze this healthcare bill and provide:

1. A one-sentence lay summary of what the bill does
2. A one-sentence description of who would be affected
3. A bulleted list of key implications if enacted
4. A non-partisan summary suitable for public education

Bill Title: ${billTitle}

Bill Text: ${billText.substring(0, 8000)}

Respond in this JSON format:
{
  "summary": "One sentence what it does",
  "affected": "One sentence who is affected",
  "implications": ["Bullet point 1", "Bullet point 2", "Bullet point 3"],
  "nonPartisanSummary": "2-3 paragraph neutral explanation suitable for general public"
}

Be completely neutral and factual. Avoid advocacy language. Use "the bill proposes" and "if enacted" phrasing.
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1000
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    return {
      summary: parsed.summary,
      implications: {
        affected: parsed.affected,
        keyPoints: parsed.implications
      },
      nonPartisanSummary: parsed.nonPartisanSummary
    };
  } catch (error) {
    console.error('Failed to generate summary:', error);
    return {
      summary: `Healthcare legislation: ${billTitle}`,
      implications: { affected: 'Healthcare stakeholders', keyPoints: ['Policy changes proposed'] },
      nonPartisanSummary: `This bill proposes changes to healthcare policy. See full text for details.`
    };
  }
}

async function fetchBillText(bill: CongressBill): Promise<string | null> {
  try {
    const billId = `${bill.congress}${bill.type.toLowerCase()}${bill.number}`;
    const textData = await fetchFromCongressAPI(`/bill/${bill.congress}/${bill.type.toLowerCase()}/${bill.number}/text`);

    if (!textData.textVersions || textData.textVersions.length === 0) {
      console.log(`⚠️ No text versions available for ${billId}`);
      return null;
    }

    // Get the most recent text version
    const latestVersion = textData.textVersions[0];
    console.log(`📄 Fetching text for ${billId} (${latestVersion.type})`);

    // Find HTML format if available
    const htmlFormat = latestVersion.formats?.find((f: any) => f.type === 'Formatted Text');
    if (!htmlFormat) {
      console.log(`⚠️ No HTML format available for ${billId}`);
      return null;
    }

    // Fetch the HTML content
    const textResponse = await fetch(htmlFormat.url);
    if (!textResponse.ok) {
      console.log(`⚠️ Failed to fetch text content for ${billId}`);
      return null;
    }

    const htmlContent = await textResponse.text();

    // Parse HTML and extract text
    const $ = cheerio.load(htmlContent);
    // Remove script and style elements
    $('script, style').remove();
    // Get text content
    const textContent = $.text().replace(/\s+/g, ' ').trim();

    if (textContent.length < 100) {
      console.log(`⚠️ Text content too short for ${billId}`);
      return null;
    }

    return textContent;
  } catch (error) {
    console.error(`❌ Error fetching bill text:`, error);
    return null;
  }
}

function chunkBillText(text: string, billId: string): Array<{ path: string; text: string; tokens: number }> {
  const chunks: Array<{ path: string; text: string; tokens: number }> = [];
  const maxChunkSize = 1000; // tokens
  const lines = text.split('\n').filter(line => line.trim().length > 0);

  let currentChunk = '';
  let currentTokens = 0;
  let sectionNumber = 1;

  for (const line of lines) {
    const lineTokens = Math.ceil(line.length / 4); // rough token estimate

    // If adding this line would exceed chunk size, save current chunk
    if (currentTokens + lineTokens > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        path: `${billId} - Section ${sectionNumber}`,
        text: currentChunk.trim(),
        tokens: currentTokens
      });

      currentChunk = '';
      currentTokens = 0;
      sectionNumber++;
    }

    currentChunk += line + '\n';
    currentTokens += lineTokens;
  }

  // Add final chunk if any content remains
  if (currentChunk.trim().length > 0) {
    chunks.push({
      path: `${billId} - Section ${sectionNumber}`,
      text: currentChunk.trim(),
      tokens: currentTokens
    });
  }

  return chunks;
}

async function processBill(bill: CongressBill): Promise<boolean> {
  const billId = `${bill.congress}-${bill.type}-${bill.number}`;

  try {
    console.log(`\n📜 Processing bill: ${billId}`);
    console.log(`📋 Title: ${bill.title}`);

    // Check if bill already exists (unless force refresh)
    const { data: existingBill } = await supabase
      .from('leg_bills')
      .select('bill_id')
      .eq('bill_id', billId)
      .single();

    if (existingBill) {
      console.log(`⏭️ Bill ${billId} already exists, skipping`);
      return true;
    }

    // Fetch bill text
    const billText = await fetchBillText(bill);
    if (!billText) {
      console.log(`⚠️ Could not fetch text for ${billId}, storing metadata only`);
    }

    // Generate summaries
    let summary = '';
    let implications = {};
    let nonPartisanSummary = '';

    if (billText) {
      console.log(`🤖 Generating AI summary for ${billId}`);
      const summaryData = await generateNonPartisanSummary(bill.title, billText);
      summary = summaryData.summary;
      implications = summaryData.implications;
      nonPartisanSummary = summaryData.nonPartisanSummary;
    }

    // Insert bill metadata
    const { data: insertedBill, error: billError } = await supabase
      .from('leg_bills')
      .insert({
        bill_id: billId,
        congress: bill.congress,
        chamber: bill.originChamber,
        number: `${bill.type} ${bill.number}`,
        title: bill.title,
        introduced_date: bill.introducedDate,
        latest_action: bill.latestAction.text,
        latest_action_date: bill.latestAction.actionDate,
        committees: bill.committees?.map(c => c.name) || [],
        subjects: bill.subjects?.map(s => s.name) || [],
        url: `https://congress.gov/bill/${bill.congress}/${bill.type.toLowerCase()}/${bill.number}`,
        summary,
        implications,
        non_partisan_summary: nonPartisanSummary
      })
      .select('bill_id')
      .single();

    if (billError) {
      console.error(`❌ Failed to insert bill ${billId}:`, billError);
      return false;
    }

    console.log(`✅ Inserted bill metadata for ${billId}`);

    // Process bill text if available
    if (billText) {
      const chunks = chunkBillText(billText, billId);
      console.log(`📄 Created ${chunks.length} text chunks for ${billId}`);

      for (const chunk of chunks) {
        // Insert section
        const { data: insertedSection, error: sectionError } = await supabase
          .from('leg_sections')
          .insert({
            bill_id: billId,
            path: chunk.path,
            text: chunk.text,
            tokens: chunk.tokens
          })
          .select('section_id')
          .single();

        if (sectionError) {
          console.error(`❌ Failed to insert section:`, sectionError);
          continue;
        }

        // Generate and insert embedding
        try {
          const embedding = await generateEmbedding(chunk.text);
          const { error: embeddingError } = await supabase
            .from('leg_embeddings')
            .insert({
              section_id: insertedSection.section_id,
              embedding
            });

          if (embeddingError) {
            console.error(`❌ Failed to insert embedding:`, embeddingError);
          }

          // Rate limiting
          await sleep(100);
        } catch (error) {
          console.error(`❌ Failed to process embedding for section:`, error);
        }
      }
    }

    console.log(`✅ Successfully processed ${billId}`);
    return true;

  } catch (error) {
    console.error(`❌ Error processing bill ${billId}:`, error);
    return false;
  }
}

async function fetchHealthcareBills(options: ProcessingOptions = {}): Promise<CongressBill[]> {
  const {
    topic = 'health',
    since = '30d',
    congress = 118,
    limit = 50
  } = options;

  console.log(`🔍 Searching for healthcare bills (Congress ${congress}, since ${since})`);

  try {
    // Calculate fromDateTime for filtering
    let fromDateTime = '';
    if (since.endsWith('d')) {
      const days = parseInt(since.slice(0, -1));
      const date = new Date();
      date.setDate(date.getDate() - days);
      fromDateTime = date.toISOString().split('T')[0];
    }

    const params = new URLSearchParams({
      sort: 'updateDate desc',
      limit: limit.toString()
    });

    if (fromDateTime) {
      params.append('fromDateTime', fromDateTime);
    }

    // Search for bills with healthcare-related topics
    const endpoint = `/bill/${congress}?${params.toString()}`;
    const data = await fetchFromCongressAPI(endpoint);

    if (!data.bills || data.bills.length === 0) {
      console.log('⚠️ No bills found');
      return [];
    }

    console.log(`📊 Found ${data.bills.length} bills, filtering for healthcare relevance`);

    // Filter for healthcare-related bills
    const healthcareBills = data.bills.filter((bill: CongressBill) => {
      const titleLower = bill.title.toLowerCase();
      const healthcareKeywords = [
        'health', 'healthcare', 'medical', 'medicare', 'medicaid', 'insurance',
        'hospital', 'patient', 'drug', 'prescription', 'affordable care',
        'public health', 'mental health', 'nursing', 'physician', 'doctor',
        'coverage', 'benefit', 'premium', 'copay', 'deductible', 'hmo', 'ppo'
      ];

      return healthcareKeywords.some(keyword => titleLower.includes(keyword));
    });

    console.log(`🏥 Filtered to ${healthcareBills.length} healthcare-related bills`);
    return healthcareBills;

  } catch (error) {
    console.error('❌ Error fetching bills:', error);
    return [];
  }
}

async function runCongressIngestion(options: ProcessingOptions = {}): Promise<void> {
  console.log('🚀 Starting Congress.gov Healthcare Bills Ingestion...');

  try {
    const bills = await fetchHealthcareBills(options);

    if (bills.length === 0) {
      console.log('📭 No healthcare bills found to process');
      return;
    }

    let processed = 0;
    let failed = 0;

    for (const bill of bills) {
      const success = await processBill(bill);
      if (success) {
        processed++;
      } else {
        failed++;
      }

      // Rate limiting between bills
      await sleep(1000);
    }

    console.log(`\n🎉 Ingestion completed!`);
    console.log(`✅ Successfully processed: ${processed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Success rate: ${((processed / bills.length) * 100).toFixed(1)}%`);

    // Verify ingestion
    const { count } = await supabase
      .from('leg_bills')
      .select('*', { count: 'exact', head: true });

    console.log(`\n📈 Database verification:`);
    console.log(`💾 Total bills in database: ${count}`);

  } catch (error) {
    console.error('❌ Fatal error during ingestion:', error);
    throw error;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: ProcessingOptions = {};

  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case '--topic':
        options.topic = value;
        break;
      case '--since':
        options.since = value;
        break;
      case '--congress':
        options.congress = parseInt(value);
        break;
      case '--limit':
        options.limit = parseInt(value);
        break;
      case '--force-refresh':
        options.forceRefresh = true;
        i--; // No value for this flag
        break;
      default:
        console.log(`Unknown flag: ${flag}`);
    }
  }

  runCongressIngestion(options)
    .then(() => {
      console.log('✅ Congress ingestion completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Congress ingestion failed:', error);
      process.exit(1);
    });
}

export { runCongressIngestion, fetchHealthcareBills, processBill };