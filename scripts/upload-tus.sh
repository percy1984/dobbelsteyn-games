#!/usr/bin/env bash
# Uploadt het pakket uit dist/deploy/ naar Hostinger, uitsluitend naar de submap `games/`.
#
# Vereist drie omgevingsvariabelen uit de Hostinger-operatie `hosting_files_generate-upload-url`
# (het zijn tijdelijke sleutels; zet ze nooit in git):
#   DG_UPLOAD_URL   de upload-URL
#   DG_AUTH         auth_key
#   DG_AUTH_REST    rest_auth_key
#
# Gebruik:  scripts/upload-tus.sh [pakketmap]      (standaard dist/deploy)
#
# Raakt nooit iets buiten `games/` aan en uploadt nooit config.php (die staat niet in het pakket).
# Volgorde: eerst alle .htaccess-bestanden, zodat gevoelige bestanden nooit even onbeschermd staan;
# index.html als laatste, zodat de app pas "aan" gaat als alles er staat.

set -euo pipefail

: "${DG_UPLOAD_URL:?DG_UPLOAD_URL ontbreekt}"
: "${DG_AUTH:?DG_AUTH ontbreekt}"
: "${DG_AUTH_REST:?DG_AUTH_REST ontbreekt}"

SRC="${1:-dist/deploy}"
REMOTE_DIR="games"

[ -f "$SRC/index.html" ] || { echo "Geen pakket in $SRC (draai npm run deploy:package)." >&2; exit 1; }
if find "$SRC" -name config.php | grep -q .; then
  echo "config.php zit in het pakket; stop." >&2
  exit 1
fi

upload() {
  local rel="$1" file="$SRC/$1" size
  size=$(wc -c < "$file" | tr -d ' ')
  local target="$DG_UPLOAD_URL/$REMOTE_DIR/$rel?override=true"
  curl -sS -o /dev/null -f -X POST "$target" \
    -H "X-Auth: $DG_AUTH" -H "X-Auth-Rest: $DG_AUTH_REST" \
    -H "Tus-Resumable: 1.0.0" -H "Upload-Length: $size" -H "Upload-Offset: 0"
  curl -sS -o /dev/null -f -X PATCH "$target" \
    -H "X-Auth: $DG_AUTH" -H "X-Auth-Rest: $DG_AUTH_REST" \
    -H "Tus-Resumable: 1.0.0" -H "Content-Type: application/offset+octet-stream" \
    -H "Upload-Offset: 0" --data-binary "@$file"
  echo "  $REMOTE_DIR/$rel ($size bytes)"
}

mapfile -t ALL < <(cd "$SRC" && find . -type f | sed 's|^\./||' | sort)

echo "1/3 .htaccess-bestanden"
for f in "${ALL[@]}"; do [[ "$f" == *.htaccess ]] && upload "$f"; done
echo "2/3 overige bestanden"
for f in "${ALL[@]}"; do [[ "$f" == *.htaccess || "$f" == "index.html" ]] || upload "$f"; done
echo "3/3 index.html"
upload "index.html"
echo "Klaar: ${#ALL[@]} bestanden naar $REMOTE_DIR/."
