#!/bin/sh
# Fuehrt die Tests im Container aus (node:20-alpine, wie in Produktion).
# Aufruf: scripts/test.sh [node --test Argumente, z. B. tests/auth.test.js]
set -eu
cd "$(dirname "$0")/.."
ARGS="${*:-tests/}"
exec docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/app -w /app node:20-alpine \
  sh -c "([ -d server/node_modules/express ] || (cd server && npm install --omit=dev --no-audit --no-fund --no-package-lock --loglevel=error)) && node --test $ARGS"
