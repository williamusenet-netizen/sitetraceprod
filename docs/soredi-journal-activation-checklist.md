# SiteTrace V3 - Activation du journal pilote Soredi

Checklist a suivre avant d'activer `incident_events` sur Supabase.

## Garde-fous

- Ne pas modifier, supprimer ou recreer les incidents existants.
- Faire un backup Supabase verifie avant toute execution SQL.
- Ne pas executer `prod-rls-hardening-proposal.sql` pendant cette activation.
- Si un test incident est indispensable, le nommer `TEST CODEX - a supprimer`, puis le supprimer a la fin.

## Etape 1 - Audit avant activation

Executer uniquement:

```sql
sql/prod-readiness-audit.sql
```

Verifier:

- `projects`, `incidents`, `operators` existent.
- `incident_events` peut etre absent avant activation.
- Le bucket `incident-photos` est toujours visible.
- La RPC `delete_incident_with_password` est visible si la suppression protegee est attendue.

## Etape 2 - Activation du journal

Apres backup valide, executer:

```sql
sql/incident-events-journal.sql
```

Le script doit:

- creer `incident_events` si absent;
- activer RLS sur la table;
- autoriser seulement `select` et `insert` pour le client pilote;
- retirer explicitement `update`, `delete` et `truncate` sur le journal pour les roles clients;
- creer les index de lecture du journal `/boss`;
- ne faire aucun `DELETE`, `TRUNCATE`, `DROP` ou `UPDATE` sur les donnees metier.

## Etape 3 - Controle apres activation

Re-executer:

```sql
sql/prod-readiness-audit.sql
```

Verifier:

- `incident_events` existe.
- Les policies `incident_events_select_pilot` et `incident_events_insert_pilot` sont presentes.
- Les privileges table pour `anon` et `authenticated` sur `incident_events` restent limites a `SELECT` et `INSERT`.
- Les index `incident_events_*_idx` sont listes.
- Les volumes et tailles de tables sont coherents.

## Etape 4 - Smoke test applicatif

Dans l'application:

- ouvrir `/boss`;
- aller dans l'onglet `Journal`;
- cliquer sur `Recharger le journal`;
- verifier que le compteur n'affiche plus `off`;
- si le message parle du cache schema, attendre le reload PostgREST ou relancer le controle apres `notify pgrst, 'reload schema'`;
- ne pas creer d'incident reel pour ce test.

Si un test d'ecriture est indispensable:

- creer un incident `TEST CODEX - a supprimer`;
- faire une action simple;
- verifier l'apparition de l'evenement dans le journal;
- supprimer l'incident test a la fin.

## Retour arriere

En cas de probleme:

- ne pas supprimer les incidents;
- laisser l'application tourner, elle reste tolerante si le journal est indisponible;
- analyser les policies, grants et erreurs console avant toute correction SQL.
