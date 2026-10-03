import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newConversation, titleFrom } from '../src/store.js';

test('une conversation neuve : vide, datée, vers le vault par défaut', () => {
  const c = newConversation(new Date('2026-10-02T21:05:00Z'));
  assert.match(c.id, /^20261002210500-[a-z0-9]{4}$/);
  assert.equal(c.horsVault, false);
  assert.deepEqual([c.messages, c.view], [[], []]);
});

test('le titre : la première question, coupée à un mot entier', () => {
  assert.equal(titleFrom('  Salut   NYX  '), 'Salut NYX');
  const t = titleFrom('Aide-moi à préparer le voyage de décembre pour le mariage en Algérie avec la famille');
  assert.ok(t.length <= 48 && t.endsWith('…'));
  assert.ok(!/\s…$/.test(t));
});
