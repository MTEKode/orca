# MTEkode fork sync and releases

`.github/workflows/mtekode-upstream-sync.yml` checks `stablyai/orca/main` every five minutes. When upstream advances, it merges those commits into `MTEkode/orca/main` and dispatches `release-cut.yml` for the resulting fork commit. Merge conflicts stop the run before a release is requested. If several upstream commits arrive between checks, the build uses the newest synchronized commit.

The release build assigns a new stable patch version, publishes all desktop platforms as one release, and keeps the release draft until all required updater manifests and installers are present. The desktop build embeds `MTEkode/orca` as its stable and RC update repository. Install a MTEkode build once to switch to this update stream; an official Orca install keeps using `stablyai/orca` and cannot silently switch publishers.

## Configure signing

The workflow syncs source without signing credentials. It dispatches a release only after these repository secrets and variables exist.

Secrets:

- `MAC_CERTS`
- `MAC_CERTS_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `SIGNPATH_API_TOKEN`

Repository variables:

- `ORCA_SIGNPATH_ORGANIZATION_ID`
- `ORCA_SIGNPATH_PROJECT_SLUG`
- `ORCA_SIGNPATH_SIGNING_POLICY_SLUG`
- `ORCA_SIGNPATH_WINDOWS_INNER_ARTIFACT_CONFIGURATION`
- `ORCA_SIGNPATH_WINDOWS_INSTALLER_ARTIFACT_CONFIGURATION`
- `ORCA_WINDOWS_PUBLISHER_NAME`

Use a SignPath setup that can approve both signing requests unattended for fully automatic Windows releases. Otherwise the release waits for approval and the Windows assets must finish before the draft is published. `SLACK_WEBHOOK_URL` is optional; the workflow skips notifications when it is absent.

Enable GitHub Actions for the fork and allow its `GITHUB_TOKEN` to write repository contents and dispatch workflows. After signing is configured, run **Sync Orca upstream and release MTEkode** once with `force_release` enabled to publish the current fork state. Later upstream changes are handled by the schedule.
