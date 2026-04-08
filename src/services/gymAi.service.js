// src/services/gymAi.service.js
import Anthropic from '@anthropic-ai/sdk';
import { Errors } from '../utils/errors.js';
import logger from '../utils/logger.js';

let client;
function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw Errors.internal('ANTHROPIC_API_KEY no configurada.');
    }
    client = new Anthropic();
  }
  return client;
}

const GENERATE_SYSTEM = `Sos un entrenador personal experto. Tu trabajo es generar planes de entrenamiento de gimnasio personalizados en formato JSON. Siempre respondé ÚNICAMENTE con JSON válido, sin texto adicional ni markdown.

El JSON debe tener esta estructura exacta:
{
  "exercises": [
    {
      "order": 1,
      "name": "Press de banca plano",
      "muscle_group": "pecho",
      "sets": 4,
      "reps": 10,
      "suggested_weight_kg": 60,
      "rest_seconds": 90,
      "notes": "Mantené los codos a 45 grados"
    }
  ],
  "estimated_duration_min": 45,
  "summary": "Rutina de pecho y tríceps con enfoque en hipertrofia",
  "warmup": "5 min de cardio ligero + movilidad de hombros",
  "cooldown": "Estiramientos de pectorales y tríceps, 3 min"
}

Consideraciones:
- Respetá el tiempo disponible del usuario
- Usá solo el equipamiento que tiene disponible
- Agregá calentamiento y vuelta a la calma
- El peso sugerido es orientativo; si el usuario no dio historial, usá valores conservadores
- Priorizá los grupos musculares que pidió el usuario
- Máximo 8 ejercicios por sesión`;

const REROUTE_SYSTEM = `Sos un entrenador personal experto. El usuario está en medio de una sesión de gimnasio y quiere modificar su plan. Analizá lo que ya hizo, lo que queda, y la instrucción del usuario para generar un plan actualizado.

IMPORTANTE: Respondé ÚNICAMENTE con JSON válido con esta estructura:
{
  "remaining_exercises": [
    {
      "order": 1,
      "name": "...",
      "muscle_group": "...",
      "sets": 3,
      "reps": 12,
      "suggested_weight_kg": 20,
      "rest_seconds": 60,
      "notes": "..."
    }
  ],
  "estimated_remaining_min": 20,
  "reasoning": "El usuario pidió... entonces...",
  "adjustments_made": "Reduje la intensidad y cambié press por aperturas"
}

Consideraciones:
- Si el usuario dice que algo le duele, ELIMINAR todos los ejercicios que involucren esa zona y reemplazar por alternativas seguras
- Si dice que un equipo está ocupado, reemplazar por alternativa equivalente
- Si dice que está cansado, reducir volumen y/o peso
- Si dice que le sobra tiempo, agregar ejercicios complementarios
- NUNCA sugieras ejercicios que requieran equipo que el usuario no mencionó`;

export async function generateWorkoutPlan({ goal, time_available_min, equipment_available, muscle_groups, user_history_summary }) {
  const userPrompt = [
    `Objetivo: ${goal}`,
    `Tiempo disponible: ${time_available_min} minutos`,
    equipment_available ? `Equipamiento disponible: ${equipment_available}` : '',
    `Grupos musculares: ${muscle_groups.join(', ')}`,
    user_history_summary ? `Historial reciente:\n${user_history_summary}` : '',
  ].filter(Boolean).join('\n');

  try {
    const anthropic = getClient();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: GENERATE_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    }, { signal: AbortSignal.timeout(15000) });

    const text = response.content[0]?.text;
    return JSON.parse(text);
  } catch (err) {
    logger.warn(`AI generateWorkoutPlan failed: ${err.message}`);
    return fallbackPlan({ muscle_groups, time_available_min });
  }
}

export async function rerouteWorkout({ current_plan, completed_sets, instruction, time_remaining_min, fatigue_notes }) {
  const userPrompt = [
    `Plan original: ${JSON.stringify(current_plan)}`,
    `Sets completados: ${JSON.stringify(completed_sets)}`,
    `Instrucción del usuario: ${instruction}`,
    `Tiempo restante: ${time_remaining_min} minutos`,
    fatigue_notes ? `Notas de fatiga: ${fatigue_notes}` : '',
  ].filter(Boolean).join('\n');

  try {
    const anthropic = getClient();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: REROUTE_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    }, { signal: AbortSignal.timeout(10000) });

    const text = response.content[0]?.text;
    return JSON.parse(text);
  } catch (err) {
    logger.warn(`AI rerouteWorkout failed: ${err.message}`);
    return {
      remaining_exercises: current_plan?.exercises?.filter((_, i) => i >= (completed_sets?.length ?? 0)) ?? [],
      estimated_remaining_min: time_remaining_min,
      reasoning: 'No se pudo contactar al asistente AI. Continuá con el plan actual.',
      adjustments_made: 'Ninguno — plan sin cambios.',
    };
  }
}

function fallbackPlan({ muscle_groups, time_available_min }) {
  const exerciseDB = {
    pecho:     [{ name: 'Press de banca plano', sets: 3, reps: 10, suggested_weight_kg: 40, rest_seconds: 90 }],
    espalda:   [{ name: 'Remo con barra', sets: 3, reps: 10, suggested_weight_kg: 30, rest_seconds: 90 }],
    piernas:   [{ name: 'Sentadilla con barra', sets: 3, reps: 10, suggested_weight_kg: 40, rest_seconds: 120 }],
    hombros:   [{ name: 'Press militar', sets: 3, reps: 10, suggested_weight_kg: 20, rest_seconds: 90 }],
    brazos:    [{ name: 'Curl de bíceps', sets: 3, reps: 12, suggested_weight_kg: 10, rest_seconds: 60 }],
    core:      [{ name: 'Plancha', sets: 3, reps: 30, suggested_weight_kg: 0, rest_seconds: 60, notes: '30 segundos' }],
    glúteos:   [{ name: 'Hip thrust', sets: 3, reps: 12, suggested_weight_kg: 40, rest_seconds: 90 }],
    tríceps:   [{ name: 'Fondos en paralelas', sets: 3, reps: 10, suggested_weight_kg: 0, rest_seconds: 60 }],
  };

  const exercises = [];
  let order = 0;
  for (const mg of muscle_groups) {
    const key = mg.toLowerCase();
    const exs = exerciseDB[key] || [{ name: `Ejercicio de ${mg}`, sets: 3, reps: 10, suggested_weight_kg: 20, rest_seconds: 60 }];
    for (const ex of exs) {
      order++;
      exercises.push({ order, muscle_group: mg, ...ex });
    }
  }

  return {
    exercises: exercises.slice(0, 8),
    estimated_duration_min: Math.min(time_available_min, 45),
    summary: `Rutina genérica de ${muscle_groups.join(', ')}`,
    warmup: '5 min de cardio ligero + movilidad articular',
    cooldown: 'Estiramientos generales, 3 min',
  };
}
