# Maintaining source patches

Upstream checkouts in `.sources/` stay at the exact clean commits in `source-lock.json`.
Downstream fixes belong in `patches/<source-id>/<name>.patch`, with an ordered
`patches` list on that source record. Each entry has `path` and `sha256` fields.
An omitted or empty list means no patches. No bot-source patches are currently
included: the filename issues in the scoped review remain release blockers.

Use patches for needed storage, compatibility, or runtime fixes, with a short
companion note explaining the behavior, licensing/attribution implications, tests,
and upstream submission status where applicable. Keep behavior-changing strategy
patches explicit; do not advertise a modified build as identical to its rated
upstream version. Coordinate with authors and preserve modification notices.

## Preparing a tree

1. Fetch clean inputs with `pnpm sources`.
2. Create a normal Git diff against the pinned source (do not leave edits in
   `.sources/`). Save the patch under `patches/<source-id>/` and record its exact
   SHA-256. Order dependent patches deliberately. Commit patches and pins together.
3. Run, for example:

   ```powershell
   pnpm prepare-source zzzkbot .build/zzzkbot-source-1
   ```

The tool only reads local pinned sources; it does not fetch or build bots. It checks
source cleanliness, revision and origin, validates patch bytes, clones a separate
build tree, and runs `git apply --check --index` and `git apply --index` in order.
Failures do not fall back to unpatched source. Existing output directories are never
reused or overwritten. Failed outputs remain for inspection without a success marker.
Choose a new directory after a failure or inspect and remove it yourself.

On success, `.git/robotics-source.json` records the upstream pin, ordered patch paths and
hashes, and resulting Git tree ID. `HEAD` remains the upstream commit; the index and
working tree contain patches. Build consumers must use the prepared files or archive
the recorded tree ID, **not `HEAD`**. The existing ShieldBattery UAlbertaBot recipe
archives an upstream revision, so it must be adapted before consuming these patched
inputs; source preparation alone does not integrate patches into that build recipe.

Carry source patch records into the release's `sources` metadata. Keep patch files
and the preparation recipe available with required source/build materials. Review
approval is tied to the whole release: changing the base, patches, configuration,
dependencies, or build inputs requires review again. The provenance marker is build
input evidence, not a signature or a substitute for source/runtime review.

Preparation refuses output outside `.build`, linked source/output/patch directories,
invalid paths, bad hashes, and mismatched patch context. It is development tooling,
not a sandbox for running untrusted builds or protection against concurrent malicious
filesystem changes. Review build scripts before executing them.
