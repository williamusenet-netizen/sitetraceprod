# FieldTrace V3 - Checklist transition PROD sans perte

Ce document est une checklist operationnelle. Il ne remplace pas une validation
humaine avant bascule et ne demande aucune suppression de donnees.

## Interdits

- Ne jamais reset Supabase.
- Ne jamais truncate ou drop une table/schema/fonction sans validation explicite.
- Ne jamais rejouer un seed destructif.
- Ne jamais rejouer `sql/operators-table.sql` en production sans revue securite:
  ce script remplace des policies et autorise actuellement le delete operateur.
- Ne jamais appliquer un durcissement RLS sans validation explicite et smoke tests.
- Ne jamais supprimer les objets Storage.
- Ne jamais restaurer une sauvegarde sur la base live sans diagnostic et accord.

## Pre-check donnees

- Relever les compteurs avant bascule:
  - `public.projects`
  - `public.incidents`
  - `public.operators`
  - `public.attachments`
  - tables `claims`, `events`, `evidences`, `weekly_reports`
  - objets par bucket Storage
- Verifier la signature RPC:
  - `public.delete_incident_with_password(uuid, text)`
- Verifier que les incidents de test `AUTO_DELETE_TEST_%` sont absents.

## Backup DB

- Declencher/verifier le backup Supabase depuis le Dashboard.
- Confirmer le point de restauration disponible avant bascule.
- Exporter un dump logique si possible pour audit hors-ligne.
- Noter l'heure exacte du point de controle.

## Storage

- Inventorier les buckets:
  - `incident-photos`
  - `evidences`
- Exporter ou sauvegarder les objets Storage separement de la DB.
- Comparer avant/apres:
  - nombre d'objets par bucket
  - derniers objets crees
  - liens stockes dans `initial_photo_url` et `close_photo_url`
- Ne pas rendre `incident-photos` prive sans migration des URLs existantes.

## Vercel PROD

- Verifier le projet Vercel cible avant toute action.
- Verifier les variables Production:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `FIELDTRACE_BOSS_PASSWORD`
  - `FIELDTRACE_BOSS_USER` si un user different de `fieldtrace` est souhaite
- Confirmer que l'URL Supabase et la cle anon pointent vers le meme projet.
- Ne pas copier les variables Preview vers Production sans verification.
- Ne pas deployer si `.vercel` ou le dashboard Vercel pointe vers un projet ambigu.

## Smoke tests post-bascule

- `/` charge le mode terrain.
- `/operation/[incidentId]` charge un incident existant.
- `/boss` refuse sans Basic Auth.
- `/boss` accepte avec les credentials PROD.
- Creation incident terrain OK.
- Update statut incident OK.
- Upload photo OK.
- Export PDF OK.
- Suppression incident via RPC OK uniquement avec validation controlee.

## Rollback

- Rollback applicatif prioritaire via Vercel Instant Rollback.
- Garder la meme base Supabase tant que les donnees ne sont pas corrompues.
- Rollback data uniquement en dernier recours, apres diagnostic et accord.
- Si corruption DB:
  - restaurer d'abord dans un projet clone;
  - comparer les compteurs et lignes impactees;
  - reparer selectivement si possible.
- Restaurer Storage separement si des medias sont impactes.
