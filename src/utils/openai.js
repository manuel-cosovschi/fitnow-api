// src/utils/openai.js
// Centralized OpenAI client used by every AI feature.
//
// Goals:
//  - Single source of truth for endpoint URL, model, timeout, temperature, max_tokens
//    — all driven by environment variables so production can swap providers (Azure
//    OpenAI, self-hosted llama.cpp with OpenAI-compatible API, etc.) without code
//    changes.
//  - Retry-with-backoff on 5xx/timeouts (1 retry by default).
//  - Surface a consistent { ok, data, mode, usage } envelope so callers always know
//    whether they got a real AI response or a stub fallback, and how many tokens
//    were consumed (for cost observability).
//
// Env vars (all optional except OPENAI_API_KEY for real mode):
//  OPENAI_API_KEY        Real-mode trigger. Without it, every call returns mode='stub'.
//  OPENAI_API_BASE       Default 'https://api.openai.com/v1'. Override for Azure / proxy.
//  OPENAI_MODEL          Default 'gpt-4o'.
//  OPENAI_TIMEOUT_MS     Default 20000.
//  OPENAI_MAX_RETRIES    Default 1.
//  OPENAI_TEMPERATURE    Default 0.7.
//  OPENAI_MAX_TOKENS     Default 1024.

import logger from './logger.js';

const DEFAULTS = {
  base:        'https://api.openai.com/v1',
  model:       'gpt-4o',
  timeoutMs:   20000,
  maxRetries:  1,
  temperature: 0.7,
  maxTokens:   1024,
};

export function isAiEnabled() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function config() {
  return {
    apiKey:      process.env.OPENAI_API_KEY ?? null,
    base:        process.env.OPENAI_API_BASE     || DEFAULTS.base,
    model:       process.env.OPENAI_MODEL        || DEFAULTS.model,
    timeoutMs:   parseInt(process.env.OPENAI_TIMEOUT_MS,   10) || DEFAULTS.timeoutMs,
    maxRetries:  parseInt(process.env.OPENAI_MAX_RETRIES,  10) || DEFAULTS.maxRetries,
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE)    || DEFAULTS.temperature,
    maxTokens:   parseInt(process.env.OPENAI_MAX_TOKENS,   10) || DEFAULTS.maxTokens,
  };
}

async function fetchWithRetry(url, init, { timeoutMs, maxRetries }) {
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      // Retry on 5xx; surface 4xx immediately (caller bug or auth issue, not transient).
      if (resp.status >= 500 && attempt < maxRetries) {
        const body = await resp.text().catch(() => '');
        logger.warn(`[openai] ${resp.status} on attempt ${attempt + 1}, retrying`, { body: body.slice(0, 200) });
        await sleep(250 * Math.pow(2, attempt));
        continue;
      }
      return resp;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        logger.warn(`[openai] fetch error on attempt ${attempt + 1}, retrying`, { message: err.message });
        await sleep(250 * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error('openai: unreachable');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Non-streaming JSON chat completion.
 * @param {{ messages: Array<{role: string, content: string}>, jsonMode?: boolean, model?: string, temperature?: number, maxTokens?: number }} opts
 * @returns {Promise<{ok: true, data: any, mode: 'real', usage: {prompt_tokens, completion_tokens, total_tokens}, model: string} | {ok: false, mode: 'stub', reason: string}>}
 */
export async function chatJSON(opts) {
  const cfg = config();
  if (!cfg.apiKey) return { ok: false, mode: 'stub', reason: 'no_api_key' };

  const body = {
    model:       opts.model       ?? cfg.model,
    messages:    opts.messages,
    temperature: opts.temperature ?? cfg.temperature,
    max_tokens:  opts.maxTokens   ?? cfg.maxTokens,
  };
  if (opts.jsonMode) body.response_format = { type: 'json_object' };

  try {
    const resp = await fetchWithRetry(`${cfg.base}/chat/completions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body:    JSON.stringify(body),
    }, { timeoutMs: cfg.timeoutMs, maxRetries: cfg.maxRetries });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      logger.error(`[openai] non-OK ${resp.status}`, { body: errText.slice(0, 500) });
      return { ok: false, mode: 'stub', reason: `http_${resp.status}` };
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    let parsed = content;
    if (opts.jsonMode) {
      try { parsed = JSON.parse(content); }
      catch {
        logger.error('[openai] response was not valid JSON despite jsonMode', { preview: content.slice(0, 200) });
        return { ok: false, mode: 'stub', reason: 'invalid_json' };
      }
    }
    return {
      ok:    true,
      mode:  'real',
      data:  parsed,
      model: data.model ?? body.model,
      usage: data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  } catch (err) {
    logger.error('[openai] chatJSON failed', { message: err.message });
    return { ok: false, mode: 'stub', reason: err.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
}

/**
 * Streaming chat completion. Returns the upstream Response so callers can pipe
 * SSE chunks directly to the client. Returns null when running in stub mode
 * (no API key) so callers can serve a stub stream instead.
 */
export async function chatStream(opts) {
  const cfg = config();
  if (!cfg.apiKey) return null;

  const body = {
    model:       opts.model       ?? cfg.model,
    messages:    opts.messages,
    temperature: opts.temperature ?? cfg.temperature,
    max_tokens:  opts.maxTokens   ?? cfg.maxTokens,
    stream:      true,
  };

  // Streaming: no retry (the response is consumed as it arrives).
  return fetch(`${cfg.base}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(cfg.timeoutMs),
  });
}

export function getModel() {
  return config().model;
}
