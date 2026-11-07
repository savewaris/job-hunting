/**
 * Canonical form of a question used as the answer-bank key: Unicode NFKC,
 * lowercase, every run of characters that are not letters, combining marks or
 * numbers collapsed to one space, trimmed. Marks are kept on purpose: Thai
 * vowels and tone marks are Unicode marks, and stripping them would corrupt
 * Thai words. Returns "" when nothing usable remains.
 */
export function normalizeQuestionKey(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\p{Cf}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}
