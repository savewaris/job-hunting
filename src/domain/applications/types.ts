export const APPLICATION_STATUSES = [
  'maybe',
  'wishlist',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'skipped',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const SKIP_REASONS = [
  'too_senior',
  'bad_pay',
  'not_interested_company',
  'wrong_location',
  'other',
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export interface Application {
  id: string;
  companyName: string;
  jobTitle: string;
  jobUrl: string | null;
  location: string | null;
  salaryRange: string | null;
  status: ApplicationStatus;
  source: string | null;
  externalId: string | null;
  /** YYYY-MM-DD */
  appliedDate: string | null;
  /** ISO 8601 UTC timestamps */
  statusChangedAt: string | null;
  firstResponseAt: string | null;
  interviewedAt: string | null;
  offeredAt: string | null;
  createdAt: string;
  needsInput: boolean;
}

export interface CreateApplicationInput {
  companyName: string;
  jobTitle: string;
  jobUrl?: string;
  location?: string;
  salaryRange?: string;
  status?: ApplicationStatus;
  source?: string;
  externalId?: string;
  jobDescription?: string;
  requirements?: string[];
  contactMethod?: { type: string; value: string };
  rawPostContent?: string;
  /** ISO 8601; keeps an imported job's original capture time. Defaults to now(). */
  createdAt?: string;
}
