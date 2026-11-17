import { describe, expect, it } from 'vitest';
import { hasPlaceholder } from '@/domain/tailoring/coverLetter';

describe('hasPlaceholder', () => {
  it('flags template slots the model left behind', () => {
    expect(hasPlaceholder('[Date]\n\nDear Hiring Team')).toBe(true);
    expect(hasPlaceholder('Kind regards,\n[Your Name]')).toBe(true);
  });
  it('passes a finished letter', () => {
    expect(hasPlaceholder('Dear Hiring Team at Juro,\nSee https://example.com [1]')).toBe(false);
  });
});
