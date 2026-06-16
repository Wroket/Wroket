# Guide de dépôt e-Soleau INPI — Wroket

Checklist pas à pas pour finaliser le dépôt une fois les 5 fichiers générés.

---

## Prérequis

- [ ] Compte [INPI Connect](https://www.inpi.fr) créé et identité vérifiée
- [ ] Informations du fichier [TITULAIRE.md](./TITULAIRE.md) complétées
- [ ] Dossier `inpi-deposit/output/YYYY-MM-DD/` généré via `scripts/inpi-deposit/build-deposit.ps1`
- [ ] 5 fichiers PDF/zip prêts (voir liste ci-dessous)

---

## Les 5 fichiers à téléverser

| # | Fichier | Format |
|---|---------|--------|
| 1 | `wroket-source-YYYY-MM-DD.zip` | ZIP |
| 2 | `wroket-description.pdf` | PDF |
| 3 | `wroket-architecture.pdf` | PDF |
| 4 | `wroket-manifeste.txt` | TXT |
| 5 | `wroket-roadmap-extrait.pdf` | PDF |

**Limites INPI :** 5 fichiers max, 100 Mo total.

---

## Étapes sur INPI Connect

1. Connexion → **Protéger un bien immatériel**
2. Choisir **Enveloppe e-Soleau** → dépôt **numérique**
3. Renseigner le titulaire et l'auteur (cf. TITULAIRE.md)
4. **Titre :** « Wroket — plateforme SaaS de gestion de projets et tâches »
5. **Type :** programme d'ordinateur / œuvre logicielle
6. Téléverser les 5 fichiers
7. Payer en ligne (~15 € TTC pour 5 ans — vérifier tarif sur le portail)
8. Télécharger et archiver le **certificat / récépissé**

---

## Après le dépôt

- [ ] Copier le certificat PDF dans un stockage sécurisé (cloud chiffré + backup local)
- [ ] Copier les **5 fichiers exacts** déposés (ne pas les modifier)
- [ ] Noter le **numéro de dépôt** et la **date** dans TITULAIRE.md
- [ ] Calendrier : renouveler avant **2031** (5 ans)
- [ ] Si création société : signer [CESSION-DROITS-AUTEUR.md](./CESSION-DROITS-AUTEUR.md)

---

## Conversion Markdown → PDF

Si Pandoc est installé (`choco install pandoc` ou https://pandoc.org) :

```powershell
cd docs\inpi-deposit
pandoc wroket-description.md -o wroket-description.pdf
pandoc wroket-architecture.md -o wroket-architecture.pdf
pandoc wroket-roadmap-extrait.md -o wroket-roadmap-extrait.pdf
```

Sinon : ouvrir les fichiers `.html` générés dans `inpi-deposit/output/` et **Imprimer → Enregistrer en PDF** (Chrome/Edge).

---

## Vérification intégrité (optionnel)

Pour vérifier qu'un fichier correspond au dépôt :

```powershell
Get-FileHash -Path "chemin\fichier" -Algorithm SHA256
```

Comparer avec le manifeste `wroket-manifeste.txt`.

---

## Contact INPI

- Site : https://www.inpi.fr
- FAQ e-Soleau : rubrique « Protéger » sur le portail INPI
