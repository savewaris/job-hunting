/**
 * Multi-Provider Free-Tier AI Battery with Graceful Fallback
 *
 * Rotates across free-tier LLM providers so AI calls in this app carry
 * zero marginal token cost. Tries each candidate in order and moves on
 * to the next whenever a provider is missing its API key, throttled, or
 * erroring. Only providers with a configured API key are attempted.
 *
 * Env vars read (all optional except at least one is required):
 *   GEMINI_API_KEY or GOOGLE_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY
 * These are loaded the normal Next.js way (.env.local / .env), no custom path scanning.
 */

async function callGoogle(model: string, prompt: string, options: any = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature || 0.2,
        maxOutputTokens: options.maxTokens || 2048,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  options: any = {},
  providerName: string = ''
) {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature || 0.2,
      max_tokens: options.maxTokens || 2048,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${providerName} API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

const CANDIDATE_CHAIN = [
  { provider: 'google', model: 'gemini-2.5-flash' },
  { provider: 'google', model: 'gemini-2.5-flash-lite' },
  { provider: 'google', model: 'gemini-1.5-flash' },
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  { provider: 'groq', model: 'llama-3.1-8b-instant' },
  { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' },
  { provider: 'openrouter', model: 'google/gemini-2.0-flash-lite-preview-02-05:free' },
  { provider: 'cerebras', model: 'llama3.3-70b' },
] as const;

export async function queryAiWithFallback(prompt: string, options: any = {}): Promise<string> {
  let lastError: any = null;

  for (const { provider, model } of CANDIDATE_CHAIN) {
    try {
      if (provider === 'google' && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
        return await callGoogle(model, prompt, options);
      } else if (provider === 'groq' && process.env.GROQ_API_KEY) {
        return await callOpenAiCompatible(
          'https://api.groq.com/openai/v1',
          process.env.GROQ_API_KEY,
          model,
          prompt,
          options,
          'groq'
        );
      } else if (provider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
        return await callOpenAiCompatible(
          'https://openrouter.ai/api/v1',
          process.env.OPENROUTER_API_KEY,
          model,
          prompt,
          options,
          'openrouter'
        );
      } else if (provider === 'cerebras' && process.env.CEREBRAS_API_KEY) {
        return await callOpenAiCompatible(
          'https://api.cerebras.ai/v1',
          process.env.CEREBRAS_API_KEY,
          model,
          prompt,
          options,
          'cerebras'
        );
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[AI Battery Failover] ${provider}/${model} unavailable (${err?.message?.slice(0, 80)}). Rotating...`);
    }
  }

  throw new Error(`All providers in AI battery exhausted: ${lastError?.message || 'No active API keys found'}`);
}
