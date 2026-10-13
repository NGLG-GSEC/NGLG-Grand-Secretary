#!/bin/bash
# Double-click this in Finder to publish an update to the NGLG site.
# It just runs publish.sh in a Terminal window and keeps the window open
# afterwards so you can read the result.

cd "$(dirname "$0")" || exit 1

printf '\033]0;NGLG — Publish\007'   # name the Terminal window
clear

./publish.sh
STATUS=$?

printf '\n'
if [ "$STATUS" -ne 0 ]; then
  printf '\033[31mFinished with errors (exit %s).\033[0m\n' "$STATUS"
fi
printf '\033[2mPress any key to close this window…\033[0m'
read -r -n 1 -s
printf '\n'
