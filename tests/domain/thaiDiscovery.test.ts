import { describe, expect, it } from 'vitest';
import { classifyRoleStatus } from '@/domain/companies/discover';

describe('Thai-aware role classification', () => {
  it('matches a Thai title mixed with Latin text in a Thai location', () => {
    expect(classifyRoleStatus('นักพัฒนาซอฟต์แวร์ Full Stack', 'กรุงเทพมหานคร')).toBe('wishlist');
  });

  it('flags Thai seniority words as maybe', () => {
    expect(classifyRoleStatus('วิศวกรซอฟต์แวร์อาวุโส', 'กรุงเทพ')).toBe('maybe');
  });

  it('ignores non-engineering Thai titles', () => {
    expect(classifyRoleStatus('พนักงานขาย', 'กรุงเทพ')).toBe('ignore');
  });

  it('still ignores a non-Bangkok Thai city', () => {
    expect(classifyRoleStatus('Developer', 'เชียงใหม่')).toBe('ignore');
  });

  it('accepts the Thai word for Thailand as a location', () => {
    expect(classifyRoleStatus('Developer', 'ประเทศไทย')).toBe('wishlist');
  });
});
