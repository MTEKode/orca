import { MAIN_RELEASE_REPO } from '../shared/release-channel'

export const RELEASES_PAGE_BASE = `https://github.com/${MAIN_RELEASE_REPO}/releases`
export const ATOM_FEED_URL = `${RELEASES_PAGE_BASE}.atom`
export const RELEASES_DOWNLOAD_BASE = `${RELEASES_PAGE_BASE}/download`

export function getReleaseDownloadUrl(tag: string): string {
  return `${RELEASES_DOWNLOAD_BASE}/${encodeURIComponent(tag)}`
}

export function getLatestReleaseDownloadUrl(): string {
  return `${RELEASES_PAGE_BASE}/latest/download`
}

export function getReleaseManifestUrl(tag: string, manifestName: string): string {
  return `${getReleaseDownloadUrl(tag)}/${manifestName}`
}

export function getReleaseAssetUrl(tag: string, assetName: string): string {
  return `${getReleaseDownloadUrl(tag)}/${encodeURIComponent(assetName)}`
}
