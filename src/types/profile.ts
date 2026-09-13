export interface Skill {
  name: string;
  proficiency?: number;
  category?: string;
}

export interface Experience {
  role: string;
  company: string;
  location?: string;
  employmentType?: string;
  locationType?: string;
  startDate?: string;
  endDate?: string | null;
  description: string;
}

export interface Education {
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startDate?: string;
  endDate?: string | null;
}

export interface Project {
  title: string;
  description: string;
  tags?: string;
  demoUrl?: string;
  repoUrl?: string;
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface JobPreferences {
  targetRoles: string[];
  targetLocations: string[];
  workplaceType: 'remote' | 'hybrid' | 'onsite' | 'any';
  minSalaryTHB?: number;
}

export interface MasterProfile {
  fullName: string;
  preferredName?: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  skills: string[];
  detailedSkills: Skill[];
  experiences: Experience[];
  education: Education[];
  projects: Project[];
  socials: SocialLink[];
  preferences: JobPreferences;
  syncedAt: string;
}
