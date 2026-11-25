#!/bin/sh
# Entwicklungshilfe: beobachtet den Quellcode, baut die Oberfläche neu,
# startet das Testprofil (Port 45138) neu und lädt den Safari-Tab neu.
# Nutzt nur das Testprofil. user-data des Hauptprofils bleibt unberührt.
set -eu
root="$(CDPATH='' cd -- "$(/usr/bin/dirname -- "$0")/.." && pwd)"
cd "$root"
# Der Server akzeptiert nur den Host 127.0.0.1:45138 (Schutz vor DNS-Rebinding),
# localhost:45138 liefert 403. Alte localhost-Tabs werden umgeleitet.
url="http://127.0.0.1:45138"
legacy="http://localhost:45138"
stamp="$(mktemp)"
trap 'rm -f "$stamp"; ./bin/lifepilot --acceptance stop >/dev/null 2>&1 || true' EXIT INT TERM

[ -d node_modules ] || npm ci

open_safari() {
  /usr/bin/osascript <<OSA >/dev/null 2>&1 || /usr/bin/open -a Safari "$url"
tell application "Safari"
  activate
  set found to false
  repeat with w in windows
    repeat with t in tabs of w
      set u to URL of t
      if u is not missing value and (u starts with "$url" or u starts with "$legacy") then
        set URL of t to "$url"
        set current tab of w to t
        set found to true
        exit repeat
      end if
    end repeat
    if found then exit repeat
  end repeat
  if not found then
    if (count of windows) = 0 then make new document
    set current tab of front window to (make new tab at end of tabs of front window with properties {URL:"$url"})
  end if
end tell
OSA
}

rebuild() {
  echo "[dev-safari] Prüfe Typen und baue Oberfläche …"
  if npx tsc --noEmit && npx esbuild hub/ui/app.tsx --bundle --minify --outfile=dist/app.js; then
    ./bin/lifepilot --acceptance stop >/dev/null 2>&1 || true
    ./bin/lifepilot --acceptance start
    sleep 2
    open_safari
    echo "[dev-safari] Aktuell: $url"
  else
    echo "[dev-safari] Build fehlgeschlagen, Safari bleibt auf dem letzten Stand." >&2
  fi
}

rebuild
touch "$stamp"
while sleep 2; do
  changed="$(find hub agents package.json -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.json' -o -name '*.md' \) -newer "$stamp" 2>/dev/null | head -1)"
  if [ -n "$changed" ]; then
    touch "$stamp"
    echo "[dev-safari] Änderung: $changed"
    rebuild
  fi
done
