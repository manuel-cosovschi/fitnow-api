// src/controllers/ai.controller.js
import logger from '../utils/logger.js';
import { chatStream, getModel, isAiEnabled } from '../utils/openai.js';
import * as aiRepo from '../repositories/ai.repository.js';

function buildSystemPrompt(context) {
  const parts = ['Eres FitNow Coach, un entrenador deportivo virtual experto en running y gimnasio. Respondés siempre en español, de forma motivadora y concisa.'];
  if (context) {
    if (context.streak_days)     parts.push(`El usuario lleva ${context.streak_days} días de racha activa.`);
    if (context.recent_run_km)   parts.push(`Recientemente corrió ${context.recent_run_km} km.`);
    if (context.recent_gym_sets) parts.push(`Realizó ${context.recent_gym_sets} series en el gimnasio recientemente.`);
    if (context.level)           parts.push(`Está en el nivel ${context.level} de la app.`);
  }
  return parts.join(' ');
}

function writeSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

function emitStubStream(res) {
  const stub = 'Hola! Soy tu coach FitNow. Por ahora estoy en modo demo, pero pronto estaré activo para ayudarte con tu entrenamiento. ¡Seguí adelante!';
  for (const token of stub.split(' ')) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: token + ' ' } }] })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  return stub;
}

export async function coach(req, res, next) {
  try {
    // req.body has been validated upstream by validateBody(coachRequestSchema).
    const { message, context } = req.body;
    const userId = req.user.id;

    // Persist the user turn before we kick off the AI request — guarantees
    // history captures everything the user said even if the upstream errors.
    await aiRepo.saveCoachTurn({ userId, role: 'user', content: message, aiMode: 'real' }).catch(() => {});

    if (!isAiEnabled()) {
      writeSseHeaders(res);
      const stubText = emitStubStream(res);
      await aiRepo.saveCoachTurn({ userId, role: 'coach', content: stubText, aiMode: 'stub' }).catch(() => {});
      await aiRepo.logUsage({ userId, endpoint: 'coach', model: getModel(), usage: null, status: 'stub' }).catch(() => {});
      return res.end();
    }

    const upstream = await chatStream({
      messages: [
        { role: 'system', content: buildSystemPrompt(context) },
        { role: 'user',   content: message },
      ],
    });

    if (!upstream || !upstream.ok) {
      const errText = upstream ? await upstream.text().catch(() => '') : '';
      logger.error('OpenAI coach error:', errText);
      return res.status(502).json({ error: { code: 'AI_UPSTREAM', message: 'Error al conectar con el coach IA.', status: 502 } });
    }

    writeSseHeaders(res);
    const reader  = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assembled = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') { res.write('data: [DONE]\n\n'); continue; }
        // Attempt to extract delta.content for assembly; pass through verbatim.
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) assembled += delta;
        } catch { /* ignore parse errors, still forward the chunk */ }
        res.write(`data: ${data}\n\n`);
      }
    }

    res.end();

    // After the stream finishes, persist the assembled coach reply + log usage.
    // Tokens aren't returned in streaming mode by OpenAI, so we leave usage null.
    aiRepo.saveCoachTurn({ userId, role: 'coach', content: assembled, aiMode: 'real' }).catch(() => {});
    aiRepo.logUsage({ userId, endpoint: 'coach', model: getModel(), usage: null, status: 'ok' }).catch(() => {});
  } catch (err) {
    logger.error('AI coach error:', err);
    if (!res.headersSent) next(err);
    else res.end();
  }
}

// ── Coach history ─────────────────────────────────────────────────────────────

export async function coachHistory(req, res, next) {
  try {
    const { limit, before } = req.query;
    const items = await aiRepo.listCoachTurns({ userId: req.user.id, limit, before });
    res.json({ items });
  } catch (err) { next(err); }
}

// ── Form check ───────────────────────────────────────────────────────────────

export async function formCheckCreate(req, res, next) {
  try {
    const saved = await aiRepo.saveFormCheck({ userId: req.user.id, ...req.body });
    res.status(201).json(saved);
  } catch (err) { next(err); }
}

export async function formCheckList(req, res, next) {
  try {
    const { limit, exercise } = req.query;
    const items = await aiRepo.listFormChecks({ userId: req.user.id, limit, exercise });
    res.json({ items });
  } catch (err) { next(err); }
}
