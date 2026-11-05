#!/usr/bin/env bash
# Build the macOS arm64 release on this machine and upload it to the MTEkode draft release.
# Why: GitHub's hosted macOS arm64 runners can sit unacquired for hours; Windows still builds in CI
# (run the "MTEkode unsigned release" workflow with platforms=windows).
# Usage: config/scripts/mtekode-release-local-mac.sh v1.4.219   (an existing draft release tag)
set -euo pipefail
cd "$(dirname "$0")/../.."

tag="${1:?usage: $0 vX.Y.Z}"
version="${tag#v}"
repo="${ORCA_RELEASE_REPOSITORY:-MTEKode/orca}"
export ORCA_RELEASE_REPOSITORY="$repo"
export GH_TOKEN="${GH_TOKEN:-$(gh auth token)}"

gh release view "$tag" --repo "$repo" >/dev/null
trap 'git checkout -q -- package.json' EXIT
npm pkg set version="$version"

[ -d mobile/node_modules ] || (cd mobile && pnpm install --frozen-lockfile)
NODE_OPTIONS=--max-old-space-size=4096 ORCA_BUILD_IDENTITY=stable pnpm run build:release
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON config/scripts/orcad-distribution/prebuilds/pinned-node-downloads.mjs darwin-arm64
node config/scripts/native-build/node-addons/ensure-native-runtime.mjs --runtime=electron
pnpm exec electron-builder --config config/electron-builder.config.cjs --mac dmg zip --arm64 \
  -c.mac.identity=- --publish always -c.publish.releaseType=draft

# Publish once both platforms are on the release; otherwise leave it draft for the Windows job.
if gh release view "$tag" --repo "$repo" --json assets -q '.assets[].name' | grep -q '\.exe$'; then
  gh release edit "$tag" --draft=false --latest --repo "$repo"
  echo "Published $tag"
else
  echo "$tag stays draft: no Windows installer yet"
fi
