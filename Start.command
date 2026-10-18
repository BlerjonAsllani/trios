#!/bin/zsh
set -e
cd -- "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  for runtime in "$HOME"/.nvm/versions/node/*/bin/node(N); do
    export PATH="${runtime:h}:$PATH"
  done
fi
if ! command -v node >/dev/null 2>&1; then
  print 'Zum Starten wird Node.js ab Version 20 benötigt.'
  read '?Drücke Enter zum Schließen.'
  exit 1
fi
print 'Dein ternäres System startet.'
TRIOS_OPEN="${TRIOS_OPEN:-1}" node server.mjs
