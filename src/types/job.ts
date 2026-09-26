export type PipelineStage = 'new' | 'tailoring' | 'tailored' | 'sent' | 'error';

export interface ScrapedJob {
  id: string;
  source: 'facebook' | 'greenhouse' | 'ashby' | 'lever' | 'jobthai' | 'jobsdb' | 'manual';
  jobTitle: string;
  companyName: string;
  jobUrl: string;
  location: string;
  salaryRange?: string;
  jobDescription: string;
  requirements: string[];
  contactMethod?: {
    type: 'email' | 'line' | 'form' | 'messenger' | 'portal';
    value: string;
  };
  rawPostContent?: string;
  author?: string;
  postedAt?: string;
  matchScore?: number;
  createdAt: string;
  pipelineStage: PipelineStage;
  stageError?: string | null;
  externalId: string;
}

export interface FacebookScrapeRequest {
  postUrl?: string;
  rawText?: string;
}
