#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p dist
sdk="${LIFEPILOT_MACOS_SDK:-}"
if [ -z "$sdk" ]; then
  tools_sdk="$(dirname "$(xcrun --find clang)")/../../SDKs/MacOSX.sdk"
  if [ -d "$tools_sdk" ]; then sdk="$tools_sdk"; else sdk="$(xcrun --sdk macosx --show-sdk-path)"; fi
fi
xcrun clang -isysroot "$sdk" -mmacosx-version-min=14.0 -fobjc-arc \
  -framework Foundation -framework ImageIO -framework Vision -framework CoreImage -framework CoreVideo -framework CoreGraphics \
  hub/connectors/macos/OutfitVision.m -o dist/outfit-vision
