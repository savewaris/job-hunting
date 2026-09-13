export interface ScrapedJob {
  id: string;
  source: 'facebook' | 'greenhouse' | 'ashby' | 'jobsdb' | 'remoteok' | 'manual';
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
}

export interface FacebookScrapeRequest {
  postUrl?: string;
  rawText?: string;
}
