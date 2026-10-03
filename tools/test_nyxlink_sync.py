"""Tests de la synchro du soir, sans réseau : Firestore est remplacé par un faux."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("nyxlink_sync", Path(__file__).with_name("nyxlink_sync.py"))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def conv(n, **o):
    view = [{"who": "me" if i % 2 == 0 else "nyx", "text": f"message {i + 1}", "oral": i == 0} for i in range(n)]
    return {"id": "20261002210500-ab12", "title": "Le voyage de décembre", "createdAt": "2026-10-03T01:05:00.000Z",
            "updatedAt": "2026-10-03T01:20:00.000Z", "view": view, **o}


class FauxFirestore:
    def __init__(self, docs, refus=()):
        self.docs, self.refus, self.effaces = list(docs), set(refus), []

    def boite_envoi(self):
        return [(f"docs/{c['id']}", f"maj-{i}", c) for i, c in enumerate(self.docs)]

    def effacer(self, nom, maj):
        if nom in self.refus:
            return False
        self.effaces.append(nom)
        return True


class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dossier = Path(self.tmp.name) / "raw" / "conversations"

    def tearDown(self):
        self.tmp.cleanup()

    def test_decoder_les_valeurs_typees(self):
        v = {"mapValue": {"fields": {"view": {"arrayValue": {"values": [{"mapValue": {"fields": {
            "who": {"stringValue": "me"}, "oral": {"booleanValue": True}}}}]}}, "n": {"integerValue": "3"}}}}
        self.assertEqual(sync.decoder(v), {"view": [{"who": "me", "oral": True}], "n": 3})
        self.assertEqual(sync.decoder({"arrayValue": {}}), [])

    def test_slug_sans_accents(self):
        self.assertEqual(sync.slug("Où j'en suis, côté mariage ?"), "ou-j-en-suis-cote-mariage")
        self.assertEqual(sync.slug(""), "conversation")

    def test_premiere_partie_puis_suite_sans_reecrire(self):
        fs = FauxFirestore([conv(4)])
        self.assertEqual(sync.rapatrier(fs, self.dossier, aujourdhui="2026-10-03"), ["2026-10-02-le-voyage-de-decembre-ab12.md"])
        p1 = (self.dossier / "2026-10-02-le-voyage-de-decembre-ab12.md").read_text()
        self.assertIn("messages: 1-4", p1)
        self.assertIn("**Krimo** · au micro\n\nmessage 1", p1)
        self.assertIn("**NYX**\n\nmessage 2", p1)
        self.assertEqual(fs.effaces, ["docs/20261002210500-ab12"])

        # Krimo reprend la conversation : seule la suite part, dans une nouvelle partie liée.
        fs = FauxFirestore([conv(6)])
        self.assertEqual(sync.rapatrier(fs, self.dossier), ["2026-10-02-le-voyage-de-decembre-ab12-partie-2.md"])
        p2 = (self.dossier / "2026-10-02-le-voyage-de-decembre-ab12-partie-2.md").read_text()
        self.assertIn("messages: 5-6", p2)
        self.assertIn("Suite de [[2026-10-02-le-voyage-de-decembre-ab12]]", p2)
        self.assertNotIn("message 4", p2)
        self.assertEqual((self.dossier / "2026-10-02-le-voyage-de-decembre-ab12.md").read_text(), p1)

    def test_rien_de_neuf_efface_sans_ecrire(self):
        sync.rapatrier(FauxFirestore([conv(4)]), self.dossier)
        fs = FauxFirestore([conv(4)])
        self.assertEqual(sync.rapatrier(fs, self.dossier), [])
        self.assertEqual(len(list(self.dossier.glob("*.md"))), 1)
        self.assertEqual(len(fs.effaces), 1)

    def test_redeposee_pendant_la_synchro_reste_dans_le_nuage(self):
        fs = FauxFirestore([conv(2)], refus={"docs/20261002210500-ab12"})
        self.assertEqual(len(sync.rapatrier(fs, self.dossier)), 1)
        self.assertEqual(fs.effaces, [])

    def test_essai_ne_touche_a_rien(self):
        fs = FauxFirestore([conv(2)])
        sync.rapatrier(fs, self.dossier, essai=True)
        self.assertFalse(self.dossier.exists())
        self.assertEqual(fs.effaces, [])

    def test_jamais_ecraser_raw(self):
        sync.ecrire_sans_ecraser(self.dossier, "a.md", "un")
        with self.assertRaises(FileExistsError):
            sync.ecrire_sans_ecraser(self.dossier, "a.md", "deux")


if __name__ == "__main__":
    unittest.main()
