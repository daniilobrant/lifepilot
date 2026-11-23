#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
bundle=dist/LifePilotCalendar.app
mkdir -p "$bundle/Contents/MacOS"
cp hub/connectors/macos/CalendarBridge.plist "$bundle/Contents/Info.plist"
sdk="${LIFEPILOT_MACOS_SDK:-}"
if [ -z "$sdk" ]; then
  tools_sdk="$(dirname "$(xcrun --find clang)")/../../SDKs/MacOSX.sdk"
  if [ -d "$tools_sdk" ]; then sdk="$tools_sdk"; else sdk="$(xcrun --sdk macosx --show-sdk-path)"; fi
fi
xcrun clang -isysroot "$sdk" -mmacosx-version-min=14.0 -fobjc-arc -fblocks -framework Foundation -framework EventKit \
  hub/connectors/macos/CalendarBridge.m -o "$bundle/Contents/MacOS/LifePilotCalendar"
/usr/bin/codesign --force --sign - "$bundle"
"$bundle/Contents/MacOS/LifePilotCalendar" --self-test
