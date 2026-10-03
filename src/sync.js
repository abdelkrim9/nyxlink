// La remontée vers le vault, côté téléphone : ce qui part, ce qui se purge. Pur — Firebase est
// branché dans cloud.js, ce qui permet de tout tester sans réseau.
//
// Firestore (projet `nyxlink`, séparé d'Eddies) :
//   users/{uid}/outbox/{idConversation}  la conversation entière, déposée par le téléphone ;
//                                         le Mac la rapatrie dans raw/conversations/ puis l'efface
//   users/{uid}/digest/current            le résumé du vault, déposé par le Mac chaque soir

export const RETENTION_JOURS = 30;

/** Ce qui part vers le vault : les échanges, sans les erreurs de liaison. */
export function outboxPayload(c) {
  return {
    id: c.id,
    title: c.title || '',
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    view: c.view.filter(v => v.who === 'me' || v.who === 'nyx').map(v => ({ who: v.who, text: v.text, oral: !!v.oral }))
  };
}

/** Une conversation attend de partir : elle va au vault, elle a du contenu, et sa dernière version n'est pas déposée. */
export const enAttente = c => !c.horsVault && !c.synced && c.view.some(v => v.who === 'me');

/**
 * Les conversations à effacer du téléphone : plus de 30 jours sans activité, et rien en attente
 * (déjà déposée, ou hors vault). La conversation ouverte reste.
 */
export function aPurger(convs, now = new Date(), courante = null) {
  const limite = now.getTime() - RETENTION_JOURS * 864e5;
  return convs.filter(c => c.id !== courante && new Date(c.updatedAt).getTime() < limite && !enAttente(c)).map(c => c.id);
}

/** Le résumé reçu du Mac remplace celui du téléphone s'il est plus récent. */
export const digestPlusRecent = (recu, actuelAt) => !!(recu && recu.text && recu.at && (!actuelAt || recu.at > actuelAt));
