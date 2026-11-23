#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p dist
sdk="${LIFEPILOT_MACOS_SDK:-}"
if [ -z "$sdk" ]; then
  tools_sdk="$(dirname "$(xcrun --find swiftc)")/../../SDKs/MacOSX.sdk"
  if [ -d "$tools_sdk" ]; then sdk="$tools_sdk"; else sdk="$(xcrun --sdk macosx --show-sdk-path)"; fi
fi
xcrun swiftc -sdk "$sdk" -module-cache-path dist/swift-module-cache -parse-as-library \
  -target "$(uname -m)-apple-macos26.0" hub/connectors/macos/LocalDictation.swift -o dist/local-dictation
