#!/usr/bin/env ts-node
import 'dotenv/config';

import { CrawlerScheduler } from './crawler-scheduler';
import { RedditConnector } from './sources/public/reddit';
import { FAQOrgConnector } from './sources/public/faq-orgs';

interface CLIOptions {
  source: string;
  since?: string;
}

function parseArgs(argv: string[]): CLIOptions {
  const options: CLIOptions = { source: 'all' };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source' && argv[i + 1]) {
      options.source = argv[++i];
    } else if (arg.startsWith('--source=')) {
      options.source = arg.split('=')[1];
    } else if (arg === '--since' && argv[i + 1]) {
      options.since = argv[++i];
    } else if (arg.startsWith('--since=')) {
      options.since = arg.split('=')[1];
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv);
  const scheduler = new CrawlerScheduler();
  const available = scheduler.getRegisteredSources();
  const requestedSources = options.source.split(',');

  const redditConnector = new RedditConnector();
  const faqConnector = new FAQOrgConnector();

  const normalizedSources = requestedSources.includes('all')
    ? [...available, 'public:reddit', 'faq:orgs']
    : requestedSources;

  console.log('🛠️ WyngAI ingestion orchestrator');
  console.log('➡️ Sources:', normalizedSources.join(', '));
  if (options.since) {
    console.log('➡️ Since:', options.since);
  }

  for (const source of normalizedSources) {
    if (available.includes(source)) {
      await scheduler.runCrawler(source);
      continue;
    }

    if (source === 'public:reddit') {
      const inserted = await redditConnector.runHarvest();
      console.log(`🧵 Reddit harvest inserted ${inserted} forum questions`);
      continue;
    }

    if (source === 'faq:orgs') {
      const inserted = await faqConnector.seedFromLocalFile();
      console.log(`📚 FAQ seed inserted ${inserted} entries`);
      continue;
    }

    console.warn(`⚠️ Unknown source ${source}, skipping.`);
  }

  console.log('✅ Ingestion run complete');
}

main().catch((error) => {
  console.error('❌ Ingestion run failed', error);
  process.exit(1);
});
