# BananaBrain sb.3 review package (superseded)

Historical review evidence for sb.3. See the pending [sb.6 review](bananabrain-sb-6.md)
for the current candidate.

Recipe: `4c5178c0d81a1514582f51c26c3dc600a36b83c7`. Review-only; source/distribution approval remains
pending. No catalog publication is included.

## Build and package

- Source import: `f66d7336ca61a0a0a1a984fad55c162d942694e4`.
- Storage patch SHA-256: `b58a69c6531dd84879422cfb239e4e2b501f51a97c0b6680f43f4f6df9cbd3cf`.
- Guarded Win32 Release/static-CRT build used the existing native host and source-built BWAPI.
- Executable SHA-256: `f3bdabade636484be2c4aa500a4de2ccb81939792d56797c4e3dd1db20527724`.
- Archive: `bananabrain-sb-3.zip`, 3,292,793 bytes, 296 entries.
- Archive SHA-256: `76bd6e2ba3c96f0078504262b12038aefc67f551911976e0c2fe759790130ea5`.
- All 12 original runtime AI text files match the pinned author data.
- Shared helper and source patch match the committed inputs. Archive verification
  passed. Normal packaging and catalog validation reject pending approval.
- Contributor checks and all 67 tooling tests passed. Storage regressions passed
  against source extracted from this archive, including all 11 training/mining
  files, malformed/oversized data, failed replacement, junctions and hardlinks.

## Offline rebuild

Extracted only `source/` to a fresh directory and rebuilt with installed CMake,
MSVC and Windows SDK. No existing bot executable/library, upstream checkout,
source fetch, Git or package-manager invocation was used by the rebuild. Network
was not blocked at OS level. Rebuilt binary SHA-256:
`23c63d21b0de4d7c2a13fa948acdac738f5e7412b8144d567e5c81f2f7ac8660` (1,796,096 bytes).
`dumpbin /dependents` reports only `KERNEL32.dll`. Byte-identical native builds
across different directories are not claimed.

## Runtime evidence

Tested the extracted ZIP through SB's existing local-build/practice flow on
Windows, with Win32 BananaBrain and x64 StarCraft, Fighting Spirit 1.4, using
SB `ff167db43053cead7a991a68c224c8d6bf61066d` (gathered-resource fix).
Original archive AI files seeded an isolated working profile.

| Run | Result | Saved state |
| --- | --- | --- |
| Full match vs passive Terran | Bot win at frame 6,327; 1,841 accepted commands, one rejected | One result row (79 bytes) and mining data (3,051 bytes) |
| Same-package restart | Deliberately stopped at frame 779; 54 accepted commands, zero rejected | Result file grew from one row to two |

The full-match end callback was observed before cleanup; no frame stop or scripted
resignation ended that match. The single rejected command's reason was not
captured. This is completion evidence against a passive control, not a strength
measurement or active-human match.

Before restart, malformed result/mining files were added only to the test
profile's read directory. The saved result hash carried across restart, its row
count increased, and corrupt read inputs stayed unchanged: newer write output was
reused. No temporary save files remained. All owned app/game/bot/console processes
exited. Endpoint snapshots found no bot-owned TCP/UDP endpoints; the observed
child was Windows conhost. These are scoped inventories/snapshots, not a full
system-call trace. No signed-catalog installation or reset UI was tested.

Local evidence is retained under ignored `.build/bananabrain-sb3-review/` and
`.build/bananabrain-sb3-offline/`; raw runtime profiles remain private.

## Remaining review

Crash/disk-full recovery, concurrent-profile handling, broader gameplay and
additional race/game-architecture combinations remain unverified. Snapshot/reset
UI is outside this bot recipe. Reviewed local distribution and public tournament
permission remain separate requirements; neither is approved by this report.
See [source/storage review](../bananabrain-source-review.md) for detailed scope.
