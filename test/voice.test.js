// La voix sans navigateur : le texte lu, le découpage, Gemini, le repli, l'annulation, le micro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speechText, speechChunks, geminiRequest, geminiAudio, toWav, pickVoice, createSpeaker, createMic } from '../src/voice.js';

test('le texte lu : sans Markdown, montants en mots', () => {
  assert.equal(speechText('Tu as **1 234 $** :\n- resto\n- // bars'), 'Tu as 1234 dollars : resto bars');
});

test('le découpage : première phrase seule, puis blocs de ~60 caractères', () => {
  assert.deepEqual(speechChunks('Salut. Tu as **1 200 $**. C\'est bien. Le restau pèse le plus lourd ce mois-ci, et de loin. Garde le cap.'),
    ['Salut.', 'Tu as 1200 dollars. C\'est bien. Le restau pèse le plus lourd ce mois-ci, et de loin.', 'Garde le cap.']);
  assert.deepEqual(speechChunks(''), []);
});

test('Gemini : requête avec clé, voix et consigne de ton ; audio lu dans les deux formats', () => {
  const r = geminiRequest('**80 $**', 'AIza', 'Algenib');
  assert.equal(r.init.headers['x-goog-api-key'], 'AIza');
  const b = JSON.parse(r.init.body);
  assert.equal(b.input[0].content[0].text, '80 dollars');
  assert.deepEqual(b.generation_config.speech_config, [{ voice: 'Algenib' }]);
  assert.deepEqual(geminiAudio({ steps: [{ content: [{ type: 'audio', data: 'QQ==' }] }] }), { data: 'QQ==', mime: 'audio/wav' });
  assert.equal(geminiAudio({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: 'Qg==' } }] } }] }).data, 'Qg==');
  assert.equal(geminiAudio({}), null);
});

test('PCM brut → WAV ; un WAV passe tel quel', () => {
  const w = toWav(new Uint8Array([1, 2, 3, 4]), 'audio/L16;rate=24000');
  assert.equal(String.fromCharCode(...w.slice(0, 4)), 'RIFF');
  assert.equal(w.length, 48);
  assert.equal(toWav(new Uint8Array(4), 'audio/wav').length, 4);
});

test('voix du navigateur : la plus naturelle d\'abord, puis masculine', () => {
  const base = [{ name: 'Samantha', lang: 'en-US' }, { name: 'Thomas', lang: 'fr-FR' }, { name: 'Amélie', lang: 'fr-CA' }];
  assert.equal(pickVoice(base).name, 'Thomas');
  assert.equal(pickVoice([...base, { name: 'Amélie (Premium)', lang: 'fr-CA' }]).name, 'Amélie (Premium)');
  assert.equal(pickVoice([{ name: 'Samantha', lang: 'en-US' }]), null);
});

/** Un faux navigateur : fetch scénarisé, lecteur qui « joue » instantanément, synthèse notée. */
function env(fetchImpl) {
  const lu = { navigateur: [], joues: 0, demandes: [] };
  return {
    lu,
    fetch: async (url, init) => { lu.demandes.push(JSON.parse(init.body).input[0].content[0].text); return fetchImpl(lu.demandes.at(-1)); },
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    Blob: function () {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Audio: function () {
      const ec = {};
      this.addEventListener = (t, f) => { (ec[t] = ec[t] || new Set()).add(f); };
      this.removeEventListener = (t, f) => { ec[t] && ec[t].delete(f); };
      this.play = async () => { lu.joues++; setTimeout(() => [...(ec.ended || [])].forEach(f => f()), 0); };
      this.pause = () => [...(ec.pause || [])].forEach(f => f());
    },
    speechSynthesis: { cancel() {}, speak: u => lu.navigateur.push(u.text), getVoices: () => [] },
    SpeechSynthesisUtterance: function (t) { this.text = t; }
  };
}
const ok = () => ({ ok: true, status: 200, json: async () => ({ steps: [{ content: [{ type: 'audio', data: 'QUJD' }] }] }) });

test('Gemini lu bloc par bloc ; une panne en route passe la suite au navigateur', async () => {
  const e = env(t => (t.startsWith('Panne') ? { ok: false, status: 500, json: async () => ({}) } : ok()));
  const sp = createSpeaker(e, { getKey: () => 'AIza', getVoice: () => 'Algenib' });
  await sp.speak('Un. Deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze. Panne totale ici, vraiment, pour de bon cette fois. Fin.');
  assert.equal(e.lu.demandes.length, 3);
  assert.equal(e.lu.joues, 2);
  assert.deepEqual(e.lu.navigateur, ['Panne totale ici, vraiment, pour de bon cette fois. Fin.']);
});

test('quota Gemini au premier bloc : message d\'erreur et voix du navigateur pour toute la réponse', async () => {
  const e = env(() => ({ ok: false, status: 429, json: async () => ({ error: { message: 'Rate limit' } }) }));
  const erreurs = [];
  const sp = createSpeaker(e, { getKey: () => 'AIza', getVoice: () => 'Algenib', onError: m => erreurs.push(m) });
  await sp.speak('Bonjour.');
  assert.match(erreurs[0], /quota Gemini/);
  assert.deepEqual(e.lu.navigateur, ['Bonjour.']);
});

test('sans clé Gemini : voix du navigateur, aucun appel réseau', async () => {
  const e = env(() => { throw new Error('ne doit pas être appelé'); });
  await createSpeaker(e, { getKey: () => '', getVoice: () => 'Algenib' }).speak('Salut.');
  assert.equal(e.lu.demandes.length, 0);
  assert.deepEqual(e.lu.navigateur, ['Salut.']);
});

test('couper NYX arrête la lecture avant le bloc suivant', async () => {
  let sp;
  const e = env(() => { sp.stop(); return ok(); });
  sp = createSpeaker(e, { getKey: () => 'AIza', getVoice: () => 'Algenib' });
  await sp.speak('Premier. Deuxième bloc assez long pour être seul dans son morceau.');
  assert.equal(e.lu.joues, 0);
});

test('micro : texte en direct, phrase finale envoyée ; rien entendu → rien envoyé', () => {
  let rec;
  const SR = function () { rec = this; this.start = () => {}; this.stop = () => this.onend(); };
  const vu = [], finales = [], etats = [], erreurs = [];
  const mic = createMic({ webkitSpeechRecognition: SR }, { onText: t => vu.push(t), onFinal: q => finales.push(q), onState: s => etats.push(s), onError: m => erreurs.push(m) });
  assert.equal(mic.supported, true);
  mic.toggle();
  assert.equal(rec.lang, 'fr-CA');
  assert.equal(mic.on, true);
  rec.onresult({ results: [[{ transcript: 'Salut ' }], [{ transcript: 'NYX' }]] });
  rec.onend();
  assert.deepEqual(vu, ['Salut NYX']);
  assert.deepEqual(finales, ['Salut NYX']);
  assert.deepEqual(etats, [true, false]);
  mic.toggle(); rec.onerror({ error: 'no-speech' }); rec.onend();
  assert.deepEqual(finales, ['Salut NYX']);
  assert.match(erreurs[0], /RIEN ENTENDU/);
  assert.equal(createMic({}, {}).supported, false);
});
