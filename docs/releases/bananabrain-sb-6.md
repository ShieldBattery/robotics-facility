# BananaBrain sb.6 experimental review candidate

Local review: 2026-10-27. Source review remains pending, local distribution
unreviewed and compatibility unverified. Assigned Protoss local 1v1 remains
experimental. No production approval, catalog admission or publication is granted.
Historical [sb.5 evidence](bananabrain-sb-5.md) describes its original inputs;
it does not establish compatibility or approval for this changed executable.

## Provenance and inventory

Recipe and imported-source repository now use
`https://github.com/ShieldBattery/robotics-facility.git`. Source remains exact
commit `f66d7336ca61a0a0a1a984fad55c162d942694e4`, imported tree
`7fda30c18b1dc20a2e4d0a6b39d3e2efc9ab8060`. The shared native packager no longer
accepts the BananaBrain-specific recipe repository override.

Upstream does not yet host `source/bananabrain-aiide2025`. Local validation used
a fresh pristine clone of the preserved exact source cache, with its origin set
to the declared repository. Fetch/preparation and committed-provenance guards
remain enabled. This proves local input integrity, not upstream-only fetchability.
Maintainer hosting of the exact import and recipe commits is required before
admission. Nothing was pushed during this review.

The archive includes original lowercase `readme.txt`, required by the inventory.
It excludes `src/.DS_Store`, `src/BWEM/.DS_Store` and
`src/Source/.DS_Store`. The source pin remains unchanged; all 12 original AI
configuration/training files are byte-identical. Seven license/disclosure notices
are retained, including the original public-tournament permission condition.

## Human-opponent configuration

Fixed configuration sets `human_opponent_ = true` alongside existing
`tournament_ = true`; drawing stays disabled. This selects the original
human-opponent UCB1 opening policy and original `glhf`/`gg` chat. The policy first
tries unplayed strategies, then uses saved results and exploration; no opening
algorithm or author training data is replaced. Existing bounded storage and
read/write precedence remain unchanged. No new network, helper-process or mutable
configuration path is introduced by this configuration change.

Storage patch SHA-256:
`128a29f6fccda57ebaf9d3d8e0d9c6eb73365f74c31b7c702c38a35afd820cae`.

## Exact artifact and local checks

Fresh guarded Win32 Release build and review-only package use committed recipe
`4db55bff4aa33b5d1726d68a56db48ff6422beca`, recipe digest
`3d97a6c33c47d08bed9e39707b6ee3894e5457bba22e6546a5ed68e55fc2eaf3`.
Toolchain: Node 24.22.1, pnpm 11.18.0, VS 2022, MSVC 19.35.32215.0,
Windows SDK 10.0.22000.0, CMake 3.25.1. BWAPI remains
`7687da8abc4726f8366401f11ab648d421385793` with its locked discovery patch.
Prepared source trees and toolchain details accompany the packaged build record.

Review ZIP: 3,309,477 bytes, 304 entries, SHA-256
`e19593287f154f2ba5447ed992a2d55904e53837a99a21352dbd643b37eed358`.
Manifest SHA-256:
`2b6affc61bf72577cedd6ad9bf778bf22301231bebfdfe3c5d585a6d9dfc10e1`.
Executable SHA-256:
`bc5190ffc62c889e80e970a5fff1910b6ebc3da7c855006a682fe84ad571f795`.

Passed frozen install with scripts disabled, metadata checks, TypeScript checks,
lint/format, validation and all 67 tooling tests. Maintained archive verifier
confirmed ZIP size/hash and embedded descriptor agreement; committed recipe guard
confirmed all 29 recipe archive members. No production approval is present.

Extracted packaged source rebuilt without fetching sources or dependencies and
without existing bot binaries/libraries. Network was not blocked at OS level.
Rebuilt executable SHA-256:
`530cf81f2e4f3e05aa8a0129f5216c56b53122bfa2393ffd8f1c21fdcdcd89af`.
Byte-identical native builds across directories are not claimed.

Packaged storage/policy harnesses passed save/reload, malformed/stale input,
filename encoding, junction/hardlink rejection and all 11 training/mining checks.
The actual picker and persistence methods processed 12 synthetic winning rows
across three original named openings: all were tried before repetition, four
results per opening survived reload. These fixtures are unit-test input, not
recorded games, and never entered the live-game profile.

Packaged fault harness passed injected disk-full write/flush, short write,
replacement denial, child termination before/after atomic replacement and two
isolated writers saving 100 times each. Physical disk exhaustion and shared-profile
writers are untested. Original result files and earlier archives were preserved.

## Bounded live smoke

Exact extracted review executable ran through isolated Electron 44.9.3 local-build
flow, app source `04dc6ee699b4cfbf91dc66a1d0b61d84ccfc2c89`, x64 StarCraft,
assigned Protoss versus passive controlled Terran on Fighting Spirit 1.4. No account
or public lobby was used. Map hash:
`a55209a4ea0d368056b8e5c1be94092254610e744ad2186685c0387f8c08c4b9`.
Observed loaded bridge SHA-256:
`795bae04ef408bab42b6dc02f94aac6872ac0d75d4b77ef2e8b57d0ed7ad1a6d`,
from integration source `07595bd56318a5ad4272004c4e3cffac2bd13722`.
Current app settings use `alwaysStartSd=true` and `hdGraphicsOn=false`.

Both games reached an actual frame-720 snapshot with eight owned units, then were
stopped deliberately. End callbacks reported losses at frames 759 and 767;
corresponding saved rows matched winner/frame exactly. Same isolated bot profile
retained one then two real rows and selected `PvT_28nexus`, then `PvT_dtdrop`.
Actual persistence across launches and distinct openings were observed; the
compiled source harness separately verifies policy reload and repeated-win
exploration. No saved rows were fabricated or copied from synthetic tests.

This is bounded launch/economy/persistence smoke, not a naturally completed match,
human difficulty calibration or full gameplay review. Command rejections were not
classified by the bounded native-host log. Signed catalog installation was not
attempted. Pending review and compatibility status remain conservative. Test-owned
Electron/game processes were stopped; installed game and pinned bot bundles were
not changed. Full structured evidence: [validation record](bananabrain-sb-6-validation.json).

## Admission and profile-copy follow-up

The active catalog no longer includes the earlier sb.5 proposal. It now matches
upstream main exactly; sb.5 records stay historical and sb.6 stays review-only.
This avoids advertising the old runtime or adding a download dependency before
current-package review, source hosting and exact artifact hosting are resolved.
No production approval is requested.

The inspected ShieldBattery profile seeder uses `fs.cp` for the entire launch
working tree, including `bwapi-data/AI`; it does not hardlink package assets.
A Windows check invoked the actual `ensureWorkingCopy` function from app source
`04dc6ee699b4cfbf91dc66a1d0b61d84ccfc2c89` on the extracted sb.6 baseline.
All 12 original AI files matched their package bytes, source and destination
reported link count one, and each copy had a distinct file ID. This is a focused
profile-seeding check, not signed-catalog installation or new gameplay evidence.

No recorded author confirmation establishes AIIDE 2025 as the recommended build
for human practice. Author recommendation and initial production-roster priority
remain open; this experimental integration does not settle either.

## Later installed-runtime validation

[Local verification on 2026-10-28](bananabrain-sb-6-runtime-validation-20261028.md)
adds two natural passive-control wins, one separately classified human concession,
real saved-history reload, signed development-catalog installation and actual
active/idle/offline reset. The exact ZIP remains unchanged. One command rejection
remains unclassified; source hosting and admission/production decisions remain open.
