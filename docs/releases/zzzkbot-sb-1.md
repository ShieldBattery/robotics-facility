# ZZZKBot sb.1 staging release review

Reviewer: Codex, 2026-09-21. Scope: local distribution of the pinned experimental
external client. This does not approve public competition, establish a human
skill rating, or certify a production installer/security sandbox.

## Inputs and build evidence

- ZZZKBot: `7183e37b6b416ea53c1040c83e639a3a3c395eed`.
- BWAPI 4.4: `7687da8abc4726f8366401f11ab648d421385793`.
- Recipe: robotics-facility `9e53ceaa09c55f00618548f1c74ab362fc091645`.
- BWAPI patch SHA-256: `e35d406e61cef1c5ff28b2bd3202f3f41a1091c83d4b8dcc82236d946cc01ec0`.
- ZZZKBot patch SHA-256: `2802cc9b666a95a5dbd6314f0c123bf5614da93d33a8dbe6bed05e46bce8e9f6`.
- Executable SHA-256: `1554f2cebf3d6a0030952b39a2484fdb361d67c1ea4a2422a7fc271572910343` (1,367,040 bytes).
- MSVC 19.43.34810.0, Windows SDK 10.0.26100.0, CMake 3.31.0,
  VS 2022 Win32 Release, static CRT. Exact prepared trees and recipe hash are
  included in the archive's `source/build-info.json`.

The build checked upstream pins, ordered patch hashes, prepared index trees,
and clean working trees before and after compilation. The reviewer compared the
explicit source list against the pinned library sources and corrected one missing
translation unit before the build. `dumpbin /dependents` lists only KERNEL32.dll;
there is no VC redistributable DLL prerequisite.

The review ZIP was extracted into `.build/zzzkbot-package-review`, and its included
`source/native` recipe successfully rebuilt with only the packaged source and
installed compiler/SDK/CMake. No upstream checkout, Git, Node, network source
fetch, or prebuilt upstream library was used in this rebuild. The rebuilt binary
has a different hash because native builds can encode build paths; byte identity
across paths/toolchains is not a claim of this release.

## Source, behavior, and licensing

The source audit is in [zzzkbot-source-review.md](../zzzkbot-source-review.md).
The patch encodes unsafe filename bytes, Windows device basenames, and history
record delimiters. Safe ordinary ASCII histories keep their names. Tests exercise
separators, control bytes, percent collisions, UTF-8 bytes, and reserved names.
No intentional strategic/build-order change was made.

The reviewed reachable bot/client code uses standard relative file I/O and local
BWAPI shared-memory/named-pipe IPC. No direct network, registry, shell, updater,
or child-process launch call was found on that path. The apparent creep-data
file writes are commented out. BWAPI's RemoteProcess utility is in a static
library but has no callers on this client path. Windows creates a console host
for the console executable; it also terminated when the supervised bot exited.
Runtime TCP/UDP endpoint sampling found none owned by the tested bot. This was
source/call-site review plus process, socket, file-inventory and game-log evidence,
not a full system-call trace or proof that native code is sandboxed.

| Component | Terms | Packaged notice |
| --- | --- | --- |
| ZZZKBot, Chris Coxe | LGPL-3.0-or-later | notices/ZZZKBot-LICENSE.txt |
| BWAPI | LGPL v3 | notices/BWAPI-LICENSE.txt |
| Incorporated GPL/LGPL terms | GPL v3 + LGPL v3 | notices/GPL-3.0.txt, notices/LGPL-3.0.txt |
| smallsha1, Micael Hildenborg | BSD-3-Clause | notices/SMALLSHA1-LICENSE.txt |
| ShieldBattery external host, Travis Collins | MIT | notices/ShieldBattery-MIT.txt |
| Downstream modifications and source instructions | Component-compatible terms | notices/RELEASE.txt |

The archive includes actual patched source, both patches, upstream author/thanks
files, optional example configuration, host, CMake recipe, and build instructions.
The packaged code includes the smallsha1 BSD notice. The disabled Boost code in
BWAPILIB/Streams.cpp is not linked. No StarCraft assets/maps, third-party bot DLLs,
or learned opponent data are bundled. The static MSVC runtime is compiler-provided;
Windows/SDK/compiler system components are build prerequisites.

Chosen source-delivery method: source in the same ZIP, at no extra charge, with
instructions in the accompanying notices. For the LGPL combined work this supplies
Minimal Corresponding Source and Corresponding Application Code under LGPLv3
4(d)(0), allowing recompilation/relinking of either library. Both GPL and LGPL
texts, preserved upstream notices, changed-file notices, modification/debugging
rights, and the MIT/BSD notices accompany the binary. ZZZKBot's original license
text mentions older BWAPI versions; RELEASE.txt and package.json explicitly identify
this build's BWAPI 4.4 pin instead of altering the upstream notice.

References: [LGPLv3](https://www.gnu.org/licenses/lgpl-3.0.html), sections 2 and 4;
[GPLv3](https://www.gnu.org/licenses/gpl-3.0.html), sections 1, 5 and 6. The exact
license texts reviewed are retained in the source and notice bundle.

## Runtime evidence

- x64 local match `103efbaa-076f-49c3-a513-25357068ea1d`: packaged-input executable
  won against a passive Protoss player at frame 4219. Human game
  `64a1ada6-3a77-4c1f-8099-cb50d5c0261d`; bot game
  `3fe07c9e-61fa-4e3c-8c85-7d4b0aab4b5d`. All 18 shared sync probes through frame
  4080 matched. The bot received `onEnd(winner=true)` and wrote history.
- Adversarial names: bot `CON`, opponent `../Release:Player`; history stayed in
  the supplied profile as `ZZZKBot_v_1.7.0.0.0_Zerg_vs_..%2FRelease%3APlayer_Protoss.dat`.
  The optional config lookup used `%43ON.cfg`, not the Windows device.
- Repeated play reused that profile after an incomplete game and with an appended
  malformed history record and malformed optional configuration. The completed
  game above still built units, fought, won, and updated history.
- x86 local session `f96884a3-9050-4a9b-98d6-be5fc3857a50`: two executable copies
  extracted from the review ZIP ran in fresh, separate copies of its empty work
  baseline. Both progressed through frame 2512. All three clients' 11 shared
  sync probes through frame 2400 matched. This checks instance isolation; it
  does not certify ZZZKBot's strategic support for multiplayer formats.
- Both bot clients remained hidden, skipped HD assets/sound loading, and wrote
  only their own history in the inspected work-folder inventories. Their baseline
  contains no learned data, so recreating read/write from it resets learning.
- Killing the owned verification app ended all three SC:R clients and both bot
  processes. Normal game exit and explicit stop also cleaned up the x64 session.
- Cached maps and named-pipe local transport were used. The workstation was not
  disconnected from the network; this is not a whole-machine offline test.

The x64 player's test window initially produced audible background sound; it was
stopped, and subsequent x86 verification used zero sound/music volume. All test
clients were stopped and test-session settings restored afterward.

## Final archive

`zzzkbot-sb-1.zip`: 1,420,964 bytes, SHA-256
`d581da5fbc409bdc9d7cb7259f3ede0b62535d8bc6832c74ac3d1d62128a0ffb`.
The executable, applied source, patches, and native recipe were compared byte for
byte against the review ZIP used for source rebuilding and the x86 runtime test.
The publisher independently validates this archive and its embedded descriptor.

## Decision and limits

Source review and local distribution are approved for this **staging artifact**
with the recorded input hashes, supplied source/notices, and isolated launcher
working-directory contract. Public competition remains unreviewed. Zerg 1v1 is
the verified play profile; other game formats remain unverified. The bridge is
experimental and currently requires a ShieldBattery debug build.

The source-review document's general runtime checklist is broader than this
artifact review. Exhaustive malformed-state fuzzing, full OS file-access tracing,
hostile reparse-point/profile-import testing, and production installer/UI testing
are not claimed here. Native code runs with the user's permissions. The bot has
no cross-process file lock or bounded-history reader: the launcher must isolate
writers and keep imported/retained state under its control. Production app rollout
still needs the UI/installer owner's signature-verification and profile-boundary
checks. Catalog/archive schema checks do not substitute for those boundaries.

## Staging publication

Published staging catalog revision 1 through
[Actions run 35689104271](https://github.com/ShieldBattery/robotics-facility/actions/runs/35689104271).
The prior attempt stopped before upload because the reusable workflow received no
secrets; both caller workflows now explicitly inherit secrets. Windows and Linux
validation jobs passed, as did all 34 Node tool tests and the native persistence
regression test.

Independent readback checked the configured staging Ed25519 public key against
`catalog.json`, `catalogs/1.json`, and `published/1.json`; all three describe the
same revision. The CDN archive passed descriptor/path/CRC/SHA-256 validation and
matched the locally reviewed ZIP byte for byte.

- [Signed staging catalog](https://staging-cdn.shieldbattery.net/robotics-facility/catalog.json)
- [GitHub prerelease with binary and corresponding source](https://github.com/ShieldBattery/robotics-facility/releases/tag/zzzkbot-sb-1)

Production promotion was not run. The UI/installer must verify the signed catalog
using its separately configured trusted public key before accepting package hashes.
