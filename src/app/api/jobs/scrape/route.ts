import { NextResponse } from 'next/server';
import { runJobScraper, ScraperFilterOptions } from '@/lib/scraper';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const options: ScraperFilterOptions = {
      sources: body.sources,
      keywords: body.keywords,
      locationFilter: body.locationFilter || 'thailand-remote',
      persistToDb: body.persistToDb !== false, // default true: writes to job_applications
    };

    const result = await runJobScraper(options);

    return NextResponse.json({
      success: true,
      data: result.jobs,
      count: result.totalScraped,
      sourcesChecked: result.sourcesChecked,
      locationFilter: 'Thailand / Remote',
      persistedToDb: options.persistToDb,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Scraper execution failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Read-only: GET must not have side effects (browser prefetch/navigation could
  // otherwise trigger live scraping + DB writes). Use POST to persist results.
  try {
    const result = await runJobScraper({
      locationFilter: 'thailand-remote',
      persistToDb: false,
    });

    return NextResponse.json({
      success: true,
      data: result.jobs,
      count: result.totalScraped,
      sourcesChecked: result.sourcesChecked,
      locationFilter: 'Thailand / Remote',
      persistedToDb: false,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Scraper execution failed' },
      { status: 500 }
    );
  }
}
