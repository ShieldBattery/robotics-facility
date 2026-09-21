# Catalog and offline bot packages

Status: proposed contract with validated seed metadata. The app behavior and package
publisher described here are not yet implemented. Version 1 is provisional until
an installer and a real redistributable package exercise it together.

## Three different records

1. **Bot identity:** stable ID, display name, author/contributors, homepage/source,
   description, and play-style tags. External ratings carry provider, entry name,
   observed date, and rated version when known. An unknown rated version stays null.
   Human skill remains uncalibrated; bot Elo is not converted into human MMR.
2. **Immutable package release:** bot ID, release ID, display version, exact source
   pins and build recipe, runtime/architecture, launch paths/argument array, tested
   races/formats (verified, experimental, unverified, or incompatible), learning directories, license notices, and permission evidence.
   Release IDs are unique per bot; never replace bytes at an existing release URL.
3. **Local installed record:** package identity and digest, installation path/time,
   selected release, runtime selection/readiness, installation validation state,
   plus user settings and learning-state locations. This record belongs to the app,
   not the remote catalog, and contains a retained package descriptor.

The catalog groups identities and downloadable releases. A bot candidate with no
approved artifact stays in `bots/`, outside `catalog/catalog.json`. Candidate
metadata is not an installable package. Local distribution approval and public
competition eligibility are independent; an approved local package can remain
unreviewed or disallowed for online competition.

## Source strategy

Use independent, ignored Git checkouts at full commit IDs, fetched from a small
reviewed lockfile. This keeps upstream history out of the packaging repository,
shares BWAPI across bots, and leaves source retrieval independent of Git submodule
state. Keep any future patches as explicit reviewed files and record their digests
in build provenance. A source pin change is a code change, not an automatic sync.

`source-lock.json` supplies the current candidate build inputs. Released package
manifests retain their own source pins and build-recipe revision; they deliberately
do not have to equal the current development lockfile. This permits old releases to
remain installable after a candidate update. A publisher must derive release pins
from the actual verified build and preserve its evidence. Metadata validation checks
structure and internal consistency, not whether a human actually reviewed a grant,
whether an artifact was built from those pins, or whether a bot's capabilities are
true. Source URL validation includes semantic checks beyond the JSON Schema pattern.

A build must pin the packaging recipe, dependencies, compiler/runtime inputs, and
assets as well as bot source. Never infer redistribution permission from having
successfully downloaded or built a bot. Preserve notices and produce the required
corresponding source/build materials with a distributed package. Author permission
records need the scope, applicable versions, and durable evidence; private contact
details or correspondence need not be published in the public manifest.

## Refresh without blocking offline play

Open the bot picker using the last valid cached catalog and installed inventory
immediately. When online, refresh asynchronously on opening if stale (proposed
initial interval: six hours), and provide manual refresh. Coalesce concurrent
requests; use bounded timeouts, conditional requests when supported, and backoff.
Do not continuously poll while the picker is closed. Initial downloads and updates
require connectivity, but selecting and launching an installed release does not.

A failed refresh, malformed document, unsupported schema version, or failed
signature check leaves the last valid catalog untouched. First use while offline
still lists installed and bring-your-own bots; an empty cache only prevents browsing
uninstalled catalog entries. An expired freshness timer never makes installed bots
unlaunchable. Local maps, SC:R, and any required runtimes must also be installed.

Do not make the current catalog a launch authority. Removal from the catalog hides
new downloads; it does not silently uninstall a local package or delete learning
files. Known severe problems can be displayed from cached advisory metadata when
available. An offline client cannot promise immediate remote revocation enforcement.
Online ladder admission has separate server-enforced policies.

## Install, update, and remove

The installed inventory owns states such as downloading, verifying, installed,
failed, and missing runtime. Availability of an update is separate from whether
the selected installed release is playable. Keep concurrent versions when needed;
never silently switch the bot used by a saved setup, replay, or active match.

Download to a temporary file with an expected size and SHA-256. Verify the trusted
catalog and artifact, then extract into a staging directory with file-count and
expanded-size bounds. Reject traversal, absolute paths, symlinks/reparse points,
Windows device names, alternate streams, case collisions, and overlapping writable
paths. JSON Schema is only structural validation, not a secure archive extractor.

The archive contains its package descriptor and notices. Verify the descriptor's
byte hash against `manifestSha256` and that its parsed contents match the catalog's
package descriptor. Validate executable/assets/runtime availability, then atomically
promote the package and commit the installed record. Interrupted work must leave
previous installations usable. Serialize installation/removal of the same release;
hold a usage lease while a match runs. Package directories remain immutable.

Create separate per-match working copies/overlays for bots that require writable
relative paths. Store learning separately per bot/release/profile, then define
explicit read/write promotion between games. Never let simultaneous instances share
an unsynchronized learning directory. Updating binaries must not overwrite learned
state; resetting learning and removing a package are separate actions.

Bring-your-own bots use the same local descriptor/capability checks but retain a
clear local provenance marker. They do not need a catalog entry, upload, or catalog
signing identity. Arbitrary native AIModule DLL loading is not supplied by the
existing source-built external-client recipes.

## Hosting and publication

Prefer DigitalOcean Spaces as the canonical delivery location for the small catalog
and immutable package archives; GitHub releases can be a mirror or a build artifact
source. The client uses HTTPS artifact URLs and hashes, not a dependency on GitHub's
release API or a particular storage provider. No bucket or repository publication
is needed to validate local metadata, source retrieval, or builds.

Publish complete immutable artifacts first and the new catalog last. Give artifacts
long cache lifetimes and the mutable catalog a short lifetime or explicit
revalidation. DigitalOcean supports per-file cache TTLs and cache purges; publication
must account for edge caching rather than assuming an overwritten catalog is visible
immediately. [Spaces CDN cache documentation](https://docs.digitalocean.com/products/spaces/how-to/manage-cdn-cache/).

Before public delivery, define and implement a signed catalog envelope, pinned
verification keys and key rotation, bounded schema parsing, and catalog revision
rollback handling. The checked-in JSON is the unsigned payload, not that envelope.
Artifact hashes provide integrity relative to the catalog, not publisher identity.
Do not put signing keys, upload credentials, or machine-specific paths in the repo.

## Next checkpoints

1. Exercise the existing native build recipes using `.sources/` and move the recipes
   and host into this repository with provenance and applicable notices.
2. Inventory runtime/assets/learning paths and prepare the first license-complete
   package plus matching immutable descriptor. Test both supported SC:R architectures.
3. Implement catalog verification/cache and installed inventory in ShieldBattery,
   with restart-while-offline, failed refresh, interrupted install, concurrent launch,
   and update/removal tests.
4. Connect installed packages to the managed local match runner. Offline readiness
   requires both package installation and the socket-free local game launch path.
5. Add a publisher/signing workflow and choose the real delivery endpoints when
   the first release is ready. Keep author outreach and local/ladder eligibility
   records separate throughout.
