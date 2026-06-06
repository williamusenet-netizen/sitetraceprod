# SiteTrace V3 - Notes de test pilote Soredi

Memo court pour tester les ameliorations sans perturber les donnees reelles.

## Profils pilotes

- Gaetan SOREDI: tester `/boss`, le journal, les rapports projet et l'usage mobile terrain.
- Caroline Thebaud: relire le journal, les syntheses et les exports pour suivi SSE.
- Sullivan Avril: tester uniquement les parcours terrain utiles a l'exploitation.
- William Bourget: verifier admin, coherence des rapports et activation Supabase.

## Tests sans creation d'incident

- Ouvrir `/boss`.
- Verifier le selecteur `Utilisateur pilote`.
- Ouvrir l'onglet `Journal`.
- Verifier l'etat du journal:
  - `off` avant activation Supabase;
  - compteur et filtres actifs apres activation.
- Tester les filtres du journal si des evenements existent.
- Ouvrir un incident existant depuis la liste, sans enregistrer de modification.
- Generer un rapport seulement si un export de test est acceptable.

## Tests terrain prudents

- Ouvrir un incident existant en lecture.
- Verifier les preuves visibles, le statut et l'historique.
- Ne pas changer le statut d'un incident reel juste pour tester.
- Ne pas ajouter de photo sur un incident reel sauf besoin operationnel.

## Test complet avec incident dedie

A faire seulement si une validation de bout en bout est necessaire et acceptee avant le test.
Eviter ce scenario tant que les verifications en lecture et les exports suffisent.

1. Creer un incident nomme `TEST CODEX - a supprimer`.
2. Verifier qu'il apparait dans `/boss`.
3. Modifier une information simple.
4. Ajouter une preuve si necessaire.
5. Generer un PDF si necessaire.
6. Verifier le journal.
7. Supprimer l'incident test a la fin.

## Points a remonter

- Journal: filtres, libelles ou synthese pas assez clairs.
- Mobile: action terrain trop longue ou bouton difficile a atteindre.
- PDF: information manquante pour la revue Soredi.
- Logo: usage trop visible ou pas assez contextualise.
- Donnees: tout comportement qui semble modifier un incident sans action volontaire.
