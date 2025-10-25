import { CrawlerScheduler } from '../../src/jobs/crawler-scheduler';

describe.skip('WyngAI Search ingestion smoke', () => {
  it('runs the orchestrator for ecfr + healthcare_gov in local dev', async () => {
    const scheduler = new CrawlerScheduler();
    expect(scheduler.getRegisteredSources()).toEqual(expect.arrayContaining(['ecfr', 'healthcare_gov', 'state:FL', 'payer:UHC']));
  });
});
