import { describe, expect, it } from 'vitest';
import { parseGreenhouseChoices } from '@/domain/ats/greenhouseOptions';
import { normalizeQuestionKey } from '@/domain/answers/key';

describe('parseGreenhouseChoices', () => {
  it('keeps original choices and multi flag, ignores free-text questions', () => {
    const m = parseGreenhouseChoices({
      questions: [
        { label: 'Work authorised?', fields: [{ type: 'multi_value_single_select', values: [{ label: 'Yes' }, { label: 'No' }] }] },
        { label: 'Which stacks?', fields: [{ type: 'multi_value_multi_select', values: [{ label: 'Go' }, { label: 'TS' }] }] },
        { label: 'Why us?', fields: [{ type: 'textarea' }] },
      ],
    });
    expect(m.get(normalizeQuestionKey('Work authorised?'))).toEqual({ choices: ['Yes', 'No'], multi: false });
    expect(m.get(normalizeQuestionKey('Which stacks?'))?.multi).toBe(true);
    expect(m.has(normalizeQuestionKey('Why us?'))).toBe(false);
  });

  it("reads demographic questions and the up-to-N limit", () => {
    const m = parseGreenhouseChoices({
      demographic_questions: {
        questions: [{ label: "Please select up to 2 ethnicities.", type: "multi_value_multi_select", answer_options: [{ label: "A" }, { label: "B" }] }],
      },
    });
    expect(m.get(normalizeQuestionKey("Please select up to 2 ethnicities."))).toEqual({ choices: ["A", "B"], multi: true, max: 2 });
  });
});
