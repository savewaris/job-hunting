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
  linkedin: string;
  github: string;
} {
  const profile = masterProfileData as any;
  const linkedin = profile.socials?.find((s: any) => s.platform.toLowerCase() === 'linkedin')?.url || '';
  const github = profile.socials?.find((s: any) => s.platform.toLowerCase() === 'github')?.url || '';

  return {
    fullName: profile.fullName,
    preferredName: profile.preferredName,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    linkedin,
    github,
  };
}
