// La conversation avec Claude, sans réseau : la requête et un tour complet sur une fausse API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, runTurn, apiErrorMessage, MODEL } from '../src/agent.js';
import { PERSONA, contextBlock, ORAL } from '../src/persona.js';

const now = new Date(2026, 9, 2);

test('la requête : Sonnet 5.5, repli serveur, persona puis résumé du vault, la date en dernier hors cache', () => {
  const { body, betas } = buildRequest([], now, { digest: 'Krimo vit à Montréal.' });
  assert.equal(body.model, MODEL);
  assert.equal(MODEL, 'claude-sonnet-5-5');
  assert.equal(body.fallbacks, 'default');
  assert.deepEqual(betas, ['server-side-fallback-2026-07-01']);
  assert.equal(body.system.length, 3);
  assert.equal(body.system[0].text, PERSONA);
  assert.equal(body.system[0].cache_control, undefined, 'un seul point de cache, sur le dernier bloc stable');
  assert.match(body.system[1].text, /^# Résumé du vault de Krimo\n\nKrimo vit à Montréal\.$/);
  assert.deepEqual(body.system[1].cache_control, { type: 'ephemeral' });
  assert.equal(body.system[2].text, 'Date du jour : 2026-10-02.');
  assert.equal(body.system[2].cache_control, undefined);
});

test('sans résumé du vault, le point de cache se pose sur la persona', () => {
  const { body } = buildRequest([], now, { digest: '   ' });
  assert.equal(body.system.length, 2);
  assert.deepEqual(body.system[0].cache_control, { type: 'ephemeral' });
});

test('un tour parlé : consigne d\'oral hors cache et effort bas ; un tour écrit reste en medium', () => {
  const oral = buildRequest([], now, { oral: true }).body;
  assert.equal(oral.output_config.effort, 'low');
  assert.equal(oral.system.at(-1).text, `Date du jour : 2026-10-02.\n${ORAL}`);
  assert.equal(buildRequest([], now).body.output_config.effort, 'medium');
});

test('la persona en cache ne contient aucune date ni donnée variable', () => {
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(PERSONA));
  assert.equal(contextBlock(now), 'Date du jour : 2026-10-02.');
});

test('la persona garde les garde-fous : pas de faits inventés, 9-8-8 en cas de détresse, sujets intimes posés', () => {
  assert.match(PERSONA, /Tu n'inventes rien sur sa vie/);
  assert.match(PERSONA, /9-8-8/);
  assert.match(PERSONA, /baisses le volume/);
});

test('un tour : la question puis la réponse complète (blocs de réflexion compris) rejoignent l\'historique', async () => {
  const messages = [];
  let corps;
  const send = async body => { corps = body; return { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Salut gamin.' }] }; };
  const out = await runTurn({ messages, question: 'Yo', now, digest: '', send });
  assert.equal(out.text, 'Salut gamin.');
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], { role: 'user', content: 'Yo' });
  assert.equal(messages[1].content.length, 2, 'le bloc de réflexion est gardé tel quel');
  assert.equal(corps.messages, messages);
});

test('un refus est rendu comme tel, avec un texte par défaut', async () => {
  const out = await runTurn({ messages: [], question: 'x', now, send: async () => ({ stop_reason: 'refusal', content: [] }) });
  assert.equal(out.stop, 'refusal');
  assert.match(out.text, /décliné/);
});

test('les erreurs HTTP sont traduites', () => {
  assert.match(apiErrorMessage(401), /clé API Claude refusée/);
  assert.match(apiErrorMessage(429), /trop de requêtes/);
  assert.match(apiErrorMessage(529), /surchargée/);
  assert.equal(apiErrorMessage(400, { error: { message: 'bad' } }), 'bad');
});
