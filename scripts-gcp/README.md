# Scripts GCP

Scripts pour preparer la VM et deployer l'application.

## Fichiers

- `vm-bootstrap.sh` : prepare la VM Ubuntu (Docker + Nginx).
- `deploy.ps1` : deploie une image Docker sur la VM via SSH.

## Prerequis

- SSH fonctionnel vers `gcp-vm`.
- Docker installe sur la VM (via `vm-bootstrap.sh`).
- Une image backend disponible sur un registry (Artifact Registry ou Docker Hub).

## 1) Bootstrap VM (une seule fois)

Depuis ton poste local :

```powershell
scp .\scripts-gcp\vm-bootstrap.sh gcp-vm:~/
ssh gcp-vm "chmod +x ~/vm-bootstrap.sh && ~/vm-bootstrap.sh"
```

## 2) Deploiement de l'application

Exemple :

```powershell
.\scripts-gcp\deploy.ps1 -VmHost "gcp-vm" -ImageRef "docker.io/<user>/wroket-api:latest"
```

Le script:
- pull la nouvelle image
- remplace le conteneur existant
- expose l'API sur le port `3000` de la VM

## 3) Rendre public

- Ouvrir les regles firewall GCP pour `tcp:80` et `tcp:443`.
- Configurer Nginx comme reverse proxy vers `localhost:3000`.
- Optionnel: ajouter TLS (Let's Encrypt).

