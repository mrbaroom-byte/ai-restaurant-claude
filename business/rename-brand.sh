#!/usr/bin/env bash
# Swap the working masterbrand name across every asset in business/ in one command.
#
# The decision brief says the name must not be locked before parent language
# testing. This script exists so that locking it later costs one command
# instead of a manual sweep through landing pages, copy decks and specs.
#
# brand-identity-options.md is skipped deliberately: it is a document ABOUT the
# candidate names, so substituting into it would corrupt the comparison table.
# Update that file by hand to record which name was chosen and why.
#
# Usage:
#   ./business/rename-brand.sh "NewLatinName" "الاسم الجديد"
#
# Always run `git diff` afterwards and read the result before committing.

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <new-latin-name> <new-arabic-name>" >&2
  exit 1
fi

NEW_LATIN="$1"
NEW_ARABIC="$2"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$HERE/brand.config.json"

OLD_LATIN=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['masterbrand']['latin'])" "$CONFIG")
OLD_ARABIC=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['masterbrand']['arabic'])" "$CONFIG")

if [ "$OLD_LATIN" = "$NEW_LATIN" ] && [ "$OLD_ARABIC" = "$NEW_ARABIC" ]; then
  echo "Nothing to do: brand already named $OLD_LATIN / $OLD_ARABIC"
  exit 0
fi

echo "Renaming: $OLD_LATIN -> $NEW_LATIN   |   $OLD_ARABIC -> $NEW_ARABIC"

# Substitute in every text asset. -I skips binaries (xlsx, images).
COUNT=0
while IFS= read -r -d '' f; do
  if grep -qI -e "$OLD_LATIN" -e "$OLD_ARABIC" "$f" 2>/dev/null; then
    python3 - "$f" "$OLD_LATIN" "$NEW_LATIN" "$OLD_ARABIC" "$NEW_ARABIC" <<'PY'
import sys, pathlib
path, ol, nl, oa, na = sys.argv[1:6]
p = pathlib.Path(path)
t = p.read_text(encoding="utf-8")
p.write_text(t.replace(ol, nl).replace(oa, na), encoding="utf-8")
PY
    COUNT=$((COUNT + 1))
    echo "  updated $f"
  fi
done < <(find "$HERE" -type f \
  ! -name 'rename-brand.sh' \
  ! -name 'brand-identity-options.md' \
  ! -name '*.xlsx' ! -name '*.png' ! -name '*.pdf' -print0)

echo
echo "Rewrote $COUNT file(s). Review with: git diff -- business/"
echo "Reminder: the name is only safe to lock after the Sept 7-18 parent language testing,"
echo "and after a SAIP trademark search plus a domain/handle availability check."
