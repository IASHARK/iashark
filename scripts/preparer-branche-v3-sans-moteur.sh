#!/usr/bin/env bash
# PREPARER LA BRANCHE DU LANCEMENT V3 SANS LE MOTEUR (methode de l'avocat du diable, 01/10/2026).
#
# Le depot IASHARK/iashark est PUBLIC. La branche de fusion contient, dans son HISTORIQUE, le
# commit 69681458f qui a copie le moteur v3 (moteur-v3/) dans le site : la pousser telle quelle
# rendrait le moteur public pour toujours, meme si un commit suivant retire le dossier.
#
# Ce script fabrique, EN LOCAL SEULEMENT (il ne pousse jamais rien) :
#   une branche NEUVE, partie de origin/main, avec UN SEUL commit dont le contenu est l'arbre de
#   la branche de fusion MOINS le dossier moteur-v3/.
# Puis il fait les 2 controles demandes :
#   1. aucun fichier moteur-v3/ dans l'arbre de la branche ;
#   2. le commit 69681458f (copie du moteur) n'est PAS un ancetre de la branche ;
# et un 3e, par prudence : un seul commit entre origin/main et la branche.
#
# Utilisation (depuis la racine du depot) :
#   scripts/preparer-branche-v3-sans-moteur.sh [SOURCE] [BRANCHE]
#     SOURCE  : la branche ou le commit de fusion a publier (defaut : HEAD)
#     BRANCHE : le nom de la branche a creer (defaut : lancement-v3-sans-moteur)
#   PAS_DE_FETCH=1 : ne pas relire origin/main sur GitHub (utilise la copie locale d'origin/main).
#
# Aucun fichier du dossier de travail n'est touche : l'arbre est construit dans un index
# temporaire. Pour publier ensuite, c'est Clement qui pousse la branche (jamais ce script).
set -euo pipefail

SOURCE="${1:-HEAD}"
BRANCHE="${2:-lancement-v3-sans-moteur}"
COMMIT_MOTEUR="69681458f"
DOSSIER_MOTEUR="moteur-v3"

echec() { echo "ECHEC : $*" >&2; exit 1; }

git rev-parse --git-dir >/dev/null 2>&1 || echec "a lancer depuis le depot du site"
if [ "${PAS_DE_FETCH:-0}" != "1" ]; then
  git fetch --quiet origin main || echec "impossible de relire origin/main (reseau ?) ; relancer avec PAS_DE_FETCH=1 pour utiliser la copie locale"
fi
BASE="$(git rev-parse --verify -q origin/main)" || echec "origin/main introuvable"
SRC="$(git rev-parse --verify -q "${SOURCE}^{commit}")" || echec "source introuvable : $SOURCE"
if git rev-parse --verify -q "refs/heads/$BRANCHE" >/dev/null; then
  echec "la branche $BRANCHE existe deja : choisir un autre nom (rien n'est ecrase)"
fi

# Arbre de la source SANS moteur-v3/, construit dans un index temporaire.
INDEX_TEMP="$(mktemp "${TMPDIR:-/tmp}/iashark-index.XXXXXX")"
trap 'rm -f "$INDEX_TEMP"' EXIT
GIT_INDEX_FILE="$INDEX_TEMP" git read-tree "$SRC"
GIT_INDEX_FILE="$INDEX_TEMP" git rm -r -q --cached --ignore-unmatch -- "$DOSSIER_MOTEUR" >/dev/null
ARBRE="$(GIT_INDEX_FILE="$INDEX_TEMP" git write-tree)"

MESSAGE="Lancement V3 (3/10) : site de la branche de fusion ${SRC:0:9}, SANS le dossier ${DOSSIER_MOTEUR}/ (moteur dans le depot prive IASHARK/iashark-moteur, secret MOTEUR_V3_DEPOT_PRIVE)"
COMMIT="$(git commit-tree "$ARBRE" -p "$BASE" -m "$MESSAGE")"
git branch "$BRANCHE" "$COMMIT"

# Controle 1 : aucun fichier moteur-v3/ dans l'arbre.
# (sortie lue en entier : jamais « ls-tree | grep -q », qu'un SIGPIPE ferait mentir sous pipefail)
RESTE="$(git ls-tree -r --name-only "$BRANCHE" -- "$DOSSIER_MOTEUR")"
if [ -n "$RESTE" ]; then
  git branch -D "$BRANCHE" >/dev/null
  echec "controle 1 : l'arbre contient encore ${DOSSIER_MOTEUR}/ (branche supprimee)"
fi
echo "Controle 1 OK : aucun fichier ${DOSSIER_MOTEUR}/ dans l'arbre de $BRANCHE."

# Controle 2 : le commit de copie du moteur n'est pas un ancetre.
if git cat-file -e "${COMMIT_MOTEUR}^{commit}" 2>/dev/null && git merge-base --is-ancestor "$COMMIT_MOTEUR" "$BRANCHE"; then
  git branch -D "$BRANCHE" >/dev/null
  echec "controle 2 : $COMMIT_MOTEUR est un ancetre de $BRANCHE (branche supprimee)"
fi
echo "Controle 2 OK : $COMMIT_MOTEUR n'est pas un ancetre de $BRANCHE."
# Controle 2 bis (02/10/2026) : le 2e commit qui contient moteur-v3/ (06ed462e3) non plus,
# et aucun commit entre origin/main et la branche ne touche moteur-v3/.
for C in 06ed462e3; do
  if git cat-file -e "${C}^{commit}" 2>/dev/null && git merge-base --is-ancestor "$C" "$BRANCHE"; then
    git branch -D "$BRANCHE" >/dev/null
    echec "controle 2 bis : $C est un ancetre de $BRANCHE (branche supprimee)"
  fi
done
TOUCHE="$(git log --format=%h "$BASE..$BRANCHE" -- "$DOSSIER_MOTEUR")"
if [ -n "$TOUCHE" ]; then
  git branch -D "$BRANCHE" >/dev/null
  echec "controle 2 bis : un commit de la branche touche ${DOSSIER_MOTEUR}/ ($TOUCHE) (branche supprimee)"
fi
echo "Controle 2 bis OK : ni 06ed462e3 ni aucun commit touchant ${DOSSIER_MOTEUR}/ dans l'historique ajoute."

# Controle 3 : un seul commit au-dessus de origin/main.
N="$(git rev-list --count "$BASE..$BRANCHE")"
[ "$N" = "1" ] || echec "controle 3 : $N commits entre origin/main et $BRANCHE (1 attendu)"
echo "Controle 3 OK : un seul commit au-dessus de origin/main (${BASE:0:9})."

# Le raccord du moteur reste dans le site (code du site, sans poids ni regle du moteur).
RACCORD="$(git ls-tree -r --name-only "$BRANCHE" -- raccord-moteur-v3/branchement)"
[ -n "$RACCORD" ] || echo "ATTENTION : raccord-moteur-v3/branchement/ absent de l'arbre (le calcul du matin en a besoin)."

echo
echo "Branche $BRANCHE prete, commit ${COMMIT:0:9}. RIEN n'a ete pousse."
echo "Avant de pousser : le secret MOTEUR_V3_DEPOT_PRIVE doit exister et l'essai a blanc doit etre vert (docs/MOTEUR-V3-DEPOT-PRIVE.md)."
