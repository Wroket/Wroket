# IA assistive dans Wroket — opportunités, risques, prochaines étapes

**Statut** : document d’étude (R&D) — **aucune fonctionnalité IA n’est livrée** tant qu’une décision explicite go/no-go n’a pas été prise et qu’un avenant / base légale RGPD n’est pas en place pour l’envoi éventuel de contenu utilisateur vers un fournisseur tiers.

**Public cible** : produit, technique, conformité.

---

## 1. Pourquoi maintenant

Wroket est un hub **tâches + agenda + notes + collaboration**. La friction quotidienne vient souvent de :

- reformuler ou structurer de l’information déjà saisie ;
- passer de la prise de notes à des **actions** (tâches, deadlines) ;
- prioriser face à un volume croissant de données ;
- retrouver l’information par **sens** plutôt que par mot-clé exact.

Les modèles de langage et les embeddings peuvent **réduire cette friction** sans remplacer le jugement utilisateur, à condition d’être **opt-in**, **bornés en coût** et **présentés comme suggestions** (jamais comme vérité automatique).

Une différenciation raisonnable pourrait s’aligner sur les paliers **Small teams / Large teams** (cohérent avec le pack intégrations déjà gated), tout en gardant une voie **désactivée par défaut** au niveau équipe pour les organisations sensibles.

---

## 2. Principes de conception (non négociables)

### 2.1 Opt-in explicite

- Activation **par utilisateur** et, pour les équipes, **politique d’équipe** (ex. désactivation globale par l’admin d’équipe).
- Bandeau / écran d’acceptation clair : **quel contenu** peut être envoyé, **à quel fournisseur**, **finalité**, **durée de rétention côté fournisseur**, lien vers la politique de confidentialité et possibilité de retirer le consentement.

### 2.2 RGPD et résidence des données

- Aujourd’hui, le contenu métier (titres, notes, commentaires) est traité **en clair côté application** en production (cf. règles `data-safety` / commentaires export). Tout envoi vers un LLM est donc un **nouveau traitement** à documenter (registre, DPIA si pertinent, sous-traitance / DPA).
- **Préférence** : fournisseur avec **hébergement UE** (ex. offres européennes) ou configuration **zéro rétention** + DPA signé.
- **Alternative** : OpenAI (ou équivalent) avec paramètres contractuels et techniques minimisant la rétention — à valider juridiquement avant production.

### 2.3 Abstraction fournisseur

- Interface interne du type `AiProvider` : `summarize`, `extractTasks`, `embed`, etc.
- Permet de **changer de modèle / de région** sans refondre l’UI.

### 2.4 Coût borné

- **Quotas** par utilisateur / par équipe / par mois (tokens ou appels).
- **Circuit breaker** global (arrêt automatique si dépassement budgétaire ou taux d’erreur).
- Observabilité : métriques `ai.requests`, `ai.tokens`, `ai.errors`, corrélation `requestId` déjà présent côté API.

### 2.5 Sorties = suggestions

- Pas de création / modification / suppression **sans confirmation** utilisateur.
- Prévisualisation éditable avant application (pattern « Appliquer » / « Ignorer »).

---

## 3. Cas d’usage classés (impact × effort)

Les charges sont des **ordres de grandeur** pour une petite équipe, hors revue sécurité approfondie.

### 3.1 Quick wins (impact modéré, effort faible)

| Cas d’usage | Description | Effort indicatif |
|-------------|-------------|------------------|
| **Résumé de note** | Bouton « Résumer » sur une note → 3 à 5 puces + option « copier ». | 2–3 j |
| **Extraction de tâches depuis une note** | Détecter des lignes actionnables ; proposer un **batch** de tâches à créer (l’UI `/task` existe déjà pour la création unitaire). | 3–4 j |
| **Suggestion de tags** | À partir du titre + description d’une tâche ou d’un projet. | ~2 j |
| **Reformulation de commentaire** | Avant publication : ton plus clair / plus court (suggestion éditable). | 1–2 j |

### 3.2 Haute valeur, effort moyen

| Cas d’usage | Description | Effort indicatif |
|-------------|-------------|------------------|
| **Planification de semaine assistée** | Croiser priorités, deadlines, créneaux libres (réutilisation concepts `calendarService` / slots). Aligné roadmap **Premium > AI scheduling**. | 6–10 j |
| **Daily digest IA** | Résumé matinal « 5 priorités + risques » ; canal **notifications externes** déjà lié aux paliers Small+. | 5–8 j |
| **Recherche sémantique** | Embeddings sur titres / contenus notes & tâches ; résultats par **proximité sémantique**. Index + invalidation + coût stockage. | 6–8 j+ |

### 3.3 R&D / risques élevés

- **Détection de doublons** entre tâches (embedding + seuil) — faux positifs gênants si mal calibré.
- **Génération de template de projet** à partir d’une description libre (proche des templates déjà livrés ; l’IA propose phases + tâches initiales).
- **Coach productivité** (temps planifié vs effectué) : dépend fortement d’un **time tracking** fiable (non implémenté aujourd’hui).

---

## 4. Plus-value attendue (produit & pricing)

| Levier | Effet attendu |
|--------|----------------|
| **Activation** | Fonctionnalités « wow » accessibles après upgrade (ex. Small+) : résumé note + extraction tâches. |
| **Rétention** | Digest quotidien + rappels contextuels → moins d’oublis de deadlines. |
| **Pricing** | IA regroupée derrière un **gating clair** (ex. `entitlements.aiAssist` sur Small+ / Large), message marketing simple. |

---

## 5. Risques et garde-fous

### 5.1 RGPD / transparence

- Traitement de données personnelles et potentiellement **sensibles** (notes projets).
- Minimisation : envoyer **uniquement** le fragment nécessaire (ex. une note à la fois), pas l’historique complet du compte.
- Journalisation : qui a appelé l’IA, quand, sur quel artefact (sans stocker le prompt en clair indéfiniment si non nécessaire).

### 5.2 Coût opérationnel

- Risque de **dérive des coûts** si quotas souples.
- Mitigation : quotas durs, backoff, refus gracieux côté UI (« quota atteint ce mois-ci »).

### 5.3 Hallucinations & fiabilité

- Ne jamais présenter une sortie comme **décision** (ex. date de deadline « devinée » sans validation).
- Afficher une mention du type : **Suggestion générée par IA — vérifiez avant d’agir.**

### 5.4 Sécurité (prompt injection)

- Le contenu utilisateur ne doit **pas** contrôler le rôle système ni chaîner d’actions serveur non validées.
- Mitigations : prompts système figés, sanitization, pas d’exécution d’outils arbitraires basée sur la sortie du modèle, validation stricte des schémas JSON si parsing automatique.

### 5.5 Dette maintenance

- Évolution des API fournisseurs, dépréciation de modèles, régressions de qualité → prévoir **feature flag** et chemin de désactivation immédiat.

---

## 6. Prochaine étape concrète recommandée (POC)

**Objectif** : valider technique + UX + coût + procédure consentement, **sans** engagement produit long.

1. **Scope POC** : bouton **« Résumer cette note »** sur une note existante.
2. **Backend** : route `POST /ai/summarize-note/:noteId` (ou équivalent) — auth stricte, vérification `canAccessNote`, pas de fuite inter-utilisateurs.
3. **Feature flag** : ex. `AI_ASSIST_ENABLED` côté serveur + toggle UI.
4. **Entitlement** : étendre le modèle (ex. `aiAssist: boolean`) pour **Small teams et plus** ; rate-limit par utilisateur (ex. N appels / jour en beta).
5. **Fournisseur** : un seul provider dans le POC (ex. Mistral EU **ou** OpenAI avec paramètres conformes), derrière `AiProvider`.
6. **Critères de succès du POC** : latence acceptable, qualité perçue sur un panel de notes réelles (anonymisées), coût mesuré sur 100 appels, retour utilisateur interne, validation juridique minimal du flux de consentement.

**Sortie de l’étude** : décision **go** (passage en epic backlog avec critères d’acceptation RGPD) / **no-go** / **go limité** (beta fermée, palier unique).

---

## 7. Références internes

- Roadmap : section **À l’étude (R&D) — IA assistive** ; **Premium > AI scheduling** pour la planification automatique long terme.
- Règles workspace : `product-e2e.mdc`, `data-safety.mdc`, `feature-completeness-gate.mdc`.

---

*Document maintenu par l’équipe produit / technique — dernière révision : alignement avec le plan roadmap « IA assistive (étude documentée) ».*
