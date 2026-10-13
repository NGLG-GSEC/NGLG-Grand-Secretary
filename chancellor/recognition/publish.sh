#!/usr/bin/env bash
#
# publish.sh — push an edition exported from the NGLG builder to the live site.
#
#   ./publish.sh                          newest .html in ~/Downloads -> current edition
#   ./publish.sh path/to/file.html        publish that file           -> current edition
#   ./publish.sh file.html new-name.html  publish under a new name (a new edition)
#   ./publish.sh -y                       skip the confirmation prompt
#
set -euo pipefail

REPO="$HOME/Grand-Chancellor"
SITE="https://nglg-gsec.github.io/Grand-Chancellor"
DEFAULT_TARGET="recognition/regularity-2026august.html"
DOWNLOADS="$HOME/Downloads"

if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'
else
  B=''; DIM=''; G=''; Y=''; R=''; N=''
fi

die()  { printf '%s\n' "${R}✗ $*${N}" >&2; exit 1; }
step() { printf '%s\n' "${B}$*${N}"; }
note() { printf '%s\n' "${DIM}  $*${N}"; }

# ---- parse arguments -------------------------------------------------------
ASSUME_YES=0
POSITIONAL=""
for a in "$@"; do
  case "$a" in
    -y|--yes)  ASSUME_YES=1 ;;
    -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)        die "Unknown option: $a" ;;
    *)         POSITIONAL="$POSITIONAL
$a" ;;
  esac
done
SRC=$(printf '%s' "$POSITIONAL" | sed -n '2p')
TARGET=$(printf '%s' "$POSITIONAL" | sed -n '3p')
[ -n "$TARGET" ] || TARGET="$DEFAULT_TARGET"

[ -d "$REPO/.git" ] || die "No git repo at $REPO"

# ---- locate the source file ------------------------------------------------
if [ -z "$SRC" ]; then
  step "Looking for the newest .html in ~/Downloads…"
  SRC=$(ls -t "$DOWNLOADS"/*.html 2>/dev/null | head -1 || true)
  [ -n "$SRC" ] || die "No .html files in $DOWNLOADS. Use: ./publish.sh path/to/file.html"
fi
[ -f "$SRC" ] || die "Not a file: $SRC"
[ -s "$SRC" ] || die "File is empty: $SRC"

grep -qi '<html' "$SRC" || die "That does not look like an HTML file: $SRC"

TITLE=$(sed -n 's/.*<title>\([^<]*\)<\/title>.*/\1/p' "$SRC" | head -1)
SIZE=$(du -h "$SRC" | cut -f1 | tr -d ' ')
WHEN=$(date -r "$SRC" '+%Y-%m-%d %H:%M')

# ---- show the plan and confirm --------------------------------------------
printf '\n'
step "About to publish:"
note "from    $SRC"
note "size    $SIZE   modified $WHEN"
note "title   ${TITLE:-(no <title> found)}"
note "to      $TARGET"
if [ -f "$REPO/$TARGET" ]; then
  if cmp -s "$SRC" "$REPO/$TARGET"; then
    printf '\n%s\n' "${G}Already identical to what is published — nothing to do.${N}"
    exit 0
  fi
  note "        (replaces the existing $TARGET)"
else
  note "        ${Y}(new file — I will not be linked from index.html automatically)${N}"
fi
printf '\n'
printf '%s' "This goes live publicly. Continue? [y/N] "
if [ "$ASSUME_YES" -eq 1 ]; then
  printf 'y (--yes)\n'
else
  read -r reply < /dev/tty || reply=""
  case "$reply" in [yY]*) ;; *) printf '%s\n' "Cancelled — nothing was changed."; exit 0 ;; esac
fi

# ---- copy, commit, push ----------------------------------------------------
cd "$REPO"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = "main" ] || die "On branch '$BRANCH', expected 'main'."

printf '\n'
step "Copying into the repo…"
cp "$SRC" "$REPO/$TARGET"

if git diff --quiet -- "$TARGET" && git diff --cached --quiet -- "$TARGET"; then
  printf '%s\n' "${G}No change after copy — nothing to publish.${N}"
  exit 0
fi

step "Committing…"
git add -- "$TARGET"
git -c commit.gpgsign=false commit -qm "Publish updated ${TARGET%.html} (${TITLE:-edition})"

step "Pushing…"
git push -q origin main
note "$(git log --oneline -1)"

# ---- wait for the Pages build, then verify --------------------------------
step "Waiting for GitHub Pages to rebuild…"
if command -v gh >/dev/null 2>&1; then
  i=0
  while [ "$i" -lt 20 ]; do
    s=$(gh api repos/NGLG-GSEC/Grand-Chancellor/pages/builds/latest 2>/dev/null \
        | python3 -c 'import sys,json;print(json.load(sys.stdin).get("status",""))' 2>/dev/null || true)
    [ "$s" = "built" ] && break
    [ "$s" = "errored" ] && die "Pages build errored — check the repo's Actions tab."
    sleep 10
    i=$((i+1))
  done
else
  sleep 60
fi

URL="$SITE/$TARGET"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$URL" || true)
printf '\n'
if [ "$CODE" = "200" ]; then
  printf '%s\n' "${G}✓ Live:${N} $URL"
  note "If you still see the old version, hard-refresh with Cmd+Shift+R."
else
  printf '%s\n' "${Y}Pushed, but $URL returned HTTP $CODE — give it another minute.${N}"
fi
