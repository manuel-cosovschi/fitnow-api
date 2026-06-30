import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the OpenAI layer so we control isAiEnabled / chatJSON per test.
vi.mock('../../src/utils/openai.js', () => ({
  isAiEnabled: vi.fn(),
  chatJSON:    vi.fn(),
  getModel:    () => 'gpt-test',
}));

import { isAiEnabled, chatJSON } from '../../src/utils/openai.js';
import { computeRunMetrics, fallbackAnalysis, analyzeRun } from '../../src/services/runAnalysis.service.js';
import { runAnalysisSchema } from '../../src/utils/aiGuardrails.js';

const SESSION = {
  distance_m: 5000, duration_s: 1800, avg_hr_bpm: 150,
  deviates_count: 0, max_elevation_m: 50, min_elevation_m: 30,
};

beforeEach(() => { vi.clearAllMocks(); });

describe('computeRunMetrics', () => {
  it('derives pace from distance and duration', () => {
    const m = computeRunMetrics(SESSION);
    expect(m.distance_km).toBe(5);
    expect(m.duration_min).toBe(30);
    expect(m.pace_s_per_km).toBe(360);
    expect(m.pace_label).toBe('6:00/km');
    expect(m.elev_gain_m).toBe(20);
  });
});

describe('fallbackAnalysis', () => {
  it('produces a schema-valid, grounded analysis with no LLM', () => {
    const a = fallbackAnalysis(computeRunMetrics(SESSION));
    expect(runAnalysisSchema.safeParse(a).success).toBe(true);
    expect(a.headline).toContain('5');
  });
});

describe('analyzeRun', () => {
  it('uses the deterministic analysis when AI is disabled', async () => {
    isAiEnabled.mockReturnValue(false);
    const a = await analyzeRun(SESSION);
    expect(a.ai_mode).toBe('stub');
    expect(a.metrics.pace_label).toBe('6:00/km');
    expect(chatJSON).not.toHaveBeenCalled();
  });

  it('accepts and grounds a valid LLM response', async () => {
    isAiEnabled.mockReturnValue(true);
    chatJSON.mockResolvedValue({
      ok: true, mode: 'real',
      data: {
        headline: 'Gran corrida', summary: 'Muy bien.', pace_assessment: 'Sólido.',
        strengths: ['Constancia'], improvements: ['Series'],
        recommendation: 'Descansá.', next_run: { distance_km: 99, focus: 'ritmo' },
      },
    });
    const a = await analyzeRun(SESSION);
    expect(a.ai_mode).toBe('real');
    expect(a.headline).toBe('Gran corrida');
    // numbers stay ours, not the model's 99
    expect(a.metrics.distance_km).toBe(5);
    expect(a.next_run.distance_km).toBe(5);
  });

  it('rejects an invalid LLM response and falls back', async () => {
    isAiEnabled.mockReturnValue(true);
    chatJSON.mockResolvedValue({ ok: true, data: { headline: 'incompleto' } });
    const a = await analyzeRun(SESSION);
    expect(a.ai_mode).toBe('stub');
    expect(runAnalysisSchema.safeParse(a).success).toBe(true);
  });

  it('falls back when the upstream throws', async () => {
    isAiEnabled.mockReturnValue(true);
    chatJSON.mockRejectedValue(new Error('network'));
    const a = await analyzeRun(SESSION);
    expect(a.ai_mode).toBe('stub');
  });
});
