# Moteur v3 hors du dépôt public : la méthode (01/10/2026)

Le site IASHARK/iashark est **public**. La branche de fusion contient, dans son **historique**, le
commit `69681458f` qui a copié le moteur v3 (dossier `moteur-v3/`, 48 fichiers, réglages compris)
dans le site. Pousser cette branche telle quelle rendrait le moteur public **pour toujours**, même
si un commit suivant retire le dossier : l'ancien commit resterait lisible.

Méthode retenue (avocat du diable, 01/10/2026) : on ne pousse **jamais** la branche de fusion. On
publie une **branche neuve**, partie de `origin/main`, avec **un seul commit** qui contient le site
de la fusion **sans** `moteur-v3/`. Le moteur, lui, est lu chaque matin dans le dépôt privé
IASHARK/iashark-moteur.

## Ce qui est déjà prêt dans le site

- Le calcul du matin (`update-data.yml`) et l'essai à blanc (`moteur-v3-essai-a-blanc.yml`) vont
  chercher le moteur dans le dépôt privé **IASHARK/iashark-moteur** dès que le secret
  **`MOTEUR_V3_DEPOT_PRIVE`** existe. Ils le copient dans `.moteur-v3-prive/` (ignoré par Git,
  jamais publié). Seuls les résultats du calcul sont enregistrés.
- Le raccord `raccord-moteur-v3/branchement/` (il reconstruit les données du moteur à partir de
  football-data) est du code du site, sans poids ni règle du moteur : on garde `raccord-moteur-v3/`
  dans le site et les workflows le copient dans le dossier du moteur juste avant de le lancer.
- Version du moteur utilisée : la variable `MOTEUR_V3_REF` si elle existe, sinon le commit
  `1aee60b` (le même que la copie `moteur-v3/`, vérifié fichier par fichier le 30/09/2026).

## Les étapes, dans l'ordre

1. **Clément** : sur GitHub, créer un jeton **en lecture seule**, limité au seul dépôt
   IASHARK/iashark-moteur (permission « Contents : Read-only »). Noter sa date d'expiration.
2. **Clément** : dans IASHARK/iashark, Settings → Secrets and variables → Actions, créer le secret
   `MOTEUR_V3_DEPOT_PRIVE` et y coller le jeton. Ne le donner à personne, même pas à Claude.
3. **Claude**, en local, sans rien pousser : fabriquer la branche neuve et faire les contrôles.

   ```
   scripts/preparer-branche-v3-sans-moteur.sh <branche de fusion finale> lancement-v3-sans-moteur
   ```

   Le script part de `origin/main` (relu sur GitHub), fabrique **un seul commit** dont le contenu
   est l'arbre de la branche de fusion **moins** `moteur-v3/`, puis vérifie :
   - **Contrôle 1** : aucun fichier `moteur-v3/` dans l'arbre de la nouvelle branche ;
   - **Contrôle 2** : le commit `69681458f` (copie du moteur) n'est **pas** un ancêtre de la
     nouvelle branche ;
   - et, par prudence, un seul commit entre `origin/main` et la nouvelle branche.

   Un contrôle rouge : la branche est supprimée et rien n'est publié. Le script ne pousse jamais.
4. **Clément** (avec son « oui ») : pousser `lancement-v3-sans-moteur` et ouvrir la demande de
   fusion depuis **cette** branche (jamais depuis la branche de fusion).
5. Relance l'essai à blanc **après** ce retrait, une fois la branche sans moteur fusionnée (Actions
   → « Moteur v3 - essai à blanc » → Run workflow). Il doit finir en vert et dire « Moteur v3 :
   dépôt privé IASHARK/iashark-moteur ». Rouge : pas de pari v3 ce jour-là, suivre le retour
   arrière du plan de lancement.

## Si le secret manque ou expire

Sans `moteur-v3/` dans le site et sans secret valable, le site est quand même mis à jour chaque
matin, mais **sans aucun pari v3**, et le calcul du matin passe au rouge avec « secret
MOTEUR_V3_DEPOT_PRIVE absent et moteur-v3/ retiré » ou « moteur illisible ». Renouveler le jeton
avant sa date d'expiration.

## À savoir

- Vérifié le 01/10/2026 sur la copie locale : `origin/main` ne contient pas `moteur-v3/`, et
  aucune branche distante connue ne contient `69681458f`. La méthode ci-dessus garde les choses
  ainsi ; si une branche contenant `69681458f` avait déjà été poussée, il faudrait la supprimer
  sur GitHub (décision de Clément).
- Autre option (non retenue) : rendre IASHARK/iashark privé. Plus simple, mais les minutes GitHub
  Actions deviennent payantes au-delà du quota gratuit.
