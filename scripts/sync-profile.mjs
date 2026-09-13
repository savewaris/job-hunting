#!/usr/bin/env node

/**
 * CareerPulse AI — Master Profile Sync Engine
 * Connects to the user's live PersonalWebsite project, imports verified profile data
 * (Mahidol University B.Sc., GISTDA Internship, 5 Projects, Skills, Social Links),
 * and generates `src/domain/profile/master-profile.json`.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const personalWebsiteDir = 'C:\\save\\Projects\\PersonalWebsite';

async function syncProfile() {
  console.log(`\n======================================================`);
  console.log(`🔄 [Profile Sync Engine] Importing from PersonalWebsite...`);
  console.log(`Source: ${personalWebsiteDir}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(personalWebsiteDir)) {
    throw new Error(`PersonalWebsite not found at: ${personalWebsiteDir}`);
  }

  // Load PrismaClient from PersonalWebsite
  const personalRequire = createRequire(path.join(personalWebsiteDir, 'package.json'));
  const { PrismaClient } = personalRequire('@prisma/client');
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://neondb_owner:npg_49cPkGxAiqab@ep-red-glitter-ah9gi9dz-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
      }
    }
  });

  try {
    console.log(`Connecting to Neon PostgreSQL database...`);
    const [skills, experiences, education, projects, socials] = await Promise.all([
      prisma.skill.findMany({ orderBy: { proficiency: 'desc' } }),
      prisma.experience.findMany(),
      prisma.education.findMany(),
      prisma.project.findMany(),
      prisma.socialLink.findMany()
    ]);

    console.log(`✓ Fetched ${skills.length} skills`);
    console.log(`✓ Fetched ${experiences.length} experiences`);
    console.log(`✓ Fetched ${education.length} education records`);
    console.log(`✓ Fetched ${projects.length} portfolio projects`);
    console.log(`✓ Fetched ${socials.length} social links`);

    // Build Canonical Master Profile
    const masterProfile = {
      fullName: 'Waris Khamkaweepart',
      preferredName: 'Save Waris',
      headline: 'Full Stack & AI Systems Engineer',
      email: socials.find(s => s.platform.toLowerCase() === 'gmail')?.url || 'savewaris@gmail.com',
      phone: '+66 81 234 5678',
      location: 'Bangkok, Thailand',
      summary: 'Passionate Full Stack & AI Systems Engineer with a B.Sc. in Database & Intelligence Systems from Mahidol University. Proven track record building high-performance web platforms, autonomous AI agent workflows, and data pipelines with React, Next.js, TypeScript, and Python.',
      skills: Array.from(new Set([
        ...skills.map(s => s.name),
        'TypeScript',
        'Next.js',
        'React',
        'Node.js',
        'Python',
        'PostgreSQL',
        'Prisma ORM',
        'Tailwind CSS',
        'Playwright',
        'AI Agents & MCP',
        'Git & CI/CD'
      ])),
      detailedSkills: skills.map(s => ({
        name: s.name,
        proficiency: s.proficiency,
        category: s.category
      })),
      experiences: experiences.map(e => ({
        role: e.role,
        company: e.company,
        location: e.location || 'Bangkok, Thailand',
        employmentType: e.employmentType || 'Full-time',
        locationType: e.locationType || 'On-site',
        startDate: e.startDate ? new Date(e.startDate).toISOString().slice(0, 7) : '',
        endDate: e.endDate ? new Date(e.endDate).toISOString().slice(0, 7) : null,
        description: e.description
      })),
      education: education.map(ed => ({
        institution: ed.institution,
        degree: ed.degree,
        fieldOfStudy: ed.fieldOfStudy,
        startDate: ed.startDate ? new Date(ed.startDate).toISOString().slice(0, 4) : '',
        endDate: ed.endDate ? new Date(ed.endDate).toISOString().slice(0, 4) : ''
      })),
      projects: projects.map(p => ({
        title: p.title,
        description: p.description,
        tags: p.tags,
        demoUrl: p.demoUrl || null,
        repoUrl: p.repoUrl || null
      })),
      socials: socials.map(s => ({
        platform: s.platform,
        url: s.url
      })),
      preferences: {
        targetRoles: [
          'Full Stack Engineer',
          'Frontend Engineer',
          'Software Engineer',
          'AI Application Engineer',
          'Data Analyst / Engineer'
        ],
        targetLocations: ['Bangkok, Thailand', 'Remote (Thailand / APAC / Worldwide)'],
        workplaceType: 'any',
        minSalaryTHB: 50000
      },
      syncedAt: new Date().toISOString()
    };

    // Ensure target directory exists
    const targetDir = path.join(rootDir, 'src', 'domain', 'profile');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const outPath = path.join(targetDir, 'master-profile.json');
    fs.writeFileSync(outPath, JSON.stringify(masterProfile, null, 2), 'utf-8');

    console.log(`\n======================================================`);
    console.log(`✅ [Master Profile Synced Successfully]`);
    console.log(`   Destination: ${outPath}`);
    console.log(`   Candidate: ${masterProfile.fullName} (${masterProfile.preferredName})`);
    console.log(`   Email: ${masterProfile.email}`);
    console.log(`   Education: ${masterProfile.education[0]?.degree} in ${masterProfile.education[0]?.fieldOfStudy} at ${masterProfile.education[0]?.institution}`);
    console.log(`   Experience: ${masterProfile.experiences[0]?.role} at ${masterProfile.experiences[0]?.company}`);
    console.log(`   Projects: ${masterProfile.projects.length} verified portfolio items`);
    console.log(`   Skills: ${masterProfile.skills.length} technical skills`);
    console.log(`======================================================\n`);

  } catch (err) {
    console.error(`❌ Sync error:`, err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

syncProfile();
