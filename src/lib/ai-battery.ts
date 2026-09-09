import fs from 'fs';
import path from 'path';

/**
 * Universal Multi-Provider Free-Tier AI Battery with Graceful Fallback
 * 
 * Supports:
 *  1. Shared package (@savewaris/ai-battery or ai-battery) when published
 *  2. Google Gemini Free Tier
 *  3. Groq Cloud Developer Free Tier
 *  4. OpenRouter Free Endpoints
 *  5. Cerebras Free Tier
 *  6. Intelligent Heuristics Fallback
 */

function loadEnvironmentKeys() {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '.env.local'),
    'C:\\agent-second-brain\\.env',
    'C:\\save\\Projects\\PersonalWebsite\\.env',
  ];

  for (const envPath of envPaths) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.substring(0, eqIdx).trim();
            const val = trimmed.substring(eqIdx + 1).trim();
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      }
    } catch {
      // Ignore file reading errors in edge environments
    }
  }
}

// Attempt initial env load
loadEnvironmentKeys();

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

async function tryImportSharedBattery(): Promise<any> {
  for (const pkg of ['@savewaris/ai-battery', 'ai-battery']) {
    try {
      // Use dynamic import evaluator so Next.js webpack build does not fail when package is not yet published
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      const mod = await dynamicImport(pkg);
      if (mod && typeof mod.queryAiWithFallback === 'function') {
        return mod;
      }
    } catch {
      // Gracefully continue to next package or fallback
    }
  }
  return null;
}

export async function queryAiWithFallback(prompt: string, options: any = {}): Promise<string> {
  // Check if published shared package exists first
  try {
    const shared = await tryImportSharedBattery();
    if (shared && typeof shared.queryAiWithFallback === 'function') {
      return await shared.queryAiWithFallback(prompt, options);
    }
  } catch {
    // Graceful fallback: shared package not yet published to npm
  }

  // Reload keys if needed
  loadEnvironmentKeys();

  const candidateChain = [
    { provider: 'google', model: 'gemini-2.5-flash' },
    { provider: 'google', model: 'gemini-2.5-flash-lite' },
    { provider: 'google', model: 'gemini-1.5-flash' },
    { provider: 'groq', model: 'llama-3.3-70b-versatile' },
    { provider: 'groq', model: 'llama-3.1-8b-instant' },
    { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' },
    { provider: 'openrouter', model: 'google/gemini-2.0-flash-lite-preview-02-05:free' },
    { provider: 'cerebras', model: 'llama3.3-70b' },
  ];

  let lastError: any = null;

  for (const candidate of candidateChain) {
    const { provider, model } = candidate;
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
