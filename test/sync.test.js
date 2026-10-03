import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outboxPayload, enAttente, aPurger, digestPlusRecent } from '../src/sync.js';

const conv = (o = {}) => ({
  id: 'c1', title: 'Salut', createdAt: '2026-10-01T20:00:00.000Z', updatedAt: '2026-10-01T20:05:00.000Z',
  horsVault: false, synced: false, messages: [{ role: 'user', content: 'x' }],
  view: [{ who: 'me', text: 'Salut', oral: true }, { who: 'nyx', text: 'Yo gamin' }, { who: 'err', text: '// LIAISON COUPÉE' }],
  ...o
});

test('ce qui part : les échanges seulement, sans erreurs ni historique API', () => {
  const p = outboxPayload(conv());
  assert.deepEqual(p.view, [{ who: 'me', text: 'Salut', oral: true }, { who: 'nyx', text: 'Yo gamin', oral: false }]);
  assert.equal(p.messages, undefined);
  assert.deepEqual([p.id, p.title, p.updatedAt], ['c1', 'Salut', '2026-10-01T20:05:00.000Z']);
});

test('en attente : vers le vault, non déposée, avec au moins une question', () => {
  assert.equal(enAttente(conv()), true);
  assert.equal(enAttente(conv({ synced: true })), false);
  assert.equal(enAttente(conv({ horsVault: true })), false);
  assert.equal(enAttente(conv({ view: [{ who: 'err', text: 'x' }] })), false);
});

test('purge à 30 jours : jamais une conversation en attente ni la conversation ouverte', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  const vieille = { updatedAt: '2026-10-01T20:05:00.000Z' };
  const convs = [
    conv({ id: 'deposee', synced: true, ...vieille }),
    conv({ id: 'hors', horsVault: true, ...vieille }),
    conv({ id: 'attente', ...vieille }),
    conv({ id: 'ouverte', synced: true, ...vieille }),
    conv({ id: 'recente', synced: true, updatedAt: '2026-11-01T00:00:00.000Z' })
  ];
  assert.deepEqual(aPurger(convs, now, 'ouverte'), ['deposee', 'hors']);
});

test('le résumé du Mac ne remplace que plus ancien que lui', () => {
  const recu = { text: 'résumé', at: '2026-10-03T22:00:05.000Z' };
  assert.equal(digestPlusRecent(recu, ''), true);
  assert.equal(digestPlusRecent(recu, '2026-10-02T21:00:00.000Z'), true);
  assert.equal(digestPlusRecent(recu, '2026-10-04T08:00:00.000Z'), false);
  assert.equal(digestPlusRecent(null, ''), false);
  assert.equal(digestPlusRecent({ text: '', at: '2026-10-03' }, ''), false);
});
