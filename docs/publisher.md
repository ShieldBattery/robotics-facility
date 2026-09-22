# Publisher contract

The publisher consumes prebuilt, reviewed packages; it does not build or execute bot
code. `catalog/catalog.json` is the complete desired staging catalog. Each release
must pass the schema, source-review approval, and local-distribution approval gates.
Its HTTPS artifact URL must already serve the exact reviewed ZIP. The initial empty
catalog deliberately fails publication. Synthetic packages exist only in tests.

## Two phases

`node tools/publish.mjs prepare staging --revision 1` validates the catalog and ZIPs
without upload/signing secrets. It writes a new `.build/publication/` workspace, with
`bundle.json` written last. It refuses an existing workspace. Preparation is expected
to run on a fresh Actions checkout; inspect/remove local failed workspaces explicitly.

`node tools/publish.mjs staging --revision 1` consumes that workspace, rechecks
metadata and file hashes, signs the catalog, and uploads it. Do not put untrusted
steps between preparation and publication. The workspace is trusted same-job state,
not a portable signed release bundle or an arbitrary user-supplied upload directory.

Production uses `prepare production --revision 2 --staging-revision 1`, followed by
`production --revision 2 --staging-revision 1`. Preparation reads the immutable
signed **`published/1.json` receipt** from the configured staging public base URL,
verifies staging key ID/public key/channel/revision, and downloads its digest-addressed
archives. It verifies every archive again and rewrites only delivery URLs and the
catalog revision for production. Archives and embedded package descriptors are not
rebuilt or modified. Do not use `catalogs/1.json` alone as proof of success: that
snapshot may exist after a failed activation. Production signs using its own key.

## Archive checks

Each ZIP contains root `package.json`, the launch entrypoint, required working
directory, license notice files, and all runtime assets. Descriptor bytes must match
`manifestSha256`, and the parsed descriptor must equal the catalog's package object.
The archive must match its SHA-256 and declared byte size. Every compressed entry is
read and checked for size and CRC without extracting or executing it.

Limits: 128 MiB per compressed archive, 512 MiB total compressed bytes per publication,
512 MiB expanded per archive, 10,000 entries, 1 MiB embedded descriptor, and 8 MiB
catalog/envelope inputs. Filenames currently support a conservative ASCII subset;
traversal, absolute/drive/stream paths, backslashes, Windows device names, trailing
dots/spaces, links/special files, case collisions, and file/directory collisions are
rejected. Future installer checks remain necessary; this is not an executable sandbox.

## Signed envelope

Published catalogs/receipts are JSON objects with exactly:

- `envelopeVersion`: `1`
- `payload`: canonical base64 of UTF-8 JSON bytes
- `signature`: canonical base64 of the 64-byte Ed25519 signature over those bytes

The payload has exactly `purpose` (`shieldbattery-bot-catalog`), `channel` (`staging`
or `production`), `keyId`, and `catalog`. Its canonical serialization sorts object
keys recursively, preserves array order, and uses JavaScript JSON primitive encoding,
without whitespace. This is this publisher's contract, not an assertion of RFC 8785
conformance. Verification checks the exact bytes, context, schema, and positive
revision using configured public trust; it never trusts a key embedded in a catalog.

One configured signing key is supported per environment. An existing catalog must
verify before replacement. Managed key rotation and client-side verification are
future work; do not casually replace keys and expect old catalogs to be accepted.
A mismatch between the private key and configured public key fails before upload.

## Publication and recovery

Every object is confined to `robotics-facility/`:

- `packages/<sha256>.zip`: immutable archive bytes.
- `releases/<bot-id>/<release-id>.json`: immutable package identity/digest record,
  retained even if the bot is later removed from the current catalog.
- `catalogs/<revision>.json`: immutable signed catalog snapshot.
- `catalog.json`: current signed catalog, replaced after all referenced objects have
  been uploaded and read back successfully.
- `published/<revision>.json`: immutable signed receipt written only after current
  catalog activation is read back successfully. This authorizes later promotion.

Objects use `public-read` ACL. Immutable objects have one-year cache headers; current
catalog uses a 60-second revalidation policy. Actual CDN policy/visibility must be
checked on the real bucket. No delete or bucket-wide sync operation is implemented.

Conflicting immutable objects or revisions fail before uploads. Matching existing
objects are reused; retries of the same revision and catalog are idempotent. Failed
uploads leave unreferenced immutable objects but do not activate the catalog. A
failure while writing the receipt may leave an active catalog without a promotion
receipt; retry that same revision to finish. Rollback is a new, larger revision
referencing older preserved packages, never a decrement or a changed release ID.

**Exclusive writer requirement:** all writes to this prefix must go through the
single per-environment serialized workflow. Preflight and pre-activation checks are
not atomic compare-and-swap operations; concurrent external publishers are unsupported.
Use dedicated credentials and main-only GitHub environment branch rules. Restricting
one workflow's YAML alone cannot prevent another branch from modifying that YAML.

## Current verification boundary

Offline tests exercise real ZIP construction/parsing, signatures, exact-byte promotion,
immutable identity/revision rejection, failure recovery, and activation/receipt order
with an in-memory object store. They do not establish live Spaces API/CDN behavior.
The workflows run these tests on Linux and Windows. Real delivery requires bucket
variables, access-key secrets, signing keys, and an approved release archive. Do not
dispatch a publish solely to test whether secrets exist.
