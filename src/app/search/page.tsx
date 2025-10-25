'use client';

import { FormEvent, useMemo, useState } from 'react';
import { trackEvent } from '@/lib/analytics';

type SearchAnswer = {
  summary: string;
  answer: string;
  links: { label: string; url: string }[];
  citations: { authority: string; title: string; eff_date?: string | null; url?: string | null }[];
  nextSteps: string[];
  scripts: { channel: 'payer' | 'provider' | 'HR'; body: string }[];
  confidence: number;
  themes: { theme: string; score: number }[];
};

type APIResponse = {
  query: string;
  answer: SearchAnswer;
  rag: { authorityMix: Record<string, number> };
  qaMatches?: { qa_id: string }[];
};

const themeColors: Record<string, string> = {
  'Open Enrollment': 'bg-blue-100 text-blue-800',
  'Prior Authorization': 'bg-amber-100 text-amber-700',
  'External Review': 'bg-rose-100 text-rose-700',
  'Provider Network': 'bg-emerald-100 text-emerald-700',
  Other: 'bg-slate-200 text-slate-700'
};

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<APIResponse | null>(null);
  const [showNetworkFinder, setShowNetworkFinder] = useState(false);

  const confidencePct = useMemo(() => {
    if (!response) return 0;
    return Math.round((response.answer.confidence || 0) * 100);
  }, [response]);

  const showAppealStudio = useMemo(() => {
    if (!response) return false;
    return response.answer.themes.some((theme) => theme.theme.toLowerCase().includes('appeal'));
  }, [response]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Enter a question to search.');
      return;
    }

    setError(null);
    setLoading(true);
    trackEvent.searchQuerySubmitted?.(trimmed.length);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed })
      });

      if (!res.ok) {
        throw new Error('Request failed');
      }

      const data = (await res.json()) as APIResponse;
      setResponse(data);
      trackEvent.searchAnswerRendered?.(data.query, data.answer.confidence);
      trackEvent.ragAuthorityMix?.(data.rag.authorityMix);
      trackEvent.qaMatchUsed?.((data.qaMatches ?? []).length > 0);
      trackEvent.classificationConfidence?.(data.answer.confidence);
    } catch (err) {
      console.error(err);
      setError('We could not complete the search. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <header className="space-y-3">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">WyngAI Search Engine</p>
          <h1 className="text-3xl font-semibold md:text-4xl">Ask anything about US health insurance rules.</h1>
          <p className="text-sm text-slate-300">
            Federal and state regulations, payer policies, and curated FAQs in one grounded answer.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-lg">
          <label className="text-xs uppercase tracking-[0.4em] text-slate-400">Search the rule engine</label>
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              placeholder="I have employer coverage in Florida; can I switch to the marketplace?"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-900 transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
          {error && <p className="text-sm text-rose-300">{error}</p>}
        </form>

        {response && (
          <section className="flex flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
            <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Summary</p>
                <h2 className="text-2xl font-semibold text-slate-50">{response.answer.summary}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-1 text-sm text-emerald-300">
                  Confidence {confidencePct}%
                </div>
                {response.answer.themes.map((theme) => (
                  <span
                    key={theme.theme}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${themeColors[theme.theme] || themeColors.Other}`}
                  >
                    {theme.theme}
                  </span>
                ))}
                {showAppealStudio && (
                  <button
                    className="rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-200"
                    type="button"
                    onClick={() => trackEvent.appealStudioLaunch?.('search_chip')}
                  >
                    Launch Appeal Studio 2.0
                  </button>
                )}
              </div>
            </header>

            <article className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-6 text-sm leading-relaxed text-slate-100">
              {response.answer.answer.split('\n\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </article>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Citations</h3>
                <ul className="space-y-3 text-sm">
                  {response.answer.citations.map((citation, index) => (
                    <li key={index} className="flex flex-col gap-1">
                      <span className="font-medium text-slate-100">{citation.title}</span>
                      <span className="text-xs text-slate-400">{citation.authority}</span>
                      {citation.url && (
                        <a
                          href={citation.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-emerald-400 underline"
                        >
                          View source
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Next steps</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">
                    {response.answer.nextSteps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                </div>
                {response.answer.scripts.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Scripts</h3>
                    <ul className="mt-2 space-y-2 text-sm text-slate-200">
                      {response.answer.scripts.map((script, index) => (
                        <li key={index} className="rounded-xl border border-slate-800/70 bg-slate-900/80 p-3">
                          <p className="text-xs uppercase tracking-[0.4em] text-slate-400">{script.channel}</p>
                          <p>{script.body}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                  onClick={() => trackEvent.resultExport?.('copy')}
                >
                  Copy answer
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                  onClick={() => trackEvent.resultExport?.('pdf')}
                >
                  Export PDF
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                  onClick={() => trackEvent.resultExport?.('email')}
                >
                  Send Email
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300"
                  onClick={() => {
                    trackEvent.lockerSaved?.('search');
                    alert('Saved to your locker (stub).');
                  }}
                >
                  Save to Locker
                </button>
                {response.answer.themes.some((theme) => theme.theme === 'Provider Network') && (
                  <button
                    type="button"
                    className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300"
                    onClick={() => setShowNetworkFinder(true)}
                  >
                    Open In-Network Finder
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {response && response.answer.links.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm uppercase tracking-[0.4em] text-slate-400">Relevant links</h3>
            <ul className="grid gap-3 md:grid-cols-2">
              {response.answer.links.map((link) => (
                <li key={link.url} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm">
                  <a href={link.url} target="_blank" rel="noreferrer" className="text-emerald-400 underline">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {showNetworkFinder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6">
            <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-slate-100">In-Network Finder (preview)</h4>
                <button onClick={() => setShowNetworkFinder(false)} className="text-slate-400 hover:text-slate-200">✕</button>
              </div>
              <p className="mt-3 text-sm text-slate-300">
                We will surface plan directories and payer tools here based on the detected provider names or NPIs in your question.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
