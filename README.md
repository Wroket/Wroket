# Wroket

Base de projet full-stack pour deployer une application Node.js sur une VM GCP.

## Structure

- `frontend/` : application front
- `backend/` : API Node.js/Express
- `scripts-gcp/` : scripts de preparation et de deploiement VM GCP

## Prerequis locaux

- Git
- GitHub CLI (`gh`)
- Node.js LTS + npm
- Docker Desktop
- Google Cloud SDK (`gcloud`)

## Strategie de publication (VM publique)

1. Build de l'image Docker du backend.
2. Push de l'image vers un registry.
3. Pull sur la VM et lancement via Docker.
4. Exposition publique via Nginx (ports 80/443).
5. Ouverture firewall GCP pour HTTP/HTTPS.

## Workflow rapide

1. Configurer `.env` backend.
2. Construire et publier l'image.
3. Executer le script de deploiement PowerShell.
4. Verifier l'URL publique de la VM.

Voir `scripts-gcp/README.md` pour les details.

