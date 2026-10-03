// Firebase côté téléphone : connexion, dépôt des conversations, réception du résumé du vault.
// Le SDK se charge à la demande : hors ligne, ou sans projet configuré, l'app marche sans synchro.
import { FIREBASE_CONFIG } from './firebase-config.js';
import { outboxPayload } from './sync.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.0/';

export function createCloud({ onUser = () => {} } = {}) {
  let fb = null, auth = null, db = null, user = null;

  const chemin = (...p) => fb.doc(db, 'users', user.uid, ...p);
  const exiger = () => { if (!user) throw new Error('non connecté'); };

  return {
    configured: !!FIREBASE_CONFIG,
    get user() { return user; },

    async start() {
      if (!FIREBASE_CONFIG || fb) return;
      const [app, a, f] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(m => import(SDK + m)));
      fb = { ...a, ...f };
      const appli = app.initializeApp(FIREBASE_CONFIG);
      auth = a.getAuth(appli);
      // Un champ undefined fait échouer l'écriture entière : on l'ignore (leçon d'Eddies).
      db = f.initializeFirestore(appli, { ignoreUndefinedProperties: true });
      a.onAuthStateChanged(auth, u => { user = u; onUser(u); });
    },

    signIn: (email, pass) => fb.signInWithEmailAndPassword(auth, email, pass),
    signOut: () => fb.signOut(auth),

    async push(c) { exiger(); await fb.setDoc(chemin('outbox', c.id), outboxPayload(c)); },
    async remove(id) { exiger(); await fb.deleteDoc(chemin('outbox', id)); },

    /** Le résumé déposé par le Mac : { text, at } ou null. */
    async fetchDigest() {
      exiger();
      const s = await fb.getDoc(chemin('digest', 'current'));
      return s.exists() ? s.data() : null;
    }
  };
}

/** Le message lisible d'une erreur de connexion Firebase. */
export function authErrorMessage(code) {
  return {
    'auth/invalid-credential': 'courriel ou mot de passe refusé',
    'auth/invalid-email': 'courriel invalide',
    'auth/too-many-requests': 'trop d\'essais — réessaie plus tard',
    'auth/network-request-failed': 'pas de réseau'
  }[code] || code || 'erreur inconnue';
}
