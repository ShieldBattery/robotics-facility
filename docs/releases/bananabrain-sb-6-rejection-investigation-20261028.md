# BananaBrain sb.6 command-rejection investigation

Local investigation, 2026-10-28. BananaBrain remains experimental; production
approval deferred. This supplements [installed-runtime validation](bananabrain-sb-6-runtime-validation-20261028.md).
No push, review comment, merge or publication forms part of this investigation.

## Finding and historical limit

Two fresh captures reproduced safe rejection of expired native unit IDs: one
attack targeted an expired enemy ID; one move referenced an expired owned actor.
Both bots continued issuing accepted commands afterward. No gameplay or encoder
defect was demonstrated, so no bot change or acceptance-rule change is warranted
by these captures. Existing lifetime checks and rejection counts remain intact.

The original natural-match rejection first appeared in the frame-12,240 counter
snapshot. Its packet and rejection branch were not logged. These new captures
explain a valid stale-reference mechanism; they cannot prove which command or
branch caused that historical event. Its original count and classification remain
unchanged. Do not report complete command conformance or zero rejections.

## Instrumentation and exact inputs

Local ShieldBattery diagnostic commit `b80edf953fcccb5c033c72b0f1c0b312ef62ba10`
uses the exact previously tested integration base
`07595bd56318a5ad4272004c4e3cffac2bd13722`. Logging is debug-build only,
requires `SB_BWAPI_REJECTION_DIAGNOSTICS`, and stops after the first 64 rejections
per bridge. It records rejection reason, wire command and cached unit identity.
Normal command validation, counters and native lookup are unchanged.

- ZIP SHA-256: `e19593287f154f2ba5447ed992a2d55904e53837a99a21352dbd643b37eed358`.
- Bot executable SHA-256: `bc5190ffc62c889e80e970a5fff1910b6ebc3da7c855006a682fe84ad571f795`.
- x64 loaded diagnostic DLL: `bcfc2e215dc1cb5e1e8b34d868c0635f7bba21b81d9dbf25c902148c9689507a`.
- x86 loaded diagnostic DLL: `efd95f64d32a444b106ba5b6225e962505d2e797f81bf1b935236a3c9a610c1e`.
- Native lookup dependency: `da4fed681dc09bda7a21c0051f60cdad98cc7226`.

Actual Electron 44.9.3, app source `04dc6ee699b4cfbf91dc66a1d0b61d84ccfc2c89`,
launched two unchanged Protoss packages with a human observer in isolated local
FFA lobbies on Fighting Spirit 1.4. This is a diagnostic mirror, not human-opponent
strength evidence. Package hash and all 12 original AI files were verified in
all four successful test profiles. Existing game installation and pinned bots
were not modified.

## Captures

| Architecture | Snapshot frame | Rejection | Command and cached identity | Final accepted / rejected for affected bot |
| --- | --- | --- | --- | --- |
| x64 | 9,886 | `target_native_missing` | `Attack_Unit` (kind 1), actor index 150 / Dragoon 66 / native ID 3573; target index 152 / Zealot 65 / native ID 3592 | 13,393 / 1 |
| x86 | 4,768 | `actor_native_missing` | `Move` (kind 10), actor index 1 / Probe 64 / native ID 3618; position 3799,3937 | 3,470 / 1 |

x64 cached actor and target were accessible and visible; target native ID no
longer resolved. x86 cached actor remained accessible, visible and owned, but
its native ID no longer resolved. x64 attack position fields 32000,32032 are
unused for this command; rejection occurred before encoding. x86 move position
was within map bounds. Neither capture reached unsupported/malformed encoding.

Accepted commands continued after each rejection: x64 affected bot increased
from 7,962 at frame 9,840 to 13,061 at frame 10,320; x86 affected bot increased
from 2,847 at frame 4,560 to 3,422 at frame 5,040. Final counters above include
commands processed during supervised shutdown. Both captures were deliberately
stopped after classification and continued progress. Neither is a natural match.

Initial x86 attempt failed module auditing and stopped at frame 240. It receives
no x86 validation credit. Corrected audit checked owned process architecture,
actual DLL module path and hash before the successful retry; all three observed
x86 game processes loaded the expected x86 diagnostic DLL.

## Cause and controls

BWAPI client validates commands against its cached snapshot, then queues unit
indices. Bridge consumes that queue before preparing the next snapshot and
resolves stored native IDs against current game state. A unit can expire between
snapshot and consumption while the cached record still reports accessible/live.
The pinned `bw_dat::UnitArray::get_by_unique_id` rejects dying units, freed slots
and IDs whose slot generation changed. Rejecting these packets protects current
native units from stale commands. Logging does not determine which of these
three expiry subtypes occurred in either live capture.

Standalone x64 and x86 fixtures linked the actual locked native lookup library
and exercised both legacy (1,700-slot) and extended (1,701-slot) ID layouts.
Live IDs resolved; dying and freed units failed lookup; reused slots rejected
old IDs and accepted their new generation IDs. All controls passed. These are
synthetic native-memory controls, not match outcomes or reconstructed packets.

## Verification and remaining scope

Both Windows architectures passed `build.bat debug` (x86 with `x86`),
`cargo fmt --all -- --check`, 943 workspace/all-target tests per architecture
(0 failed), and `cargo clippy --locked --all-targets --workspace --target <target>
-- -D warnings`. Targets were `x86_64-pc-windows-msvc` and
`i686-pc-windows-msvc`. No release-mode gameplay claim is made.

Robotics metadata and source-lock/candidate/catalog validation passed. Exact
archive/descriptor verification and all 29 committed recipe entries matched.
Experimental format, pending source review and absent production approval were
asserted unchanged.

Test-owned Electron/game processes and Node harnesses exited; private CDP
listener closed. Raw control/game logs remain private; structured evidence
contains only sanitized diagnostics and log digests.

No bot, recipe, package or approval metadata changed. Source-hosting and maintainer
source/distribution/roster review remain open. This investigation does not establish
active-human difficulty, other races/maps, teams, exhaustive command conformance
or production readiness. [Structured evidence](bananabrain-sb-6-rejection-investigation-20261028.json)
retains exact counters, hashes, controls, excluded attempt and historical limit.
