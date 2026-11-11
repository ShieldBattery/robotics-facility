# BananaBrain source/storage review

Current candidate: [sb.6 experimental review](releases/bananabrain-sb-6.md).
Source review is pending and local distribution is unreviewed. The historical
2026-10-26 findings below apply to their original inputs.

Initial scope: the original AIIDE 2025 source in review package `bananabrain-sb-2`,
existing native host/BWAPI client, packaged source rebuild and isolated storage
tests. This does not approve catalog admission or public competition.

## Inputs and offline rebuild

- Source import: `f66d7336ca61a0a0a1a984fad55c162d942694e4`.
- Recipe: `393f86bbe5f9d8eebf873577f894d3548bcf1b67`.
- Review ZIP SHA-256: `d2e45d778276e547814add5be873affe34839c2e6a3eeae2bdc60d9be868c87d`.
- Rebuilt executable SHA-256: `9fcf638d4603c1fc8f7323b96f8ec1005eafae1a74c748fb7b077ec6f7e9b5ee`
  (1,801,728 bytes).

Extracted only `source/` to a fresh directory. Packaged CMake sources rebuilt
BananaBrain plus BWAPI static libraries with installed VS 2022/MSVC and SDK.
No original executable/library, upstream checkout, source fetch, Git, Node or
package-manager invocation was used by the rebuild. CMake recipes contain no
download/FetchContent/ExternalProject step. Networking was not blocked at OS level;
this is an offline source/dependency rebuild, not network-isolation certification.
`dumpbin /dependents` reports only `KERNEL32.dll`. Binary hash differs from the
original build; byte-identical output across build directories is not claimed.

See [BUILD instructions](../bots/bananabrain/BUILD.md) and
[gameplay evidence](bananabrain-prototype-validation.md).

The rebuilt executable then ran through existing SB local-build/practice APIs in
an isolated profile, with original AI assets from the ZIP. Two deliberately
stopped opening tests reached frames 754 and 788, trained seven Probes, and
finished with 34/39 accepted commands respectively, zero rejected. Result and
mining files were saved. These tests do not establish full-match behavior.
TCP/UDP endpoint snapshots found none owned by the bot. A child-process snapshot
identified Windows' `C:\WINDOWS\system32\conhost.exe`; no bot helper was observed.
All owned test and timeout-harness processes exited. File inventories and endpoint
snapshots are scoped evidence, not a full filesystem/process/network syscall trace.

## Storage findings in the original package

Paths below are relative to imported `src/Source/`. The isolated MSVC harness
compiled the exact packaged method bodies with small game/model stubs. Its valid
result/mining controls passed. It did not execute the entire bot or game engine.

| Finding | Evidence | Required follow-up |
| --- | --- | --- |
| Malformed results can hang startup | `Results.cpp:33-77`: `read_file` exits only on EOF; input `,broken` followed by newline made no progress and hit the 1.5-second harness timeout | Use bounded, line-based parsing with explicit progress and numeric/field validation |
| Malformed mining data can hang startup | `Worker.cpp:2043-2076`: a `not-a-number` line repeatedly fails integer conversion; timeout reproduced | Reject malformed records and bound file/record sizes and coordinate/velocity ranges |
| Opponent names enter paths unchanged | `Results.cpp:11-15,276-283`; harness name `x\..\..\escaped` wrote outside `write/` when fixture directory `write/Results_x` existed | Encode unsafe filename bytes, preserve ordinary seed names, test collisions and Windows path semantics |
| Stale read input shadows newer output | Both loaders try `read/` before `write/`. Harness read duration 101 beat write duration 202 | Define standalone profile promotion/reset behavior; do not blindly change tournament snapshot semantics |
| Input retention is unbounded | Harness loaded 2,500 result rows. Mining loader also has no file/record bound | Set documented resource limits; do not assume `kMaxHistoricalGames=200` limits storage or preserves tournament-mode decisions |
| Writes truncate the previous state directly | `Results.cpp:257-274` and `Worker.cpp:2078-2093` open final files with `w`; write/close errors are ignored | Write validated output to a temporary file and replace atomically; preserve old state on failure |
| Configuration can change through mutable state | `Configuration.cpp:3-15` reads `read/schnail.env` and `read/Configuration.txt` after packaged config | Define supported fixed configuration and prevent learning/reset from changing it |

The filename test required a matching pre-existing subdirectory and stayed inside
its disposable fixture. It does not demonstrate that ordinary SB account names can
exploit traversal. Parser timeouts terminated only the spawned harness processes.
Crash recovery, failed-write recovery, oversized numeric fields and reparse-point
containment remain untested. Separate learning/results from configuration and
mining caches when defining reset; never remove all of `bwapi-data` indiscriminately.
Concurrent matches need isolated working copies or an exclusive profile lease in
the runner; a working directory alone is not a security sandbox.

## Reachable effects and source delivery

The bot's active storage paths are relative result/mining files plus the fixed
configuration lookups above. Debug carrier writes are commented out; mutalisk
logging is behind undefined `MUTALISK_DEBUG`. BWEM's map bitmap writer is behind
undefined `BWEM_USE_MAP_PRINTER`. No direct bot-source network, shell, updater,
registry, dynamic-loader or child-process call was found in the reviewed paths.
BWAPI uses assigned local shared memory and named-pipe IPC. Its compiled
RemoteProcess utility has no call sites in the selected client/host path.

The archive carries original BananaBrain/BWEM notices, BWAPI source and patch,
LGPL/GPL texts and native-host source/license. JPS's public-domain attribution is
preserved in `src/Source/JPS.h`. Source-only compilation demonstrated that the
included source is sufficient to rebuild/relink this tested executable. This is
not a legal approval or completion of distribution review; the original
BananaBrain license separately requires author permission for public tournaments.

Local evidence lives under ignored `.build/bananabrain-storage-review/` (source
hashes, exact-body harness, fixtures and results) and
`.build/bananabrain-offline-review/` (fresh sources, commands, logs and binary).
The initial review did not change source or profiles. Subsequent patch work is
recorded below; working BotSagi profiles and published artifacts remain unchanged.

## Storage patch verification

`patches/bananabrain/0001-isolate-storage.patch` changes only result/mining I/O
and configuration initialization. SHA-256:
`b58a69c6531dd84879422cfb239e4e2b501f51a97c0b6680f43f4f6df9cbd3cf`.
Prepared source tree: `be45a62b27309ad2f88dff5db26c311547ef871a`.
The source import and author training data stay unchanged.

Both loaders use reusable `native/storage.hpp`: 8 MiB/file, 100,000 records and
4,096 bytes/line, exact field counts and overflow-checked integers. Malformed
files are rejected as a whole without hanging. Mining values are checked against
map dimensions and bounded velocities. Output above the limits fails without
truncating prior history; records are not silently pruned to the strategy's
200-game constant. All 11 original training/mining files parsed successfully.

Unsafe opponent bytes, including percent signs, are percent-encoded; ordinary
names retain existing filenames. Names above 64 bytes are rejected. No automatic
migration from unsafe old filenames is attempted. Results retain separate author
pretraining; mutable output takes precedence over read snapshots. Rejected output
does not fall back to stale input. Reset must clear both mutable directories while
idle, preserving AI assets; runner UI/leases remain separate work.

Writes flush a unique temporary file and replace the destination atomically.
Failed replacement preserves the old file and removes the temporary file.
Directory handles prevent ancestor replacement during access; reparse paths,
Windows device filenames and hardlinked reads are rejected. Replacing a hardlink
leaves its other target unchanged. This is storage containment, not an OS sandbox.
The original shipped configuration (`tournament=true`, quiet, no forced opening)
is fixed in code; mutable configuration and `schnail.env` no longer override it.

Standalone tests compile exact patched storage methods against small model stubs.
Malformed/oversized records, integer overflow, stale inputs, CSV delimiters,
failed replacement, original seed data, root/child junctions and hardlinks passed.
Run instructions are in [BUILD.md](../bots/bananabrain/BUILD.md).

The prepared patch and BWAPI source provenance were verified before/after the
development build. Patched executable SHA-256:
`f711cab2df25d7ae54b4cf5cf72681303e44bbca629943073f43833bf8dc7eaf`
(1,796,096 bytes). Shared helper SHA-256:
`ccf62f364b39969954590a6d45e1844bb11bb7c431b7af9ca9353732ab7a2029`.
All 67 tooling tests and contributor checks passed.

Two SB x64 practice tests used Protoss on Fighting Spirit 1.4, with corrupt result
and mining inputs, invalid opening/config overrides and `schnail.env` seeded into
a fresh isolated profile. First run built 13 Probes, two Zealots, Gateway and
Cybernetics Core; stopped at frame 3,668 with 357 accepted commands, zero rejected.
Restart stopped at frame 791 with 63 accepted commands, zero rejected. The result
file hash carried across restart and grew from one row to two while corrupt read
files stayed unchanged, confirming reuse of newer output. Result/mining files
persisted and all owned processes exited. These were deliberately stopped tests,
not completed matches or reset-UI verification.

Initial uncommitted CMake development builds are recorded in
`.build/bananabrain-storage-build/development-build.json`; they are not release
build-info records and do not bypass committed-recipe gates. The original sb.2 ZIP
contains the unpatched bot. The subsequent committed sb.3 package is recorded
below; crash/disk-full and concurrent-profile tests remain before approval.

## Completed patched match

On 2026-10-26, the storage-patched executable completed SB x64 local practice on
Fighting Spirit 1.4 as Protoss against a passive Terran control. No frame limit
or scripted resignation was used. Before cleanup, SB delivered the human defeat
result and the bot logged `MatchEnd winner=true frame=3823`, then finished with
455 accepted commands and zero rejected commands.

The fresh profile saved one result row recording the same frame/win (78 bytes)
and map-specific mining data (1,247 bytes). All owned app/game/bot/console processes
exited. This verifies a completed controlled match and learning persistence, not
strength against an active human or reload of this particular match's files.
Earlier opening/restart tests separately verified reload.

The executable was rebuilt after the requested header update; its SHA-256 remains
`f711cab2df25d7ae54b4cf5cf72681303e44bbca629943073f43833bf8dc7eaf`.
Helper SHA-256 for this run:
`197f9500a231c05d21109f7aa163dc51e9b66a51c3e939503c4e7827048d337c`.
Evidence and current input hashes are retained in ignored
`.build/bananabrain-storage-build/fullmatch-validation.json`.

First launch failed before game creation because the saved map URL returned 403.
Retry reused a prior cached map, verified against its format-prefixed SHA-256 and
rechecked by SB's existing map loader. No integrity check was disabled.


## Committed review package

Recipe `4c5178c0d81a1514582f51c26c3dc600a36b83c7` passed the guarded build and
produced review-only `bananabrain-sb-3`. Its packaged source rebuilt offline;
archive integrity, original training data and storage regressions passed. The
extracted package completed a passive-control match and a saved-state restart.
See [sb.3 release review](releases/bananabrain-sb-3.md) for exact hashes, command
counts, test scope and remaining checks. Source/distribution approval stays
pending; this records local verification, not catalog publication.
