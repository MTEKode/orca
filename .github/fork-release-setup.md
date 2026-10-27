# MTEkode fork sync and releases

`.github/workflows/mtekode-upstream-sync.yml` checks `stablyai/orca/main` every five minutes. When upstream advances, it merges those commits into `MTEkode/orca/main` and dispatches `mtekode-release.yml` for the resulting commit. Merge conflicts stop the run before a release is requested.

`mtekode-release.yml` picks the next stable patch version, builds Windows, macOS and Linux (x64 and arm64) without code signing, uploads everything to a draft release and publishes it when every platform finished. Run it manually with **Run workflow** to release any ref.

Builds are unsigned: macOS needs its quarantine flag removed (`xattr -cr`) and cannot self-update, and Windows shows a SmartScreen warning. Add signing later by restoring the credentials flow from `release-cut.yml`.

The sync pushes with `GITHUB_TOKEN`, which GitHub refuses to use for commits that change `.github/workflows`. If an upstream merge touches workflows, the sync fails until a PAT with the `workflow` scope replaces it.
