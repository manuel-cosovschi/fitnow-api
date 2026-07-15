import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the OpenAI layer so we control isAiEnabled / chatJSON per test.
vi.mock('../../src/utils/openai.js', () => ({
  isAiEnabled: vi.fn(),
  chatJSON:    vi.fn(),
  getModel:    () => 'gpt-test',
}));

import { isAiEnabled, chatJSON } from '../../src/utils/openai.js';
import { computeRunMetrics, fallbackAnalysis, analyzeRun, computeTrainingContext } from '../../src/services/runAnalysis.service.js';
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

describe('computeTrainingContext (ACWR)', () => {
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

  it('sin historial devuelve null', () => {
    expect(computeTrainingContext([])).toBe(null);
    expect(computeTrainingContext([{ distance_m: 5000 }])).toBe(null); // sin finished_at
  });

  it('carga pareja queda en zona segura con ACWR cercano a 1', () => {
    // 5 km por semana durante 4 semanas
    const sessions = [3, 10, 17, 24].map((d) => ({ distance_m: 5000, finished_at: daysAgo(d) }));
    const t = computeTrainingContext(sessions);
    expect(t.acute_km).toBe(5);
    expect(t.chronic_weekly_km).toBe(5);
    expect(t.acwr).toBe(1);
    expect(t.label).toBe('zona segura');
  });

  it('un pico de volumen semanal dispara riesgo elevado y aparece en el análisis', () => {
    const sessions = [
      { distance_m: 15000, finished_at: daysAgo(1), avg_pace_s: 360 },
      { distance_m: 12000, finished_at: daysAgo(3) },
      { distance_m: 3000,  finished_at: daysAgo(15) },
      { distance_m: 3000,  finished_at: daysAgo(22) },
    ];
    const t = computeTrainingContext(sessions);
    expect(t.acwr).toBeGreaterThan(1.5);
    expect(t.label).toBe('riesgo elevado');
    expect(t.recent[0].ritmo).toBe('6:00/km');

    const a = fallbackAnalysis(computeRunMetrics(SESSION), t);
    expect(a.improvements.join(' ')).toContain('lesion');
  });

  it('las corridas de hace más de 28 días no cuentan', () => {
    const t = computeTrainingContext([{ distance_m: 40000, finished_at: daysAgo(40) }]);
    expect(t).toBe(null);
  });

  it('analyzeRun incluye la carga de entrenamiento en la respuesta', async () => {
    isAiEnabled.mockReturnValue(false);
    const history = [{ distance_m: 5000, finished_at: daysAgo(2) }];
    const a = await analyzeRun(SESSION, history);
    expect(a.training_load).not.toBe(null);
    expect(a.training_load.acute_km).toBe(5);
  });
});
