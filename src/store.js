// Les conversations, gardées sur le téléphone (IndexedDB) : lisibles hors ligne, rien ne se perd
// au rechargement. En phase 2, celles qui ne sont pas « hors vault » remontent vers le Mac.
//
// Une conversation : { id, title, createdAt, updatedAt, horsVault, synced, messages, view }
//   messages = l'historique envoyé à l'API (ajout seul) ; view = ce qui s'affiche.

const DB = 'nyxlink', STORE = 'conversations', VERSION = 1;

function ouvrir() {
  return new Promise((ok, ko) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
}

async function tx(mode, fn) {
  const db = await ouvrir();
  return new Promise((ok, ko) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => ok(out && 'result' in out ? out.result : undefined);
    t.onerror = () => ko(t.error);
  });
}

export function newConversation(now = new Date()) {
  const id = `${now.toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`;
  return { id, title: '', createdAt: now.toISOString(), updatedAt: now.toISOString(), horsVault: false, synced: false, messages: [], view: [] };
}

export const saveConversation = c => tx('readwrite', s => s.put(c));
export const deleteConversation = id => tx('readwrite', s => s.delete(id));
export const getConversation = id => tx('readonly', s => s.get(id));
export async function listConversations() {
  const all = (await tx('readonly', s => s.getAll())) || [];
  return all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** Le titre d'une conversation : sa première question, coupée proprement. */
export function titleFrom(question) {
  const q = String(question || '').replace(/\s+/g, ' ').trim();
  return q.length <= 48 ? q : q.slice(0, 47).replace(/\s+\S*$/, '') + '…';
}
