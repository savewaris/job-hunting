import { describe, expect, it } from 'vitest';
import { scoreFit } from '@/domain/scoring/fit';
import { factCheckLetter } from '@/domain/tailoring/factCheck';
import { buildMasterProfileCoverLetter } from '@/domain/tailoring/coverLetter';

describe('scoreFit', () => {
  it('scores a matching, well-described Bangkok role high with high confidence', () => {
    const r = scoreFit({
      jobTitle: 'Full Stack Engineer',
      jobDescription: 'Build React and TypeScript apps on Next.js with PostgreSQL. '.repeat(5),
      requirements: ['React', 'TypeScript', 'PostgreSQL'],
      location: 'Bangkok, Thailand',
    });
    expect(r.score).toBe(5);
    expect(r.confidence).toBe('high');
  });

  it('gives an unrelated title with no text the floor score and low confidence', () => {
    const r = scoreFit({ jobTitle: 'Plumber', location: 'Chiang Mai' });
    expect(r).toMatchObject({ score: 1, confidence: 'low' });
  });
});

describe('factCheckLetter', () => {
  it('passes the profile-grounded template letter', () => {
    const letter = buildMasterProfileCoverLetter({ companyName: 'Acme', jobTitle: 'Full Stack Engineer' });
    expect(factCheckLetter(letter)).toEqual([]);
  });

  it('flags tech, years and metrics the profile does not back', () => {
    const claims = factCheckLetter(
      'I have 5 years of experience with Kubernetes and cut latency by 40%.',
    );
    expect(claims).toHaveLength(3);
  });

  it('does not match a term inside another word', () => {
    expect(factCheckLetter('I enjoy going beyond the brief.')).toEqual([]);
  });
});
