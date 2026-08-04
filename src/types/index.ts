export type JobStatus = 'wishlist' | 'applied' | 'interviewing' | 'offer' | 'rejected';

export interface JobApplication {
  id: string;
  userId?: string;
  companyName: string;
  jobTitle: string;
  jobUrl?: string;
  location?: string;
  jobType?: 'Full-time' | 'Remote' | 'Contract' | 'Hybrid';
  salaryRange?: string;
  status: JobStatus;
  matchScore: number; // 0 - 100
  jobDescription?: string;
  requirements?: string[];
  appliedDate?: string;
  deadlineDate?: string;
  notes?: string;
  createdAt: string;
}

export interface MasterProfile {
  id?: string;
  userId?: string;
  fullName: string;
  email: string;
  targetTitle: string;
  summary: string;
  skills: string[];
  experiences: {
    id: string;
    company: string;
    role: string;
    dates: string;
    achievements: string[];
  }[];
  education: {
    id: string;
    institution: string;
    degree: string;
    year: string;
  }[];
  projects: {
    id: string;
    name: string;
    description: string;
    techStack: string[];
    link?: string;
  }[];
}

export interface TailoredDocument {
  id: string;
  jobApplicationId: string;
  docType: 'resume' | 'cover_letter';
  content: string;
  missingSkills: string[];
  matchReasons: string[];
  createdAt: string;
}

export interface Interview {
  id: string;
  jobApplicationId: string;
  companyName: string;
  jobTitle: string;
  roundName: string;
  scheduledAt: string;
  interviewerNames?: string;
  prepNotes?: string;
  feedback?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
}

export interface JobOffer {
  id: string;
  jobApplicationId: string;
  companyName: string;
  jobTitle: string;
  baseSalary: number;
  signingBonus: number;
  annualBonusPercent: number;
  equityValue: number;
  benefitsScore: number; // 1-10
  remoteFlexibility: string;
  deadline?: string;
  status: 'pending' | 'accepted' | 'declined' | 'negotiating';
}
