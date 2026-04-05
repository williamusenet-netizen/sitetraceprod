# FieldTrace

FieldTrace est une application web de pilotage terrain conçue pour suivre des incidents et des non-conformités, de la déclaration sur site jusqu'au livrable client.

Le produit est structuré autour de deux usages complémentaires :
- mode terrain : saisie rapide mobile-first pour signaler, suivre et clôturer
- mode bureau : pilotage opérationnel, priorisation, assignation et revue

## Fonctionnalités principales

- création d'incidents et de non-conformités en mode terrain
- suivi, changement de statut et clôture avec preuves photo
- vue bureau `/boss` pour prioriser les points ouverts
- assignation par mail ou SMS avec lien direct vers l'opération
- export PDF projet et incident

## Stack

- Next.js 16
- React 19
- Supabase
- jsPDF

## Lancement local

1. Installer les dépendances :

```bash
npm install
```

2. Renseigner les variables d'environnement dans `.env.local` :

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

3. Démarrer l'application :

```bash
npm run dev
```

4. Ouvrir :

- mode terrain : [http://localhost:3000](http://localhost:3000)
- mode bureau : [http://localhost:3000/boss](http://localhost:3000/boss)

## Build production

```bash
npm run build
npm run start
```

## Déploiement

Le projet est prévu pour un déploiement sur Vercel avec les variables suivantes :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Notes de démonstration

- la version actuelle est préparée pour une démonstration propre orientée métier
- les outils QA internes et datasets de seed ne font pas partie du périmètre public de démonstration
