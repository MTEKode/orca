export type UpdaterPrereleaseFeedMock = {
  fetchNewerReleaseTagsWithReadiness: (...args: unknown[]) => Promise<unknown>
  fetchLatestStableReleaseTag: () => Promise<string | null>
  getReleaseDownloadUrl: (tag: string) => string
  getLatestReleaseDownloadUrl: () => string
}
