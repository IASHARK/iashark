#!/usr/bin/env bash
# Commande "ignore" de Netlify (netlify.toml) : decide si un commit merite un
# deploiement. Code de sortie 0 = deploiement SAUTE, tout autre code = build.
#
# Pourquoi (16/09/2026) : le compte Netlify a ete coupe le 15/09 pour
# « usage_exceeded ». Chaque push sur main lancait un build, meme pour un commit
# qui ne touche que la documentation, les tests, les workflows ou les donnees
# brutes (raw_api/) - rien de ce que scripts/build-public.js publie.
#
# Regles de securite :
#   - sans commit de reference (premier build, cache vide, relance manuelle du
#     meme commit) ou commit de reference introuvable : TOUJOURS construire ;
#   - la liste ci-dessous couvre TOUT ce que scripts/build-public.js peut copier
#     dans dist/ (repertoires publics, fichiers racine, lib/ et i18n/ decouverts
#     par les references des pages) + la configuration du build et les fonctions
#     Edge de Netlify. Un fichier en trop ne coute qu'un build ; un fichier en
#     moins empecherait une mise en ligne : en cas de doute, l'ajouter.
#   - tests/netlify-usage.test.js verifie que chaque fichier de dist/ est couvert.
set -u
PUBLISHED=(
  fr en es de it pt gb za mx match blog assets i18n lib netlify
  config/markets.json scripts/build-public.js scripts/netlify-ignore.sh netlify.toml
  _headers _redirects robots.txt
  data-home.json actus.json transferts.json
  ':(glob)*.html' ':(glob)*.js' ':(glob)*.css' ':(glob)*.xml' ':(glob)*.png' ':(glob)*.ico'
  ':(glob)*.svg' ':(glob)*.webp' ':(glob)*.txt' ':(glob)*.webmanifest'
)
if [ "${1:-}" = "--list" ]; then printf '%s\n' "${PUBLISHED[@]}"; exit 0; fi

base="${CACHED_COMMIT_REF:-}"
head="${COMMIT_REF:-}"
if [ -z "$base" ] || [ -z "$head" ] || [ "$base" = "$head" ]; then
  echo "netlify-ignore : pas de commit de reference distinct -> build"
  exit 1
fi
if ! git cat-file -e "${base}^{commit}" 2>/dev/null || ! git cat-file -e "${head}^{commit}" 2>/dev/null; then
  echo "netlify-ignore : commit ${base} ou ${head} introuvable -> build"
  exit 1
fi
if git diff --quiet "$base" "$head" -- "${PUBLISHED[@]}"; then
  echo "netlify-ignore : aucun fichier publie modifie entre ${base} et ${head} -> deploiement saute"
  exit 0
fi
echo "netlify-ignore : fichiers publies modifies -> build"
exit 1
