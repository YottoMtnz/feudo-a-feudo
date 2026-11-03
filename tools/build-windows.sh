#!/usr/bin/env bash
# Feudo a Feudo — compila la app de Windows: dist/Feudo a Feudo.exe
# (un único ejecutable con el juego, la música y el icono dentro).
# Requisitos: Go 1.21 o posterior y Python 3. Funciona desde Windows (Git Bash), Linux o macOS.
#   tools/build-windows.sh            → compila el .exe
#   tools/build-windows.sh --linux    → además, una versión de prueba para Linux (dist/feudo-linux)
set -euo pipefail
cd "$(dirname "$0")/.."
RAIZ=$(pwd)
VER=$(sed -n "s/.*FF.VERSION = '\([^']*\)'.*/\1/p" js/main.js | head -1)
[ -n "$VER" ] || VER=1.0

echo "== Copiando el juego (versión $VER) =="
rm -rf desktop/www
mkdir -p desktop/www/music
cp index.html desktop/www/
cp -r css js img desktop/www/
for f in music/*.mp3 music/*.ogg; do [ -e "$f" ] && cp "$f" desktop/www/music/; done
[ -e music/LEEME.txt ] && cp music/LEEME.txt desktop/www/music/
echo "   $(find desktop/www -type f | wc -l) archivos, $(ls desktop/www/music | grep -c -E '\.(mp3|ogg)$' || true) pistas de música"

echo "== Recursos de Windows (icono, manifiesto, versión) =="
python3 tools/windows/mkrsrc.py "$VER"

echo "== Compilando =="
mkdir -p dist
cd desktop
export GOTOOLCHAIN=local CGO_ENABLED=0
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-H windowsgui -s -w -X main.version=$VER" -o "$RAIZ/dist/Feudo a Feudo.exe" .
if [ "${1:-}" = "--linux" ]; then
  GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w -X main.version=$VER" -o "$RAIZ/dist/feudo-linux" .
fi
cd "$RAIZ"
python3 tools/windows/check_pe.py "dist/Feudo a Feudo.exe"
ls -la dist
