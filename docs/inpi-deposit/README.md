# Dépôt e-Soleau INPI — Wroket

Kit de préparation pour constituer une **preuve d'antériorité** du code source Wroket.

> Ce dossier ne remplace pas un conseil juridique. Voir [TITULAIRE.md](./TITULAIRE.md) pour le choix titulaire.

---

## Démarrage rapide

```powershell
# Depuis la racine du dépôt Wroket
.\scripts\inpi-deposit\build-deposit.ps1
```

Le script génère dans `inpi-deposit/output/YYYY-MM-DD/` :

- archive source (`wroket-source-*.zip`)
- manifeste SHA-256 (`wroket-manifeste.txt`)
- copies des documents descriptifs
- HTML imprimables → PDF pour l'INPI

Ensuite : suivre [GUIDE-DEPOT-INPI.md](./GUIDE-DEPOT-INPI.md).

---

## Contenu du dossier

| Fichier | Rôle |
|---------|------|
| [TITULAIRE.md](./TITULAIRE.md) | Décision titulaire (Option A retenue) |
| [wroket-description.md](./wroket-description.md) | Description fonctionnelle → PDF |
| [wroket-architecture.md](./wroket-architecture.md) | Architecture technique → PDF |
| [wroket-roadmap-extrait.md](./wroket-roadmap-extrait.md) | Jalons datés → PDF |
| [GUIDE-DEPOT-INPI.md](./GUIDE-DEPOT-INPI.md) | Checklist dépôt INPI |
| [CESSION-DROITS-AUTEUR.md](./CESSION-DROITS-AUTEUR.md) | Modèle cession vers société future |

---

## Sortie générée (gitignored)

```
inpi-deposit/output/
└── 2026-06-15/
    ├── wroket-source-2026-06-15.zip
    ├── wroket-manifeste.txt
    ├── wroket-description.html (+ .pdf si pandoc)
    ├── wroket-architecture.html
    └── wroket-roadmap-extrait.html
```

**Ne pas committer** le zip ni les PDF finaux (secrets éventuels, taille).

---

## Renouvellement

Échéance indicative : **5 ans** après le dépôt (ex. juin 2031).
