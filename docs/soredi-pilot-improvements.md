# SiteTrace V3 - Pilote La Soredi

## Regles de securite operationnelle

- Les incidents existants La Soredi sont des donnees reelles de pilote.
- Ne jamais modifier ou supprimer un incident reel pour tester une evolution.
- Si un test fonctionnel exige une creation, nommer l'incident `TEST CODEX - a supprimer`, puis le supprimer a la fin du test.
- Avant toute execution SQL Supabase, faire un backup verifie de la base et garder un plan de retour arriere.

## Utilisateurs pilote

- William Bourget: createur, testeur, admin.
- Gaetan SOREDI: responsable equipe, responsable essais, acces `/boss`, usage mobile terrain.
- Sullivan Avril: operateur terrain.
- Caroline Thebaud: responsable SSE, suivi et lecture qualite/securite.

## Lot 2 - Supabase et donnees

Etat retenu pour le pilote:

- Le durcissement RLS strict reste une etape controlee, pas un changement brutal.
- Le script `sql/incident-events-journal.sql` ajoute une table append-only `incident_events`.
- Le script prepare aussi `pgcrypto` si necessaire pour generer les identifiants UUID.
- Le script ajoute des index de lecture pour `/boss`: derniers evenements, incident, projet, action, source et utilisateur.
- Le script retire explicitement `update`, `delete` et `truncate` sur `incident_events` pour les roles clients.
- Le script ne contient aucune suppression de donnees metier.
- Le code reste tolerant si la table n'est pas encore presente: l'application continue de fonctionner.

Suite recommandee:

- Executer d'abord `sql/prod-readiness-audit.sql` en lecture seule.
- Ce controle signale aussi si `incident_events` existe deja et si ses policies sont visibles.
- Ce controle liste aussi les index `incident_events` pour confirmer les performances attendues du journal `/boss`.
- Ce controle liste aussi les privileges de table `incident_events` pour verifier que le journal reste limite a `SELECT` et `INSERT` cote client.
- Ce controle donne les volumes estimes et tailles des tables existantes sans echouer si le journal n'est pas encore cree.
- Ce controle liste aussi les policies `storage.objects` pour verifier le comportement des preuves photo.
- Ce controle estime aussi le nombre et la taille des objets du bucket `incident-photos`, meme si le bucket est vide.
- Suivre `docs/soredi-journal-activation-checklist.md` pour l'activation controlee du journal.
- Utiliser `docs/soredi-pilot-test-notes.md` pour guider les essais sans perturber les incidents reels.
- Verifier les policies et buckets depuis Supabase.
- Appliquer `sql/incident-events-journal.sql` seulement apres backup.
- Reporter le durcissement RLS strict apres validation des flux terrain et boss.

## Lot 4 - Fiabilite operationnelle

Actions renforcees:

- Les actions terrain et boss ecrivent le journal seulement apres succes Supabase.
- Les boutons critiques restent desactives pendant les operations longues.
- La suppression protegee dans `/boss` demande aussi la reference incident exacte en plus du mot de passe.
- Le chargement principal `/boss` bascule en erreur lisible si Supabase ne repond pas dans le delai attendu.
- Les chargements initiaux projet, dossier incident et terrain mobile appliquent le meme garde-fou de delai.
- Les chargements secondaires du journal et des operateurs ont aussi un delai de securite pour eviter les boutons ou historiques bloques.
- Les erreurs de journalisation ne bloquent pas la saisie terrain.
- Tant que `incident_events` n'est pas creee, l'application affiche un etat "journal non active" sans polluer la console.
- Dans `/boss`, une table absente et une table presente mais mal configuree sont distinguees pour guider l'activation Supabase.
- Le meme diagnostic est affiche dans les historiques mobile et page incident quand le journal n'est pas disponible.
- Le cas cache schema PostgREST est identifie separement pour guider le reload apres activation SQL.
- Les messages courts et detailles d'indisponibilite du journal sont centralises pour rester coherents entre les ecrans.
- Une erreur de droits ou de configuration sur une table `incident_events` existante reste visible en warning.
- Les imports PDF restent inchanges pour ne pas casser les parcours existants.

## Lot 5 - Tracabilite

Niveaux ajoutes:

- Historique visible sur le detail incident mobile.
- Les historiques mobile et page incident affichent la source, l'utilisateur et le role quand ces informations sont disponibles.
- Onglet `Journal` dans `/boss` pour Gaetan, Caroline et William.
- Filtres manager dans `/boss`: projet, source, periode, action, utilisateur, recherche texte, export CSV des lignes affichees.
- La recherche du journal accepte aussi la reference incident stable, utile pour retrouver une ligne depuis un CSV ou une note SSE.
- L'export CSV et la synthese copiee incluent la reference incident stable, la source, l'utilisateur et le role en plus du titre.
- L'export CSV neutralise les valeurs qui pourraient etre interpretees comme formules dans Excel.
- Les cartes du journal affichent la reference incident et le role de l'utilisateur pour faciliter les revues rapides.
- Pour les evenements conserves apres suppression protegee, `/boss` reutilise le titre et le projet stockes dans les metadonnees du journal.
- Reinitialisation rapide des filtres du journal avec compteur de filtres actifs.
- Synthese manager du journal `/boss`: evenements filtres, incidents concernes, actions terrain, bureau, clotures et exports PDF.
- Copie presse-papiers d'une synthese du journal filtre pour mail, note SSE ou revue de pilotage.
- Ouverture fluide d'un incident depuis le journal `/boss`, avec selection et scroll vers le panneau detail.
- Indicateur de fraicheur du journal `/boss` avec derniere lecture et bouton de rechargement protege pendant l'actualisation.
- Libelles metier harmonises pour les actions du journal dans les ecrans et rapports.
- Choix local de l'utilisateur pilote sur mobile et boss.
- Evenements suivis: creation, mise a jour, statut, assignation, photo, cloture, reouverture, suppression, export PDF.

Limite connue:

- Sans authentification nominative complete, l'identite est declarative et stockee localement dans le navigateur.
- Cela convient au pilote, mais devra etre remplace par une vraie session utilisateur avant production large.

## Lot 6 - Exports PDF

Ameliorations preparees:

- Le rapport projet peut inclure les evenements recents par incident quand `incident_events` est disponible.
- Les lignes de journal des PDF affichent aussi la source, l'utilisateur et son role quand ces donnees sont disponibles.
- Le rapport projet ajoute une synthese journal globale: evenements traces, actions terrain, actions bureau, clotures et exports PDF.
- Les lignes longues du journal sont decoupees proprement dans le PDF projet pour eviter les chevauchements.
- Dans le rapport projet, les preuves photo initiale et cloture peuvent etre affichees ensemble quand elles existent.
- Depuis `/boss`, l'export projet relit les evenements du projet au moment de generer le PDF, puis se replie sur le journal deja charge si la table n'est pas active.
- Dans `/boss`, l'export projet se verrouille aussi pendant la generation pour eviter les doubles exports.
- Dans `/boss`, chaque rapport projet genere un seul evenement journal `pdf_exported`, pour garder un compteur manager lisible.
- Dans `/boss`, le message de succes d'export PDF indique si le journal a bien ete mis a jour, s'il est absent ou si l'evenement n'a pas ete enregistre.
- Les messages d'export distinguent aussi un journal present mais indisponible pour cause de droits ou policies Supabase.
- Depuis la page projet, le message d'export tient compte de la raison reelle si l'ecriture du journal echoue.
- Les messages de resultat apres export PDF sont centralises pour eviter des ecarts entre `/boss` et la page projet.
- Les actions de copie presse-papiers passent par un helper tolerant: message clair si le navigateur ou le mobile refuse la copie.
- Depuis `/boss`, le rapport projet conserve la zone incident quand elle est renseignee, puis se replie sur la localisation du projet.
- Le detail incident `/boss` charge aussi le responsable de cloture et la preuve photo finale quand ils existent.
- Depuis la page projet `/project/[id]`, l'export projet relit aussi les evenements disponibles, avec repli automatique si le journal n'est pas encore active.
- Sur la page projet, le bouton d'export PDF se verrouille pendant la generation pour eviter les doubles exports accidentels.
- Sur la page projet, un export PDF reussi ajoute aussi un evenement `pdf_exported` quand le journal est disponible.
- Le PDF incident unitaire accepte aussi un historique en parametre.
- Les references incident sont harmonisees entre `/boss`, mobile, page incident, mail client et PDF avec le format `FT-XXXXXXXX`.
- Les mails et SMS d'assignation affichent explicitement cette reference harmonisee.
- Le contenu mail/SMS d'assignation est genere par un helper commun pour garder `/boss` et mobile alignes.
- Les messages d'assignation restent lisibles meme si un champ texte est absent dans les donnees locales.
- Les exports restent compatibles avec les appels existants si aucun evenement n'est fourni.
- Le logo Veolia/Soredi est disponible via `public/brands/veolia-soredi.png` et affiche le contexte client dans les ecrans et rapports.

Regle d'usage:

- Conserver FieldTrace comme identite du logiciel.
- Utiliser le logo Veolia/Soredi comme contexte pilote client, sans transformer les rapports en documents officiels Veolia sans validation.
