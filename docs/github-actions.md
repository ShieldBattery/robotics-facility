# GitHub Actions publication

The repository provides three workflows:

- **Validate** runs the metadata validation and publisher tests on Linux and Windows
  for pull requests, pushes to `main`, and manual dispatches.
- **Publish staging** manually publishes an approved catalog revision to the `staging`
  environment.
- **Publish production** manually promotes one immutable staging revision into the
  `production` environment.

The two publish entry points are present only as manual dispatch workflows and call
the shared publisher workflow. They must be run from the default branch (`main`) to
appear in GitHub's Actions UI. Publication is serialized for each environment, and a
new request never cancels an in-progress publication.

## Configure GitHub environments

Create `staging` and `production` GitHub environments. Configure their protection
rules independently. Set each environment's deployment branches and tags rule to allow
only `main`.
GitHub environment configuration is the credential boundary: YAML cannot protect
environment secrets if a branch changes the workflow guard. The reusable workflow
also fails explicitly when its ref is not `refs/heads/main`, but that guard is not a
substitute for the environment rule.

In each environment, create these secrets:

- `SPACES_ACCESS_KEY_ID`
- `SPACES_SECRET_ACCESS_KEY`
- `CATALOG_SIGNING_PRIVATE_KEY`: the PEM-encoded Ed25519 private key for that
  channel

Configure these environment variables:

- `SPACES_BUCKET`
- `SPACES_ENDPOINT`
- `SPACES_REGION`
- `BOT_PUBLIC_BASE_URL`
- `CATALOG_KEY_ID`
- `CATALOG_PUBLIC_KEY`: the PEM-encoded Ed25519 public key for that channel

The `production` environment also needs the staging trust variables:

- `STAGING_PUBLIC_BASE_URL`
- `STAGING_CATALOG_KEY_ID`
- `STAGING_CATALOG_PUBLIC_KEY`

The publisher fixes all object keys below `robotics-facility/`. Do not provide
prefixes through workflow inputs.

## Publication boundary

Before a publish step receives credentials, the workflow installs dependencies without
lifecycle scripts and runs `publish.ts prepare`. Preparation validates the catalog,
downloads and verifies every package archive, and for production verifies the signed,
immutable staging catalog and exact promoted bytes. It writes the verified bundle to
`.build/publication`. The following step receives upload and signing credentials, then
rechecks that local bundle before signing and publishing it.
Production reads the staging `published/<revision>.json` receipt, which staging writes
only after activating and verifying its current catalog. A revisioned
`catalogs/<revision>.json` snapshot alone is not eligible for promotion.

The workflows do not build or execute bot code. They only publish packages that already
have approved catalog records, digests, and reachable artifact URLs. The empty initial
catalog therefore cannot publish; bootstrap requires an actual approved release and
a reachable archive whose bytes and embedded descriptor match its catalog record.

See [deployment configuration](github-deployment.md) for bucket/secret settings and
the [publisher contract](publisher.md) for envelopes, limits, and recovery.

## Preparing a ZZZKBot release

1. Build pinned sources using `pnpm build:zzzkbot <new-build-name>` on Windows.
2. Produce a review ZIP with `pnpm package:zzzkbot .build/<build-name> <release-id> --review`.
   Rebuild its included source, test the executable through ShieldBattery, and record
   input hashes, notices, runtime evidence, and limitations in `docs/releases/`.
3. Complete the candidate's source/distribution reviews, then package without `--review`.
   The resulting `dist/<release-id>/catalog.json` contains the exact archive/descriptor hashes.
4. Commit the reviewed recipe, metadata, and evidence; push the branch. Create a versioned
   GitHub prerelease at that commit and upload the ZIP without replacing existing assets.
   The ZIP includes corresponding source and relinking materials; keep it available.
5. Copy the generated catalog into `catalog/catalog.json`, validate/test, and merge it to main.
6. Run **Publish staging** from main with the next revision. Verify the signed CDN catalog,
   archive hash and `published/<revision>.json` receipt before considering promotion.
7. **Publish production** independently promotes the exact successful staging revision.
   An experimental staging artifact does not establish production app readiness.

The first native binary can be built locally; publication still runs in GitHub Actions
using environment secrets. No developer Spaces credentials or hardware signing token
are needed. The build and package commands themselves never upload anything.
