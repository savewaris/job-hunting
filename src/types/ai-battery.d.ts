declare module '@savewaris/ai-battery' {
  export function queryAiWithFallback(
    prompt: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string>;
}
