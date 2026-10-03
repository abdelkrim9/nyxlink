// La voix de NYX — repris d'Eddies (v5.21.0), où chaque choix a été mesuré :
//   • Gemini (voix Algenib, choisie à l'écoute) lu PHRASE PAR PHRASE : Gemini met à peu près
//     autant de temps à générer une phrase qu'à la dire (4,4 s pour 4 s, mesuré) ;
//   • repli sur la synthèse du navigateur si Gemini échoue (quota, clé) ;
//   • le micro : la reconnaissance vocale du navigateur, en fr-CA.
// Les fonctions pures en haut sont testées ; createSpeaker / createMic touchent le navigateur.

/** Ce que la synthèse vocale doit lire : sans Markdown, les montants en mots. */
export function speechText(s) {
  return String(s).replace(/\*\*/g, '').replace(/^\s*[-•*]\s+/gm, '').replace(/\/\//g, '')
    .replace(/(\d)[\s  ](?=\d{3}\b)/g, '$1').replace(/\$/g, ' dollars').replace(/\s+/g, ' ').trim();
}

/** Première phrase seule (elle fixe le délai avant le premier son), puis blocs d'au moins ~60 caractères. */
export function speechChunks(text) {
  const phrases = speechText(text).split(/(?<=[.!?…])\s+/).map(p => p.trim()).filter(Boolean);
  const out = [];
  phrases.forEach((p, i) => {
    const last = out[out.length - 1];
    if (i > 1 && last && last.length < 60) out[out.length - 1] = last + ' ' + p;
    else out.push(p);
  });
  return out;
}

export const GEMINI = {
  url: 'https://generativelanguage.googleapis.com/v1beta/interactions',
  model: 'gemini-3.8-flash-tts',
  voice: 'Algenib',
  style: "en français, voix d'homme grave et rauque d'un vieux rockeur cynique : débit posé, phrases lâchées avec aplomb, sarcastique mais chaleureux, jamais théâtral"
};
export const GEMINI_VOICES = ['Algenib', 'Charon', 'Orus', 'Gacrux', 'Fenrir', 'Alnilam', 'Iapetus', 'Rasalgethi', 'Sadaltager', 'Algieba', 'Schedar', 'Umbriel', 'Enceladus'];

export function geminiRequest(text, key, voice) {
  return {
    url: GEMINI.url,
    init: {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: GEMINI.model,
        input: [{ type: 'user_input', content: [{ type: 'text', text: speechText(text), annotations: [{ type: 'speech_metadata', style: GEMINI.style }] }] }],
        response_format: { type: 'audio', mime_type: 'audio/wav' },
        generation_config: { speech_config: [{ voice }] }
      })
    }
  };
}

/** Le dernier bloc audio d'une réponse (format « interactions », ou l'ancien inlineData). */
export function geminiAudio(j) {
  const blocs = [];
  (j && j.steps || []).forEach(st => (st.content || []).forEach(c => { if (c && c.type === 'audio' && c.data) blocs.push({ data: c.data, mime: c.mime_type || 'audio/wav' }); }));
  (j && j.candidates || []).forEach(ca => ((ca.content && ca.content.parts) || []).forEach(p => { const d = p.inlineData || p.inline_data; if (d && d.data) blocs.push({ data: d.data, mime: d.mimeType || d.mime_type || '' }); }));
  return blocs.length ? blocs[blocs.length - 1] : null;
}

/** PCM brut (audio/l16) → WAV lisible par <audio>. Un WAV passe tel quel. */
export function toWav(bytes, mime) {
  if (!/l16|pcm/i.test(mime || '')) return bytes;
  const rate = +((mime.match(/rate=(\d+)/) || [])[1] || 24000);
  const h = new DataView(new ArrayBuffer(44));
  const txt = (o, t) => { for (let i = 0; i < 4; i++) h.setUint8(o + i, t.charCodeAt(i)); };
  txt(0, 'RIFF'); h.setUint32(4, 36 + bytes.length, true); txt(8, 'WAVE'); txt(12, 'fmt ');
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true); h.setUint32(24, rate, true);
  h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); txt(36, 'data'); h.setUint32(40, bytes.length, true);
  const out = new Uint8Array(44 + bytes.length);
  out.set(new Uint8Array(h.buffer), 0); out.set(bytes, 44);
  return out;
}

/** La meilleure voix française installée : le grain (Premium, neuronale) avant le genre. */
export function voiceScore(v) {
  if (!v || !/^fr/i.test(v.lang || '')) return -1;
  const n = v.name || '';
  let sc = 0;
  if (/premium|enhanced|améliorée?|natural|neural|online/i.test(n)) sc += 100;
  if (/thomas|daniel|paul|henri|nicolas|jacques|antoine|jean|rémy|remy|guillaume|denis|claude|fabrice|alain|male|homme/i.test(n)) sc += 20;
  if (/fr-CA/i.test(v.lang)) sc += 5;
  if (v.localService === false) sc += 2;
  return sc;
}
export function pickVoice(voices) {
  let best = null, bs = -1;
  (voices || []).forEach(v => { const sc = voiceScore(v); if (sc > bs) { bs = sc; best = v; } });
  return best;
}

async function geminiErrorMessage(res) {
  let msg = `HTTP ${res.status}`;
  try { const e = await res.json(); msg = (e.error && e.error.message) || msg; } catch (_) {}
  if (res.status === 400 && /api key/i.test(msg)) return 'clé Gemini refusée';
  if (res.status === 429) return 'quota Gemini atteint — voix du navigateur en attendant';
  return msg;
}

/**
 * Le haut-parleur de NYX. `env` = ce que fournit le navigateur (fetch, Audio, speechSynthesis…),
 * injecté pour les tests. `onTalk(bool)` anime la bouche ; `onError(msg)` affiche un toast.
 */
export function createSpeaker(env, { getKey, getVoice, onTalk = () => {}, onError = () => {} }) {
  let gen = 0, audio = null, audioUrl = '', unlocked = false;
  const lecteur = () => {
    if (!audio && typeof env.Audio === 'function') {
      audio = new env.Audio();
      audio.onplay = () => onTalk(true);
      audio.onended = audio.onpause = () => onTalk(false);
    }
    return audio;
  };
  const jouer = blob => {
    const a = lecteur();
    if (!a) return Promise.reject(new Error('lecture audio indisponible'));
    return new Promise((ok, ko) => {
      const fin = () => { a.removeEventListener('ended', fin); a.removeEventListener('pause', fin); ok(); };
      a.addEventListener('ended', fin); a.addEventListener('pause', fin);
      if (audioUrl) env.URL.revokeObjectURL(audioUrl);
      audioUrl = env.URL.createObjectURL(blob);
      a.src = audioUrl;
      Promise.resolve(a.play()).catch(e => { fin(); ko(e); });
    });
  };
  const navigateur = text => {
    const ss = env.speechSynthesis;
    if (!ss) return;
    const u = new env.SpeechSynthesisUtterance(speechText(text));
    const v = pickVoice(ss.getVoices());
    u.lang = v ? v.lang : 'fr-FR'; if (v) u.voice = v;
    u.pitch = 0.85; u.rate = 0.95;
    u.onstart = () => onTalk(true);
    u.onend = u.onerror = () => onTalk(false);
    ss.speak(u);
  };
  const blobGemini = async (text, voice) => {
    const { url, init } = geminiRequest(text, getKey(), voice);
    const res = await env.fetch(url, init);
    if (!res.ok) throw new Error(await geminiErrorMessage(res));
    const au = geminiAudio(await res.json());
    if (!au) throw new Error('aucun audio dans la réponse Gemini');
    const bin = env.atob(au.data), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new env.Blob([toWav(bytes, au.mime)], { type: 'audio/wav' });
  };
  const gemini = async (text, voice) => {
    const parts = speechChunks(text);
    if (!parts.length) return;
    const g = ++gen;
    const synth = p => { const pr = blobGemini(p, voice); pr.catch(() => {}); return pr; };
    let next = synth(parts[0]);
    for (let i = 0; i < parts.length; i++) {
      let blob;
      try { blob = await next; } catch (err) {
        if (i === 0) throw err;
        if (g === gen) navigateur(parts.slice(i).join(' '));
        return;
      }
      if (g !== gen) return;
      next = i + 1 < parts.length ? synth(parts[i + 1]) : null;
      await jouer(blob);
      if (g !== gen) return;
    }
  };
  const stop = () => {
    gen++;
    if (env.speechSynthesis) env.speechSynthesis.cancel();
    if (audio) audio.pause();
    onTalk(false);
  };
  return {
    stop,
    /** iOS/Android refusent un play() hors geste : un son vide joué dans le geste débloque le lecteur. */
    unlock() {
      const a = lecteur();
      if (!a || unlocked) return;
      unlocked = true;
      a.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
      Promise.resolve(a.play()).catch(() => {});
    },
    async speak(text, voice) {
      stop();
      if (getKey()) {
        try { await gemini(text, voice || getVoice()); return; }
        catch (err) { onError(err.message || String(err)); }
      }
      navigateur(text);
    }
  };
}

export const MIC_ERRORS = {
  'not-allowed': 'MICRO REFUSÉ — autorise-le dans les réglages du navigateur',
  'service-not-allowed': 'MICRO INDISPONIBLE ICI — essaie dans Chrome',
  'no-speech': 'RIEN ENTENDU',
  'audio-capture': 'AUCUN MICRO DÉTECTÉ',
  'network': 'RECONNAISSANCE VOCALE HORS LIGNE'
};

/** Le micro : le texte s'écrit en direct (`onText`), la phrase finie part (`onFinal`). */
export function createMic(env, { onText = () => {}, onFinal = () => {}, onState = () => {}, onError = () => {} }) {
  const SR = env.SpeechRecognition || env.webkitSpeechRecognition;
  let rec = null, texte = '';
  return {
    supported: !!SR,
    get on() { return !!rec; },
    toggle() {
      if (rec) { rec.stop(); return; }
      if (!SR) return;
      rec = new SR();
      rec.lang = 'fr-CA'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      texte = '';
      rec.onresult = e => {
        let t = '';
        for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
        texte = t.trim();
        onText(texte);
      };
      rec.onerror = e => {
        if (MIC_ERRORS[e.error]) onError(MIC_ERRORS[e.error]);
        if (e.error !== 'no-speech' && e.error !== 'aborted') texte = '';
      };
      rec.onend = () => {
        const q = texte;
        rec = null; onState(false);
        if (q) onFinal(q);
      };
      onState(true);
      try { rec.start(); } catch (err) { rec = null; onState(false); onError('MICRO : ' + (err.message || err)); }
    }
  };
}
