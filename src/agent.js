// La conversation avec Claude : la requête et un tour complet. Pur — le réseau est injecté
// (`send`), ce qui permet de tout tester sans clé ni jeton dépensé.
//
// Ordre de rendu côté API : system → messages. Le point de cache se pose sur le dernier bloc
// stable (le résumé du vault, ou la persona s'il n'y en a pas) ; la date et la consigne d'oral
// passent après, hors cache.
import { PERSONA, contextBlock } from './persona.js';

export const API_URL = 'https://api.anthropic.com/v1/messages';
export const MODEL = 'claude-sonnet-5-5';
// Sonnet 5.5 : si ses classificateurs déclinent une question, l'API la rejoue sur le modèle de
// repli recommandé au lieu de rendre un refus sec.
export const BETAS = ['server-side-fallback-2026-07-01'];

export function buildRequest(messages, now, { digest = '', oral = false } = {}) {
  const cache = { cache_control: { type: 'ephemeral' } };
  const d = String(digest || '').trim();
  const system = [{ type: 'text', text: PERSONA, ...(d ? {} : cache) }];
  if (d) system.push({ type: 'text', text: `# Résumé du vault de Krimo\n\n${d}`, ...cache });
  system.push({ type: 'text', text: contextBlock(now, { oral }) });
  return {
    body: {
      model: MODEL,
      max_tokens: 16000,
      system,
      messages,
      // À l'oral, chaque seconde de réflexion est une seconde de silence.
      output_config: { effort: oral ? 'low' : 'medium' },
      fallbacks: 'default'
    },
    betas: BETAS
  };
}

const texteDe = content => (content || []).filter(b => b.type === 'text').map(b => b.text).join('\n\n').trim();

/**
 * Un tour : pousse la question, appelle l'API, pousse la réponse. `messages` est modifié en place
 * (ajout seul). En cas d'erreur réseau, l'appelant remet l'historique à sa longueur d'avant.
 * @returns {{text: string, stop: string, usage: object|undefined}}
 */
export async function runTurn({ messages, question, now, digest, oral = false, send }) {
  messages.push({ role: 'user', content: question });
  const { body, betas } = buildRequest(messages, now, { digest, oral });
  const res = await send(body, betas);
  messages.push({ role: 'assistant', content: res.content || [] });
  if (res.stop_reason === 'refusal') {
    return { text: texteDe(res.content) || 'NYX a décliné cette demande.', stop: 'refusal', usage: res.usage };
  }
  return { text: texteDe(res.content), stop: res.stop_reason, usage: res.usage };
}

/** Le message d'erreur lisible d'une réponse HTTP en échec. */
export function apiErrorMessage(status, json) {
  if (status === 401) return 'clé API Claude refusée — vérifie-la dans les réglages';
  if (status === 429) return 'trop de requêtes — réessaie dans une minute';
  if (status === 529 || status >= 500) return `l'API est surchargée (${status}) — réessaie`;
  return (json && json.error && json.error.message) || `HTTP ${status}`;
}
