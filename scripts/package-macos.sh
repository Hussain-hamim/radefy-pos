#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${1:-}" != "--skip-build" ]]; then
  npx tauri build --target universal-apple-darwin --bundles app
fi
app="src-tauri/target/universal-apple-darwin/release/bundle/macos/Radefy POS.app"
[[ -d "$app" ]] || { echo "Build the universal application first." >&2; exit 1; }
mkdir -p artifacts
stage="$(mktemp -d artifacts/macos-stage.XXXXXX)"
trap 'rm -rf "$stage"' EXIT
ditto "$app" "$stage/Radefy POS.app"
ln -s /Applications "$stage/Applications"
# Explicit capacity avoids hdiutil underestimating small Tauri bundles.
hdiutil create -size 128m -fs HFS+ -volname "Radefy POS" -srcfolder "$stage" -format UDZO -ov "artifacts/Radefy-POS-0.1.0-universal-unsigned.dmg"
hdiutil verify "artifacts/Radefy-POS-0.1.0-universal-unsigned.dmg"
shasum -a 256 "artifacts/Radefy-POS-0.1.0-universal-unsigned.dmg" > artifacts/SHA256SUMS
