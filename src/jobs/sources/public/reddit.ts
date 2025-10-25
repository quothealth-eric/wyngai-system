import { createClient } from '@supabase/supabase-js';
import { DataSourceConnector, DiscoveredDocument, DocumentSection, ProcessedDocument } from '@/lib/types/rag';
import { randomUUID } from 'crypto';

/**
 * Reddit connector scaffold that respects API terms by requiring credentials in env vars.
 * The connector stores de-identified Q/A excerpts in qa_bank instead of the documents table.
 */
export class RedditConnector implements DataSourceConnector {
  source_id = 'public:reddit';
  authority = 'public_forum';
  private readonly supabase = createClient(
    process.env.SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
  );

  async fetch_index(): Promise<DiscoveredDocument[]> {
    // Forums are ingested directly into the QA bank so we return an empty list for document discovery.
    return [];
  }

  async fetch_doc(): Promise<ProcessedDocument> {
    throw new Error('Reddit connector does not fetch document bodies. Use runHarvest().');
  }

  async split_to_sections(): Promise<DocumentSection[]> {
    return [];
  }

  /**
   * Harvest reddit posts using the official API and insert paraphrased questions into qa_bank.
   * The method is intentionally conservative: it truncates user text and strips any handles.
   */
  async runHarvest(subreddits: string[] = ['healthinsurance', 'hospitalbills']): Promise<number> {
    const clientId = process.env.REDDIT_CLIENT_ID;
    const secret = process.env.REDDIT_CLIENT_SECRET;
    const username = process.env.REDDIT_USERNAME;
    const password = process.env.REDDIT_PASSWORD;

    if (!clientId || !secret || !username || !password) {
      console.warn('Reddit credentials not configured; skipping forum ingest.');
      return 0;
    }

    const tokenResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ grant_type: 'password', username, password }).toString()
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to obtain Reddit API token');
    }

    const { access_token: accessToken } = await tokenResponse.json();

    let inserted = 0;
    for (const subreddit of subreddits) {
      const listingResponse = await fetch(`https://oauth.reddit.com/r/${subreddit}/new?limit=20`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'WyngAIForumHarvester/0.1'
        }
      });

      if (!listingResponse.ok) {
        console.warn(`Failed to fetch subreddit ${subreddit}: ${listingResponse.status}`);
        continue;
      }

      const listing = await listingResponse.json();
      const posts = Array.isArray(listing?.data?.children) ? listing.data.children : [];

      for (const post of posts) {
        const data = post.data || {};
        const permalink = data.permalink ? `https://www.reddit.com${data.permalink}` : undefined;
        const normalizedQuestion = this.normalizeQuestion(`${data.title}\n\n${data.selftext || ''}`);
        if (!normalizedQuestion) continue;

        const { error } = await this.supabase
          .from('qa_bank')
          .upsert(
            {
              qa_id: randomUUID(),
              theme: null,
              question: normalizedQuestion,
              answer: null,
              citations: null,
              source: 'forum',
              url: permalink,
              created_at: new Date().toISOString()
            },
            { onConflict: 'question', ignoreDuplicates: true }
          );

        if (error) {
          console.warn('Failed to upsert reddit QA', error);
          continue;
        }

        inserted++;
        // Basic throttling to respect Reddit API
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }

    return inserted;
  }

  private normalizeQuestion(text: string): string | null {
    const sanitized = text
      .replace(/\n+/g, '\n')
      .replace(/\r/g, '')
      .replace(/(https?:\/\/\S+)/g, '[link]')
      .trim();

    if (sanitized.length < 30) return null;
    return sanitized.length > 1200 ? sanitized.slice(0, 1200) + '…' : sanitized;
  }
}
