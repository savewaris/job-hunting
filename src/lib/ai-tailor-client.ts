import { queryAiWithFallback } from '@savewaris/ai-battery';

export async function generateTailoredContent(prompt: string): Promise<string> {
  const response = await queryAiWithFallback(prompt, {
    temperature: 0.4,
    maxTokens: 1200,
  });
  return response.trim();
}
