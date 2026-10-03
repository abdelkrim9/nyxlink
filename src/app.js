// NYX//LINK — l'écran. La conversation (agent.js), la voix (voice.js), le corps (nyx-body.js) et
// le stockage (store.js) se testent à part ; ici, on les branche sur le DOM.
import { API_URL, runTurn, apiErrorMessage } from './agent.js';
import { SUGGESTIONS } from './persona.js';
import { createSpeaker, createMic, GEMINI_VOICES } from './voice.js';
import { createBody } from './nyx-body.js';
import { newConversation, saveConversation, deleteConversation, getConversation, listConversations, titleFrom } from './store.js';
import { createCloud, authErrorMessage } from './cloud.js';
import { enAttente, aPurger, digestPlusRecent } from './sync.js';

const $ = id => document.getElementById(id);
const SLEEP_MS = 90000;

// ── Réglages (localStorage : ils ne quittent pas ce téléphone)
const cfg = {
  get: k => { try { return localStorage.getItem('nl.' + k) || ''; } catch (_) { return ''; } },
  set: (k, v) => { try { v ? localStorage.setItem('nl.' + k, v) : localStorage.removeItem('nl.' + k); } catch (_) {} }
};

const st = { conv: null, busy: false, asleep: false, lastAct: Date.now(), bodies: [] };

// ── Toast
let toastT = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 3800);
}

// ── Voix et micro
const speaker = createSpeaker(window, {
  getKey: () => cfg.get('geminiKey'),
  getVoice: () => cfg.get('geminiVoice') || 'Algenib',
  onTalk: on => st.bodies.forEach(b => b.talk(on)),
  onError: msg => toast('// VOIX : ' + msg)
});
const mic = createMic(window, {
  onText: t => { $('input').value = t; autosize(); },
  onFinal: q => { $('input').value = ''; autosize(); ask(q, { oral: true }); },
  onState: () => render(),
  onError: msg => toast('// ' + msg)
});

// ── Synchro vers le vault (Firebase `nyxlink`)
const cloud = createCloud({ onUser: u => { if ($('settingsSheet').classList.contains('open')) renderSettings(); if (u) { deposerTout(); recevoirDigest(); } } });

/** Dépose la conversation dans la boîte d'envoi ; sans connexion, elle attend la prochaine occasion. */
async function deposer(c) {
  if (!cloud.user || !enAttente(c)) return;
  try {
    await cloud.push(c);
    // Une réponse arrivée pendant le dépôt a remis `synced` à faux : elle repartira.
    const fraiche = await getConversation(c.id);
    if (fraiche && fraiche.updatedAt === c.updatedAt) { fraiche.synced = true; await saveConversation(fraiche); if (st.conv && st.conv.id === c.id) st.conv.synced = true; }
  } catch (_) { /* reste en attente */ }
}
async function deposerTout() {
  if (!cloud.user) return;
  for (const c of await listConversations()) if (enAttente(c)) await deposer(c);
}

let digestVerifie = 0;
async function recevoirDigest() {
  if (!cloud.user || Date.now() - digestVerifie < 36e5) return;
  digestVerifie = Date.now();
  try {
    const d = await cloud.fetchDigest();
    if (!digestPlusRecent(d, cfg.get('digestAt'))) return;
    cfg.set('digest', d.text); cfg.set('digestAt', d.at); cfg.set('digestDate', 'du Mac, ' + d.at.slice(0, 10));
    render(); toast('// RÉSUMÉ DU VAULT MIS À JOUR');
  } catch (_) { digestVerifie = 0; }
}

function mood() {
  return mic.on ? 'listening' : st.busy ? 'thinking' : st.asleep ? 'sleep' : 'idle';
}
function activity() {
  st.lastAct = Date.now();
  if (st.asleep) st.asleep = false;
}

// ── Claude
async function callClaude(body, betas) {
  const headers = {
    'content-type': 'application/json',
    'x-api-key': cfg.get('claudeKey'),
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  };
  if (betas && betas.length) headers['anthropic-beta'] = betas.join(',');
  const res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    let j = null; try { j = await res.json(); } catch (_) {}
    throw new Error(apiErrorMessage(res.status, j));
  }
  return res.json();
}

async function ask(q, { oral = false } = {}) {
  q = String(q || '').trim();
  if (!q || st.busy) return;
  if (!cfg.get('claudeKey')) { openSheet('settings'); toast('// COLLE TA CLÉ API CLAUDE'); return; }
  activity();
  speaker.stop();
  const c = st.conv;
  if (!c.title) c.title = titleFrom(q);
  c.view.push({ who: 'me', text: q, oral });
  st.busy = true; render();
  const avant = c.messages.length;
  try {
    const out = await runTurn({ messages: c.messages, question: q, now: new Date(), digest: cfg.get('digest'), oral, send: callClaude });
    let txt = out.text || '// (silence radio)';
    if (out.stop === 'max_tokens') txt += '\n\n// réponse coupée — trop longue.';
    c.view.push({ who: 'nyx', text: txt });
    if (oral || cfg.get('voiceOn')) speaker.speak(txt);
  } catch (err) {
    // Une question sans réponse rendrait toutes les suivantes invalides : retour à l'état d'avant.
    c.messages.length = avant;
    c.view.push({ who: 'err', text: `// LIAISON COUPÉE — ${err.message || err}` });
  } finally {
    st.busy = false;
    c.updatedAt = new Date().toISOString();
    c.synced = false;
    await saveConversation(c).catch(() => toast('// SAUVEGARDE IMPOSSIBLE SUR CE TÉLÉPHONE'));
    render();
    deposer(c);
  }
}

// ── Rendu
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** **gras**, listes à tirets, paragraphes. Tout le reste est échappé. */
export function md(s) {
  const out = []; let liste = null, para = [];
  const finPara = () => { if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; } };
  const finListe = () => { if (liste) { out.push(`<ul>${liste.map(l => `<li>${l}</li>`).join('')}</ul>`); liste = null; } };
  esc(s).split('\n').forEach(l => {
    const m = l.match(/^\s*[-•*]\s+(.*)$/);
    if (m) { finPara(); (liste = liste || []).push(m[1]); return; }
    finListe();
    if (!l.trim()) finPara(); else para.push(l);
  });
  finPara(); finListe();
  return out.join('').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function render() {
  const c = st.conv, log = $('log');
  $('convTitle').textContent = c && c.title ? c.title : 'Nouvelle conversation';
  $('horsVault').setAttribute('aria-pressed', String(!!(c && c.horsVault)));
  $('horsVault').textContent = c && c.horsVault ? 'HORS VAULT' : 'VERS LE VAULT';
  document.body.classList.toggle('has-msgs', !!(c && c.view.length));
  if (!c || !c.view.length) {
    const sansResume = !cfg.get('digest');
    log.innerHTML = `<div class="intro">
      <p class="intro-text">${sansResume ? 'Je ne connais pas encore ton vault. Colle ton résumé dans les réglages, ou parle-moi directement.' : 'Je suis là, gamin. De quoi tu veux parler ?'}</p>
      <div class="sugg">${SUGGESTIONS.map(q => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    </div>`;
  } else {
    log.innerHTML = c.view.map(v => v.who === 'me'
      ? `<div class="msg me">${esc(v.text).replace(/\n/g, '<br>')}${v.oral ? '<span class="via">au micro</span>' : ''}</div>`
      : v.who === 'err' ? `<div class="msg err">${esc(v.text)}</div>`
      : `<div class="msg nyx">${md(v.text)}<button class="replay" data-say="${esc(v.text)}" aria-label="Réécouter">▶</button></div>`).join('')
      + (st.busy ? '<div class="typing">// NYX RÉFLÉCHIT</div>' : '');
  }
  log.scrollTop = log.scrollHeight;
  $('send').disabled = st.busy;
  $('mic').hidden = !mic.supported;
  $('mic').classList.toggle('on', mic.on);
  $('mic').setAttribute('aria-pressed', String(mic.on));
  $('mic').disabled = st.busy && !mic.on;
  $('voiceToggle').setAttribute('aria-pressed', String(!!cfg.get('voiceOn')));
  $('voiceToggle').textContent = cfg.get('voiceOn') ? 'VOIX ON' : 'VOIX OFF';
}

function autosize() { const el = $('input'); el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; }

// ── Panneaux : conversations et réglages
function openSheet(name) {
  ['convs', 'settings'].forEach(n => { const el = $(n + 'Sheet'); el.classList.toggle('open', n === name); el.setAttribute('aria-hidden', String(n !== name)); });
  if (name === 'convs') renderConvs();
  if (name === 'settings') renderSettings();
}
function closeSheets() { openSheet(null); }

async function renderConvs() {
  const all = await listConversations();
  const fmt = iso => new Date(iso).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  $('convList').innerHTML = all.filter(c => c.view.length).map(c => `
    <li class="conv${st.conv && c.id === st.conv.id ? ' cur' : ''}">
      <button class="conv-open" data-id="${c.id}"><span class="conv-t">${esc(c.title || 'Sans titre')}</span>
        <span class="conv-d">${fmt(c.updatedAt)}${c.horsVault ? ' · hors vault' : cloud.configured && enAttente(c) ? ' · en attente' : ''}</span></button>
      <button class="conv-del" data-del="${c.id}" aria-label="Supprimer">✕</button>
    </li>`).join('') || '<li class="empty">Aucune conversation pour l\'instant.</li>';
}

function renderSettings() {
  const masque = k => (k ? k.slice(0, 7) + '…' + k.slice(-4) : 'non configurée');
  $('claudeStatus').textContent = '// CLAUDE : ' + masque(cfg.get('claudeKey'));
  $('geminiStatus').textContent = '// GEMINI : ' + masque(cfg.get('geminiKey'));
  $('voiceSel').innerHTML = GEMINI_VOICES.map(v => `<option${v === (cfg.get('geminiVoice') || 'Algenib') ? ' selected' : ''}>${v}</option>`).join('');
  const d = cfg.get('digest');
  $('digest').value = d;
  renderSync();
  $('digestInfo').textContent = d ? `${d.length.toLocaleString('fr-CA')} caractères · ~${Math.round(d.length / 3.6).toLocaleString('fr-CA')} jetons · ${cfg.get('digestDate') || 'date inconnue'}` : 'Aucun résumé : NYX ne te connaît pas encore.';
}

async function renderSync() {
  const u = cloud.user;
  $('syncLogin').hidden = !cloud.configured || !!u;
  $('syncOut').hidden = !u;
  if (!cloud.configured) { $('syncStatus').textContent = '// PROJET FIREBASE PAS ENCORE BRANCHÉ'; return; }
  if (!u) { $('syncStatus').textContent = '// NON CONNECTÉ : TES CONVERSATIONS RESTENT ICI'; return; }
  const attente = (await listConversations()).filter(enAttente).length;
  $('syncStatus').textContent = `// CONNECTÉ : ${u.email} · ${attente ? attente + ' en attente de dépôt' : 'tout est déposé'}`;
}

async function startConversation(c) {
  st.conv = c || newConversation();
  cfg.set('lastConv', st.conv.id);
  closeSheets(); render();
}

// ── Branchements
function wire() {
  $('form').addEventListener('submit', e => { e.preventDefault(); const q = $('input').value; $('input').value = ''; autosize(); ask(q); });
  $('input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('form').requestSubmit(); } });
  $('input').addEventListener('input', autosize);
  $('mic').addEventListener('click', () => { speaker.stop(); speaker.unlock(); activity(); mic.toggle(); render(); });
  $('log').addEventListener('click', e => {
    const chip = e.target.closest('[data-q]'); if (chip) { ask(chip.dataset.q); return; }
    const rp = e.target.closest('[data-say]'); if (rp) { speaker.unlock(); speaker.speak(rp.dataset.say); }
  });
  $('hero').addEventListener('click', () => { st.bodies.forEach(b => b.poke()); activity(); });
  $('btnConvs').addEventListener('click', () => openSheet('convs'));
  $('btnSettings').addEventListener('click', () => openSheet('settings'));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
  $('newConv').addEventListener('click', () => startConversation());
  $('convList').addEventListener('click', async e => {
    const o = e.target.closest('[data-id]');
    if (o) { startConversation(await getConversation(o.dataset.id)); return; }
    const d = e.target.closest('[data-del]');
    if (!d) return;
    // Deux appuis pour supprimer : le premier arme le bouton, le second confirme.
    if (!d.classList.contains('armed')) { d.classList.add('armed'); d.textContent = 'SUPPRIMER ?'; return; }
    await deleteConversation(d.dataset.del);
    if (cloud.user) cloud.remove(d.dataset.del).catch(() => {});
    if (st.conv && st.conv.id === d.dataset.del) st.conv = newConversation();
    renderConvs(); render();
  });
  $('horsVault').addEventListener('click', async () => {
    const c = st.conv, deposee = c.synced;
    c.horsVault = !c.horsVault;
    c.synced = false;
    if (c.view.length) await saveConversation(c);
    if (c.horsVault && deposee && cloud.user) cloud.remove(c.id).catch(() => {});
    if (!c.horsVault) deposer(c);
    toast(!c.horsVault ? '// CETTE CONVERSATION REJOINDRA TON VAULT'
      : deposee ? '// RETIRÉE DE LA FILE — SI LE MAC L\'A DÉJÀ TIRÉE, ELLE EST DANS LE VAULT'
      : '// CETTE CONVERSATION RESTERA SUR LE TÉLÉPHONE');
    render();
  });
  $('voiceToggle').addEventListener('click', () => {
    cfg.set('voiceOn', cfg.get('voiceOn') ? '' : '1');
    speaker.unlock();
    if (cfg.get('voiceOn')) speaker.speak("Ampli branché. Tu m'entends, gamin ?"); else speaker.stop();
    render();
  });
  $('saveClaude').addEventListener('click', () => {
    const v = $('claudeKey').value.trim();
    if (!v.startsWith('sk-ant-')) { toast('// FORMAT INVALIDE (sk-ant-…)'); return; }
    cfg.set('claudeKey', v); $('claudeKey').value = ''; renderSettings(); toast('// CLÉ CLAUDE ENREGISTRÉE');
  });
  $('saveGemini').addEventListener('click', () => {
    const v = $('geminiKey').value.trim();
    if (!v) { toast('// CLÉ VIDE'); return; }
    cfg.set('geminiKey', v); $('geminiKey').value = ''; renderSettings(); toast('// CLÉ GEMINI ENREGISTRÉE');
  });
  $('voiceSel').addEventListener('change', e => cfg.set('geminiVoice', e.target.value));
  $('testVoice').addEventListener('click', () => { speaker.unlock(); speaker.speak("Salut gamin. C'est NYX. On jase de quoi ce soir ?"); });
  $('saveDigest').addEventListener('click', () => {
    cfg.set('digest', $('digest').value.trim());
    cfg.set('digestDate', new Date().toLocaleDateString('fr-CA'));
    cfg.set('digestAt', new Date().toISOString());
    renderSettings(); render(); toast('// RÉSUMÉ DU VAULT ENREGISTRÉ');
  });
  $('digestFile').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    $('digest').value = await f.text();
    toast('// FICHIER CHARGÉ — APPUIE SUR ENREGISTRER');
  });
  $('syncIn').addEventListener('click', async () => {
    const email = $('syncEmail').value.trim(), pass = $('syncPass').value;
    if (!email || !pass) { toast('// COURRIEL ET MOT DE PASSE'); return; }
    try { await cloud.signIn(email, pass); $('syncPass').value = ''; toast('// LIAISON AVEC LE VAULT ÉTABLIE'); }
    catch (e) { toast('// CONNEXION : ' + authErrorMessage(e.code)); }
  });
  $('syncOutBtn').addEventListener('click', async () => { await cloud.signOut(); renderSettings(); toast('// DÉCONNECTÉ'); });
  addEventListener('online', deposerTout);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { deposerTout(); recevoirDigest(); } });
  addEventListener('pointermove', e => { st.bodies.forEach(b => b.lookAt(e.clientX, e.clientY)); activity(); }, { passive: true });
  addEventListener('pointerdown', activity, { passive: true });
  addEventListener('keydown', e => { activity(); if (e.key === 'Escape') closeSheets(); });
  setInterval(() => { if (!st.asleep && !st.busy && !mic.on && Date.now() - st.lastAct > SLEEP_MS) st.asleep = true; }, 5000);
}

async function boot() {
  st.bodies.push(createBody($('hero'), 'h', mood));
  wire();
  const last = cfg.get('lastConv') && await getConversation(cfg.get('lastConv')).catch(() => null);
  await startConversation(last || null);
  // Trente jours sur le téléphone ; ce qui n'est pas encore déposé reste.
  for (const id of aPurger(await listConversations(), new Date(), st.conv.id)) await deleteConversation(id).catch(() => {});
  cloud.start().catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}
boot();
