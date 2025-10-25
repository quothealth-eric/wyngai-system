import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';

interface FAQEntry {
  theme: string;
  question: string;
  answer: string;
  url: string;
  authority: string;
}

/**
 * Connector stub for reputable organization FAQs (KFF, CMS, etc.).
 * In lieu of a full crawler we read from a curated JSON file in the repo (docs/knowledge/faq_seed.json).
 */
export class FAQOrgConnector {
  private readonly supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
  );

  async seedFromLocalFile(path = 'docs/knowledge/faq_seed.json'): Promise<number> {
    try {
      const fileContents = await readFile(path, 'utf-8');
      const entries: FAQEntry[] = JSON.parse(fileContents);
      let inserted = 0;

      for (const entry of entries) {
        const { error } = await this.supabase.from('qa_bank').upsert(
          {
            qa_id: randomUUID(),
            theme: entry.theme,
            question: entry.question,
            answer: entry.answer,
            citations: [{ authority: entry.authority, url: entry.url }],
            source: 'faq',
            url: entry.url,
            created_at: new Date().toISOString()
          },
          { onConflict: 'question', ignoreDuplicates: true }
        );

        if (error) {
          console.warn('Failed to seed FAQ entry', error);
          continue;
        }

        inserted++;
      }

      return inserted;
    } catch (error) {
      console.warn('FAQ seed file missing or invalid', error);
      return 0;
    }
  }
}
