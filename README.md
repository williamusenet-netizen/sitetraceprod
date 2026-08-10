# FieldTrace

FieldTrace est une application web de pilotage terrain concue pour suivre des incidents et des non-conformites, de la declaration sur site jusqu'au livrable client.

Le produit est structure autour de deux usages complementaires :

- mode terrain : saisie rapide mobile-first pour signaler, suivre et cloturer
- mode bureau : pilotage operationnel, priorisation, assignation et revue

## Fonctionnalites principales

- creation d'incidents et de non-conformites en mode terrain
- suivi, changement de statut et cloture avec preuves photo
- vue bureau `/boss` protegee par Basic Auth
- assignation par mail ou SMS avec lien direct vers l'operation
- export PDF projet et incident

## Stack

- Next.js 16
- React 19
- Supabase
- jsPDF

## Lancement local

1. Installer les dependances :

```bash
npm install
```

2. Renseigner les variables d'environnement dans `.env.local` :

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
FIELDTRACE_BOSS_PASSWORD=localtest
# Optionnel, valeur par defaut: fieldtrace
FIELDTRACE_BOSS_USER=fieldtrace
```

3. Demarrer l'application :

```bash
npm run dev
```

4. Ouvrir :

- mode terrain : [http://localhost:3000](http://localhost:3000)
- mode bureau : [http://fieldtrace:localtest@localhost:3000/boss](http://fieldtrace:localtest@localhost:3000/boss)

Si `/boss` retourne `503`, verifier que `FIELDTRACE_BOSS_PASSWORD` est renseigne avant de redemarrer le serveur local.

## Build production

```bash
npm run build
npm run start
```

## Deploiement

Le projet est prevu pour un deploiement sur Vercel avec les variables suivantes :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `FIELDTRACE_BOSS_PASSWORD`
- `FIELDTRACE_BOSS_USER` si un identifiant different de `fieldtrace` est souhaite

Ne jamais stocker le mot de passe reel dans le depot.

## Notes de demonstration

- la version actuelle est preparee pour une demonstration propre orientee metier
- les incidents existants du pilote Soredi sont des donnees reelles et ne doivent pas etre modifies pour tester
- les outils QA internes et datasets de seed ne font pas partie du perimetre public de demonstration

## Propriété intellectuelle / Intellectual property

Ce dépôt contient des éléments propriétaires. Voir [NOTICE.md](NOTICE.md). Les composants tiers restent soumis à leurs licences respectives.

This repository contains proprietary elements. See [NOTICE.md](NOTICE.md). Third-party components remain governed by their respective licences.
