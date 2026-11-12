import masterProfileData from './master-profile.json';
import { MasterProfile } from '@/types/profile';

export function getMasterProfile(): MasterProfile {
  return masterProfileData as MasterProfile;
}

export function getTargetSkills(): string[] {
  return (masterProfileData as MasterProfile).skills;
}

export function getTargetRoles(): string[] {
  return (masterProfileData as MasterProfile).preferences.targetRoles;
}

export function getCandidateContact(): {
  fullName: string;
  preferredName: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  linkedin: string;
  github: string;
} {
  const profile = masterProfileData as MasterProfile;
  const website =
    profile.websiteUrl ||
    profile.socials?.find((s) => /website|portfolio/i.test(s.platform))?.url ||
    'https://personal-website-full-stack.vercel.app';
  const linkedin =
    profile.linkedinUrl ||
    profile.socials?.find((s) => s.platform.toLowerCase() === 'linkedin')?.url ||
    '';
  const github =
    profile.githubUrl ||
    profile.socials?.find((s) => s.platform.toLowerCase() === 'github')?.url ||
    'https://github.com/savewaris';

  return {
    fullName: profile.fullName,
    preferredName: profile.preferredName || 'Save Waris',
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    website,
    linkedin,
    github,
  };
}
