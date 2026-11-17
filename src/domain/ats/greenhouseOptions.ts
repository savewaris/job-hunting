import { normalizeQuestionKey } from '@/domain/answers/key';

export interface QuestionChoices {
  choices: string[];
  multi: boolean;
  max?: number;
}

const GH_URL_RE = /^https:\/\/(?:job-boards|boards)\.greenhouse\.io\/([\w-]+)\/jobs\/(\d+)/i;

interface GhQuestion {
  label?: string;
  fields?: { type?: string; values?: { label?: string }[] }[];
  // demographic (EEO) questions are flat, with their own type and answer_options
  type?: string;
  answer_options?: { label?: string }[];
}

/** Pure: maps normalised question key -> original choices from a Greenhouse questions payload. */
export function parseGreenhouseChoices(data: {
  questions?: GhQuestion[];
  demographic_questions?: { questions?: GhQuestion[] };
}): Map<string, QuestionChoices> {
  const out = new Map<string, QuestionChoices>();
  const all = [...(data.questions ?? []), ...(data.demographic_questions?.questions ?? [])];
  for (const q of all) {
    const f = q.fields?.find((x) => x.type?.startsWith("multi_value"));
    const type = f?.type ?? q.type;
    const raw = f?.values ?? q.answer_options ?? [];
    const choices = raw.map((v) => v.label ?? "").filter(Boolean);
    const key = normalizeQuestionKey(q.label ?? "");
    if (type?.startsWith("multi_value") && key && choices.length > 0) {
      const max = /up to (\d+)/i.exec(q.label ?? "")?.[1];
      out.set(key, { choices, multi: type === "multi_value_multi_select", ...(max && { max: Number(max) }) });
    }
  }
  return out;
}

/** Fetches a posting's question choices from Greenhouse's public API. Empty map for non-Greenhouse URLs or failures. */
export async function fetchGreenhouseChoices(jobUrl: string): Promise<Map<string, QuestionChoices>> {
  const m = GH_URL_RE.exec(jobUrl);
  if (!m) return new Map();
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs/${m[2]}?questions=true`,
      { signal: AbortSignal.timeout(8000) },
    );
    return res.ok ? parseGreenhouseChoices(await res.json()) : new Map();
  } catch {
    return new Map();
  }
}
