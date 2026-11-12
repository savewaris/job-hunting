import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { getCandidateContact, getMasterProfile } from '@/domain/profile';
import type { MasterProfile, Project } from '@/types/profile';

export interface ResumePdfContext {
  companyName?: string | null;
  jobTitle?: string | null;
  jobDescription?: string | null;
  requirements?: string[] | null;
}

// First match wins; the job title is checked, so "Full Stack" is listed before "Front End".
const ROLE_RESUMES: Array<[RegExp, string]> = [
  [/mobile|\bios\b|android|flutter|react native/i, 'waris-cv-mobile.pdf'],
  [/data engineer|etl|data pipeline/i, 'waris-cv-dataengineer.pdf'],
  [/data analyst|business intelligence|\bbi\b|analytics/i, 'waris-cv-dataanalyst.pdf'],
  [/full[- ]?stack/i, 'waris-cv-fullstack.pdf'],
  [/front[- ]?end|\bui\b/i, 'waris-cv-frontend.pdf'],
  [/back[- ]?end|\bapi\b|server/i, 'waris-cv-backend.pdf'],
];

/**
 * The user's own hand-made CV for this role, from RESUME_DIR, or null when the
 * variable is unset or the file is missing (the caller then generates one).
 */
export function readRoleResume(jobTitle?: string | null): Buffer | null {
  const dir = process.env.RESUME_DIR;
  if (!dir) return null;
  const name = ROLE_RESUMES.find(([re]) => re.test(jobTitle ?? ''))?.[1] ?? 'waris-cv.pdf';
  try {
    return fs.readFileSync(path.join(dir, name));
  } catch {
    return null;
  }
}

const rawStyles = {
  page: {
    paddingTop: 32,
    paddingBottom: 32,
    paddingHorizontal: 38,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#111827',
    lineHeight: 1.35,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    paddingBottom: 10,
    marginBottom: 10,
  },
  name: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#0F172A',
  },
  headline: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0284C7',
    marginTop: 2,
  },
  contactRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    marginTop: 4,
    fontSize: 9,
    color: '#334155',
  },
  linkRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    marginTop: 3,
    fontSize: 9,
  },
  link: {
    color: '#0369A1',
    textDecoration: 'underline' as const,
  },
  sep: {
    marginHorizontal: 5,
    color: '#94A3B8',
  },
  section: {
    marginTop: 9,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0F172A',
    textTransform: 'uppercase' as const,
    borderBottomWidth: 0.75,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 2,
    marginBottom: 5,
  },
  summaryText: {
    fontSize: 9.5,
    color: '#1E293B',
  },
  skillText: {
    fontSize: 9.5,
    color: '#1E293B',
  },
  itemBlock: {
    marginBottom: 6,
  },
  itemHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
  },
  itemTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#0F172A',
  },
  itemMeta: {
    fontSize: 8.5,
    color: '#475569',
  },
  itemSub: {
    fontSize: 9,
    color: '#334155',
    marginBottom: 2,
  },
  bullet: {
    fontSize: 9,
    color: '#1E293B',
    marginBottom: 1.5,
  },
};

const h = React.createElement;

function cleanLines(description: string): string[] {
  return description
    .replace(/\*\*/g, '')
    .split('\n')
    .map((l) => l.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
}

export function rankProjectsForJob(
  profile: MasterProfile,
  ctx?: ResumePdfContext,
): Project[] {
  const haystack = `${ctx?.jobTitle ?? ''} ${ctx?.jobDescription ?? ''} ${(ctx?.requirements ?? []).join(' ')}`.toLowerCase();
  if (!haystack.trim()) return profile.projects.slice(0, 4);

  const scored = profile.projects.map((p, idx) => {
    const tokens = new Set(
      `${p.title} ${p.tags ?? ''} ${p.description}`
        .toLowerCase()
        .split(/[^a-z0-9+#.]+/)
        .filter((t) => t.length >= 3),
    );
    let score = 0;
    for (const t of tokens) {
      if (haystack.includes(t)) score += 1;
    }
    return { project: p, score, idx };
  });
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored.slice(0, 4).map((s) => s.project);
}

/**
 * Generates an ATS-clean, single-column A4 PDF buffer grounded strictly in
 * `master-profile.json`, with embedded clickable links to the candidate's
 * Personal Website, GitHub, LinkedIn, and live project demos.
 */
export async function generateTailoredResumePdf(ctx?: ResumePdfContext): Promise<Buffer> {
  const own = readRoleResume(ctx?.jobTitle);
  if (own) return own;
  const { Document, Page, Text, View, Link, StyleSheet, renderToBuffer } = await import(
    '@react-pdf/renderer'
  );
  const styles = StyleSheet.create(rawStyles);
  const profile = getMasterProfile();
  const contact = getCandidateContact();
  const projects = rankProjectsForJob(profile, ctx);
  const roleHeadline = ctx?.jobTitle
    ? `${profile.headline} — Tailored for ${ctx.jobTitle}${ctx.companyName ? ` (${ctx.companyName})` : ''}`
    : profile.headline;

  const element = h(
    Document,
    {
      title: `${contact.fullName} — Resume`,
      author: contact.fullName,
      subject: roleHeadline,
    },
    h(
      Page,
      { size: 'A4', style: styles.page },
      h(
        View,
        { style: styles.header },
        h(Text, { style: styles.name }, `${contact.fullName} (${contact.preferredName})`),
        h(Text, { style: styles.headline }, roleHeadline),
        h(
          View,
          { style: styles.contactRow },
          h(Text, null, contact.location),
          h(Text, { style: styles.sep }, '•'),
          h(Text, null, contact.email),
          h(Text, { style: styles.sep }, '•'),
          h(Text, null, contact.phone),
        ),
        h(
          View,
          { style: styles.linkRow },
          h(Text, null, 'Portfolio: '),
          h(Link, { src: contact.website, style: styles.link }, contact.website),
          h(Text, { style: styles.sep }, '|'),
          h(Text, null, 'GitHub: '),
          h(Link, { src: contact.github, style: styles.link }, contact.github),
          contact.linkedin
            ? h(
                React.Fragment,
                null,
                h(Text, { style: styles.sep }, '|'),
                h(Text, null, 'LinkedIn: '),
                h(Link, { src: contact.linkedin, style: styles.link }, contact.linkedin),
              )
            : null,
        ),
      ),
      h(
        View,
        { style: styles.section },
        h(Text, { style: styles.sectionTitle }, 'Professional Summary'),
        h(Text, { style: styles.summaryText }, profile.summary),
      ),
      h(
        View,
        { style: styles.section },
        h(Text, { style: styles.sectionTitle }, 'Technical Skills'),
        h(Text, { style: styles.skillText }, profile.skills.join(' • ')),
      ),
      h(
        View,
        { style: styles.section },
        h(Text, { style: styles.sectionTitle }, 'Selected Engineering Projects'),
        ...projects.map((proj, idx) => {
          const lines = cleanLines(proj.description).slice(0, 3);
          return h(
            View,
            { key: idx, style: styles.itemBlock },
            h(
              View,
              { style: styles.itemHeader },
              h(Text, { style: styles.itemTitle }, proj.title),
              h(Text, { style: styles.itemMeta }, proj.tags ?? ''),
            ),
            h(
              View,
              { style: styles.linkRow },
              proj.demoUrl
                ? h(
                    React.Fragment,
                    null,
                    h(Text, null, 'Live Demo: '),
                    h(Link, { src: proj.demoUrl, style: styles.link }, proj.demoUrl),
                  )
                : null,
              proj.demoUrl && proj.repoUrl ? h(Text, { style: styles.sep }, '|') : null,
              proj.repoUrl
                ? h(
                    React.Fragment,
                    null,
                    h(Text, null, 'Repo: '),
                    h(Link, { src: proj.repoUrl, style: styles.link }, proj.repoUrl),
                  )
                : null,
            ),
            ...lines.map((line, lIdx) =>
              h(Text, { key: lIdx, style: styles.bullet }, `• ${line}`),
            ),
          );
        }),
      ),
      h(
        View,
        { style: styles.section },
        h(Text, { style: styles.sectionTitle }, 'Work Experience'),
        ...profile.experiences.map((exp, idx) =>
          h(
            View,
            { key: idx, style: styles.itemBlock },
            h(
              View,
              { style: styles.itemHeader },
              h(Text, { style: styles.itemTitle }, `${exp.role} — ${exp.company}`),
              h(
                Text,
                { style: styles.itemMeta },
                `${exp.startDate} – ${exp.endDate || 'Present'}`,
              ),
            ),
            h(
              Text,
              { style: styles.itemSub },
              `${exp.location || 'Bangkok, Thailand'} (${exp.employmentType || 'Internship'})`,
            ),
            ...cleanLines(exp.description).map((line, lIdx) =>
              h(Text, { key: lIdx, style: styles.bullet }, `• ${line}`),
            ),
          ),
        ),
      ),
      h(
        View,
        { style: styles.section },
        h(Text, { style: styles.sectionTitle }, 'Education'),
        ...profile.education.map((edu, idx) =>
          h(
            View,
            { key: idx, style: styles.itemBlock },
            h(
              View,
              { style: styles.itemHeader },
              h(Text, { style: styles.itemTitle }, `${edu.degree} in ${edu.fieldOfStudy}`),
              h(
                Text,
                { style: styles.itemMeta },
                `${edu.startDate} – ${edu.endDate || 'Present'}`,
              ),
            ),
            h(Text, { style: styles.itemSub }, edu.institution),
          ),
        ),
      ),
    ),
  ) as unknown as Parameters<typeof renderToBuffer>[0];
  return renderToBuffer(element);
}
