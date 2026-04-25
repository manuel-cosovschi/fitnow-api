// src/controllers/ai.controller.js
import { queryOne } from '../db.js';
import logger from '../utils/logger.js';

const OPENAI_MODEL = () => process.env.OPENAI_MODEL || 'gpt-4o';

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

export async function coach(req, res, next) {
  try {
    const { message, context } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'message requerido.' });
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      const stub = 'Hola! Soy tu coach FitNow. Por ahora estoy en modo demo, pero pronto estaré activo para ayudarte con tu entrenamiento. ¡Seguí adelante!';
      for (const token of stub.split(' ')) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: token + ' ' } }] })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const systemPrompt = buildSystemPrompt(context);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model:  OPENAI_MODEL(),
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: message },
        ],
        temperature: 0.8,
        max_tokens:  512,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error('OpenAI coach error:', err);
      return res.status(502).json({ error: 'Error al conectar con el coach IA.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
          } else {
            res.write(`data: ${data}\n\n`);
          }
        }
      }
    }

    res.end();
  } catch (err) {
    logger.error('AI coach error:', err);
    if (!res.headersSent) next(err);
    else res.end();
  }
}
