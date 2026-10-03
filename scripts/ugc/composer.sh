#!/usr/bin/env bash
# IASHARK — montage d'une video UGC muette, 720x1280, 30 i/s, + affiche JPG (03/10/2026).
#
# Usage :
#   scripts/ugc/composer.sh <capture.png> <personne.mp4> <sortie.mp4> ["texte a l'ecran"]
#
# Deux recettes (Clement choisit apres la video d'essai) :
#   MODE=incrustation (defaut) : en fond, la VRAIE capture d'ecran IASHARK (chiffres
#       et textes reels, nets) ; par-dessus, en bas a droite, la personne creee par IA
#       tournee SUR FOND VERT uni, detouree ici (chromakey + despill).
#   MODE=plein : la personne en plein ecran (selfie, decor reel : chambre, voiture,
#       canape, bar), puis fondu vers la VRAIE capture d'ecran pendant les 2,5 dernieres
#       secondes. Un ecran de telephone fabrique par l'IA n'est jamais lisible : seule
#       la capture reelle montre des chiffres.
#
# Toujours muet (piste son supprimee). Mention « Image virtuelle » incrustee en haut
# a gauche (obligation legale, BADGE="" pour une video d'affilie, qui porte alors
# « Collaboration commerciale » : BADGE="Collaboration commerciale").
# Texte a l'ecran : facultatif, « | » = retour a la ligne. Pas d'emoji (police sans
# emoji) : les ajouter dans l'editeur TikTok si besoin.
#
# Reglages : MODE, BADGE, TEXTE_Y (hauteur du texte, defaut 300 :
# sous la mention du coin), LARGEUR_PERSONNE
# (incrustation, defaut 430), CLE_VERTE (defaut 0x00FF00), SIMILARITE (defaut 0.16),
# FONDU (plein, defaut 2.5), POLICE (fichier .ttf).
# Sortie : <sortie.mp4> (H.264, faststart, sans son) et <sortie>.jpg (affiche 360x640).
set -euo pipefail

if [ $# -lt 3 ]; then
  sed -n '2,25p' "$0"; exit 2
fi
CAPTURE=$1; PERSONNE=$2; SORTIE=$3; TEXTE=${4:-}
MODE=${MODE:-incrustation}
BADGE=${BADGE-Image virtuelle}
TEXTE_Y=${TEXTE_Y:-300}
LARGEUR_PERSONNE=${LARGEUR_PERSONNE:-430}
CLE_VERTE=${CLE_VERTE:-0x00FF00}
SIMILARITE=${SIMILARITE:-0.16}
FONDU=${FONDU:-2.5}
for f in "$CAPTURE" "$PERSONNE"; do [ -f "$f" ] || { echo "Fichier introuvable : $f" >&2; exit 1; }; done
command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null || { echo "ffmpeg et ffprobe sont necessaires" >&2; exit 1; }

if [ -z "${POLICE:-}" ]; then
  for p in /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf "/System/Library/Fonts/Supplemental/Arial Bold.ttf" /Library/Fonts/Arial\ Bold.ttf; do
    [ -f "$p" ] && { POLICE=$p; break; }
  done
fi
[ -n "${POLICE:-}" ] || { echo "Aucune police trouvee : POLICE=/chemin/police.ttf" >&2; exit 1; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
printf '%s' "$BADGE" > "$TMP/badge.txt"
printf '%s' "$TEXTE" | tr '|' '\n' > "$TMP/texte.txt"
esc() { printf '%s' "$1" | sed "s/\\\\/\\\\\\\\/g; s/:/\\\\:/g; s/'/\\\\'/g"; }
FONT=$(esc "$POLICE"); FB=$(esc "$TMP/badge.txt"); FT=$(esc "$TMP/texte.txt")

DUREE=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$PERSONNE")
DUREE=$(LC_ALL=C awk -v d="$DUREE" 'BEGIN{printf "%.2f", d}')

HABILLAGE=""
# Lignes du texte centrees si ffmpeg >= 6.1 (option text_align), sinon alignees a gauche.
AIDE_DRAWTEXT=$(ffmpeg -hide_banner -h filter=drawtext 2>/dev/null || true)
ALIGN=""; case "$AIDE_DRAWTEXT" in *text_align*) ALIGN=":text_align=C" ;; esac
[ -n "$BADGE" ] && HABILLAGE+=",drawtext=fontfile='$FONT':textfile='$FB':fontsize=24:fontcolor=white:box=1:boxcolor=0x060b12@0.72:boxborderw=8:x=22:y=22"
[ -n "$TEXTE" ] && HABILLAGE+=",drawtext=fontfile='$FONT':textfile='$FT':fontsize=44:line_spacing=10:fontcolor=white:borderw=3:bordercolor=black@0.85:box=1:boxcolor=0x060b12@0.55:boxborderw=14$ALIGN:x=(w-text_w)/2:y=$TEXTE_Y"

FOND="scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=30"
case "$MODE" in
  incrustation)
    FILTRE="[0:v]$FOND,format=yuv420p[fond];\
[1:v]fps=30,scale=$LARGEUR_PERSONNE:-2,chromakey=$CLE_VERTE:$SIMILARITE:0.08,despill=type=green,format=yuva420p[pers];\
[fond][pers]overlay=x=W-w+10:y=H-h:shortest=1$HABILLAGE,format=yuv420p[v]"
    ENTREES=(-loop 1 -framerate 30 -t "$DUREE" -i "$CAPTURE" -i "$PERSONNE")
    ;;
  plein)
    TOTAL=$(LC_ALL=C awk -v d="$DUREE" -v f="$FONDU" 'BEGIN{printf "%.2f", d + f - 0.5}')
    DEBUT=$(LC_ALL=C awk -v d="$DUREE" 'BEGIN{printf "%.2f", d - 0.5}')
    FILTRE="[0:v]$FOND,trim=duration=$DUREE,setpts=PTS-STARTPTS,format=yuv420p[pers];\
[1:v]$FOND,trim=duration=$FONDU,setpts=PTS-STARTPTS,format=yuv420p[ecran];\
[pers][ecran]xfade=transition=fade:duration=0.5:offset=$DEBUT$HABILLAGE,format=yuv420p[v]"
    ENTREES=(-i "$PERSONNE" -loop 1 -framerate 30 -t "$FONDU" -i "$CAPTURE")
    DUREE=$TOTAL
    ;;
  *) echo "MODE inconnu : $MODE (incrustation ou plein)" >&2; exit 2 ;;
esac

ffmpeg -hide_banner -loglevel error -y "${ENTREES[@]}" -filter_complex "$FILTRE" -map "[v]" -an \
  -t "$DUREE" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart "$SORTIE"
AFFICHE="${SORTIE%.*}.jpg"
ffmpeg -hide_banner -loglevel error -y -ss 1 -i "$SORTIE" -frames:v 1 -vf "scale=360:640" -q:v 4 "$AFFICHE"
echo "OK : $SORTIE ($(du -h "$SORTIE" | cut -f1)) + $AFFICHE"
