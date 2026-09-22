# GitHub deployment configuration

Repository: [ShieldBattery/robotics-facility](https://github.com/ShieldBattery/robotics-facility).
The separate manual publishing workflows and publisher CLI are implemented. This
reference describes their configuration; no catalog or package has been uploaded.

## Environments and credentials

Create GitHub environments named `staging` and `production`. Each owns the same
secret names with different values:

| Environment secret         | Purpose                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `SPACES_ACCESS_KEY_ID`     | New publishing access-key ID for that environment's existing ShieldBattery bucket. |
| `SPACES_SECRET_ACCESS_KEY` | Matching secret access key.                                                        |

Travis will create these keys. Enter their values directly in GitHub environment
secrets; do not put them in source files, issues, logs, or local checked-in config.
Use credentials dedicated to bot publication, with only the available permissions
needed for that environment's publishing operations. Do not assume the provider
supports a particular prefix-level credential restriction; the publisher itself
must constrain every object key to the dedicated prefix.

The publish job references `environment: staging` or `environment: production` and
reads `secrets.SPACES_ACCESS_KEY_ID` and `secrets.SPACES_SECRET_ACCESS_KEY`. If using
an AWS-compatible CLI, map them to `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
only on the upload step. Do not expose them to upstream bot compilation, package
inspection, tests, or pull-request jobs. Reusable workflow jobs must select their
GitHub environment themselves; callers must not broadly inherit unrelated secrets.
No developer needs these keys to download bots or build local candidates.

## Non-secret environment variables

| GitHub environment variable | Value                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPACES_BUCKET`             | Existing ShieldBattery bucket name for this environment; use the real deployment value.                                                            |
| `SPACES_ENDPOINT`           | Existing bucket's HTTPS S3 API endpoint, not its CDN hostname.                                                                                     |
| `SPACES_REGION`             | Region required by the configured S3-compatible client for that endpoint.                                                                          |
| `BOT_PUBLIC_BASE_URL`       | Staging: `https://staging-cdn.shieldbattery.net/robotics-facility/`; production: `https://cdn.shieldbattery.net/robotics-facility/`. |

Use the fixed object prefix `robotics-facility/` in both buckets. Publishing
must reject keys outside it, never synchronize/delete the bucket root, and never
alter unrelated ShieldBattery objects. The public URL already includes the prefix:
append relative artifact keys exactly once. For example:

```text
robotics-facility/catalog.json
robotics-facility/catalogs/<revision>.json
robotics-facility/packages/<sha256>.zip
```

Package archives and revisioned catalog snapshots are immutable; `catalog.json`
is the environment's current signed catalog. Successful publication also writes `published/<revision>.json`, a signed promotion
receipt, only after current-catalog activation is verified. See the
[publisher contract](publisher.md) for the exact signed envelope and bounds.
Public access must be established using the bucket's existing access conventions;
a prefix by itself does not grant anonymous reads. A missing catalog during initial
setup is expected and should not break already-installed offline bots.

Also set `CATALOG_KEY_ID` and `CATALOG_PUBLIC_KEY` (PEM Ed25519) as environment
variables. Production needs `STAGING_PUBLIC_BASE_URL`, `STAGING_CATALOG_KEY_ID`, and
`STAGING_CATALOG_PUBLIC_KEY` to verify the successful staging publication receipt.
The signing private key must match the configured public key before any upload.

## Publication behavior

Two manual actions, **Publish staging** and **Publish production**, share publisher
code but bind to different environments. Staging publishes a reviewed bundle;
production promotes its exact verified package bytes. Serialize publication per
environment, verify artifacts first, and update the catalog last. Keep production
ref/deployment protections distinct from staging. No workflow is dispatched merely
because these credentials are configured.

Spaces access keys authorize uploads; they are not catalog signing keys. Configure
separate signing identities/verification trust for the two channels. Do not substitute upload credentials for catalog signatures.
See [catalog and offline behavior](catalog-and-offline.md) for promotion, cache,
rollback, signing, and installed-state requirements.

Restrict both GitHub environments to deployments from branch `main` only; workflow
checks alone cannot protect against a modified workflow on another branch. All
bucket writers for this prefix must use these serialized workflows. External/manual
concurrent uploads are unsupported: S3 read-then-write checks are not an atomic
compare-and-swap, and this implementation does not assume Spaces supports conditional
PUTs. Never share these prefix-publishing credentials with another concurrent writer.
