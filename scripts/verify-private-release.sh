#!/bin/sh
# Install an independently reviewed copy in the administrator-owned trust directory.
set -eu
PATH=/usr/bin:/bin
export PATH
umask 077

[ "$#" -eq 2 ] || [ "$#" -eq 3 ] || exit 2
if [ "$#" -eq 3 ] && [ "$3" != '--require-admin-owned' ]; then exit 2; fi
cd "$1"
key=$2
if [ "$#" -eq 3 ]; then
  parent=$(pwd -P)
  while [ "$parent" != / ]; do
    [ -z "$(find "$parent" -prune \( ! -user root -o -perm -020 -o -perm -002 \) -print)" ] || exit 1
    parent=$(dirname "$parent")
  done
  [ -f "$key" ] && [ ! -L "$key" ] || exit 1
fi
manifest=PRIVATE_RELEASE.sha256
signature=PRIVATE_RELEASE.sig
[ -f "$manifest" ] && [ ! -L "$manifest" ] && [ -f "$signature" ] && [ ! -L "$signature" ] || exit 1
[ "$(wc -c < "$manifest")" -le 4000000 ] && [ "$(wc -c < "$signature")" -le 8192 ] || exit 1
openssl dgst -sha256 -verify "$key" -signature "$signature" "$manifest" >/dev/null 2>&1 || exit 1

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
# Sign every release file. Only mutable app data and detached signature files are outside the inventory.
find . \( -path './user-data' -o -path './PRIVATE_RELEASE.sha256' -o -path './PRIVATE_RELEASE.sig' \) -prune -o \
  \( ! -type d ! -type f -print \) > "$scratch/other"
[ ! -s "$scratch/other" ] || exit 1
if [ "$#" -eq 3 ]; then
  find . \( -path './user-data' \) -prune -o \( ! -user root -o -perm -020 -o -perm -002 \) -print > "$scratch/permissions"
  [ ! -s "$scratch/permissions" ] || exit 1
fi
find . \( -path './user-data' -o -path './PRIVATE_RELEASE.sha256' -o -path './PRIVATE_RELEASE.sig' \) -prune -o \
  -type f -print > "$scratch/files"
LC_ALL=C sort "$scratch/files" -o "$scratch/files"

awk '
  length($1) != 64 || $1 ~ /[^0-9a-f]/ || substr($0,65,2) != "  " { exit 1 }
  {
    path=substr($0,67)
    if (path !~ /^\.\/[A-Za-z0-9_@.+\/-]+$/ || substr(path,3) ~ /(^|\/)\.\.?($|\/)/ ||
        path ~ /\/\// || seen[path]++) exit 1
    print path
  }
  END { if (NR == 0) exit 1 }
' "$manifest" > "$scratch/list"
LC_ALL=C sort "$scratch/list" -o "$scratch/list"
cmp -s "$scratch/list" "$scratch/files" || exit 1
for file in .runtime/bin/node bin/lifepilot hub/adapters/cli.ts hub/runtime/server.ts dist/app.js \
  dist/application-ocr dist/local-dictation dist/outfit-vision package-lock.json; do
  [ -f "$file" ] || exit 1
done
shasum -a 256 -c "$manifest" >/dev/null 2>&1
