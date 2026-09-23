# UAlbertaBot staging admission review

Reviewer: Codex, 2026-09-23. Scope: the pinned Terran MarineRush external
client, fixed package configuration, native recipe, and source archive. Human
skill is uncalibrated; this does not approve public competition or establish
complete BWAPI conformance.

## Exact inputs and source delivery

- UAlbertaBot: `558899d8793456f4a6ec4196efbb5235552e24db`.
- BWAPI: `7687da8abc4726f8366401f11ab648d421385793`.
- Recipe: `04953ce1bef47bcf5d1a3a16a5a139d9763b0634`.
- Executable SHA-256: `1992e38fa3e7ec42023d05de6284dd10f814b13c5fcdf177ea2295f50c7e5448`.
- Recipe input hash: `202d46ad253788b91ecb02821911513b1819c521c371845b2579bf3e24457025`.
- MSVC 19.43.34810.0, Windows SDK 10.0.26100.0, CMake 3.31.0, VS2022 Win32
  Release with static CRT. Exact prepared trees and ordered patch digests are in
  `source/build-info.json` and `package.json` in the archive.

The builder verifies each prepared source index and working tree before and after
compilation. The package rechecks the executable, source pins, patches, recipe
revision and exact input bytes. The review archive was extracted and successfully
rebuilt using only its bundled `source/native` recipe and installed compiler/SDK/
CMake. That check caught omitted StarDraft headers; all four required headers are
included in the corrected archive. No extra source checkout or download is needed
to rebuild/relink BWAPI and the application.

The executable's direct imported DLL list is KERNEL32.dll. The static C runtime
requires no separate VC redistributable. Compiled source and header notices are
preserved, with full UAlbertaBot MIT, RapidJSON MIT, msinttypes BSD-3-Clause,
smallsha1 BSD-3-Clause, BWAPI LGPLv3/GPLv3 and ShieldBattery MIT texts. Selected
BOSS/SparCraft and StarDraft code is part of the upstream MIT tree and carries no
contradictory notice. Unused CImg/SDL/GUI/research code is omitted. The former
academic-use timer is neither compiled nor distributed: an independently written
MIT `std::chrono::steady_clock` timer replaces its required API. Source, patches,
modification disclosures and rebuild instructions accompany the binary.

## Reachable behavior and downstream changes

The fixed `UAlbertaBot_Config.txt` selects the stock Terran MarineRush opening and
retains its macro/micro configuration. No deliberate difficulty reduction was
made. Complete-map information, debug output/drawing, manual input, auto-observer,
opponent overrides and StrategyIO are disabled. Chat configuration setters are
removed so an in-game message cannot reenable I/O or choose an arbitrary log path.

The upstream learning selector returns immediately. StrategyIO would otherwise
read/write results using insufficiently encoded opponent names; it is disabled
for this package. There are no learned inputs to migrate or reset. The only file
in the observed work directory after matches was the unchanged packaged config.
Assertion logging is disabled. Profiling is compiled out. Map export call sites
are commented out: StarDraft's generic file helpers are present in required
headers, but gameplay constructs map data from BWAPI instead of reading a file.

The reviewed bot/client path has no direct remote-network, registry, shell,
process-launch, dynamic-download or auto-update operation. BWAPI uses the assigned
instance's local shared memory and named pipe. The process returns after a single
match; ShieldBattery owns process shutdown and per-match working directories.
Two different bot clients ran concurrently without selecting each other's IPC.
Runtime socket sampling of the live UAlbertaBot process found no TCP/UDP endpoints.
These checks are source/call-site review plus process, socket, file-inventory and
game-log evidence, not a full system-call trace or a security sandbox guarantee.

## Runtime evidence and limits

- x64 session `4cf2c9f9-df11-4800-a78c-27636dfc94e1`: hardened pre-package build
  ran against a human slot through frame 8714, delivered MatchEnd, and both game
  clients exited with code zero. All 37 shared sync probes through frame 8640
  matched. Bot result was defeat; this is lifecycle evidence, not strength data.
- x64 observer session `09bd71fe-0e8c-4e3a-9e3f-c0a531837808`: extracted review
  package ran concurrently with ZZZKBot. All 19 shared probes through frame 4320
  matched. Normal observer leave closed the session and supervised bot processes.
- x86 observer session `8edd570d-cc36-4575-b0f9-1f85bbf3fe27`: corrected archive
  executable ran against ZZZKBot using the x86 SC:R executable. All 18 shared
  probes through frame 4080 matched. A normal debug leave on the ZZZKBot client
  exercised UAlbertaBot victory, MatchEnd, and automatic shutdown. All three
  SC:R clients exited with code zero; the bot recorded 1841 accepted commands
  and no rejected commands.
- Final-binary x64 concurrent session `267c045e-3ae1-423e-81e5-c635f7cee88f`:
  two UAlbertaBot instances used separate work directories and discovery endpoints.
  All 15 shared sync probes through frame 3360 matched. Normal leave by one bot
  exercised defeat/victory callbacks and all three game clients exited with code
  zero. Both work directories retained only the config and empty state folders.
- Bot presentation queries confirmed a hidden window and skipped HD asset loads.
  Background match end suppressed both replay autosave and LastReplay copying.
- A first observer launch at 30 foreground FPS stalled before its first turn and
  timed out cleanly. The human retry and observer retry at the restored 300 FPS
  both started. FPS causation has not been established; the initial observer spent
  about 40 seconds in pre-countdown lobby initialization. This remains a launcher
  investigation, not a claim that every launch succeeds.

The exact release is for the fixed, app-owned configuration and ordinary local
1v1 legacy-limit maps. User-modified/malformed configs, a full OS-call trace,
island-map strategy, endurance, and human difficulty calibration are not covered.
Do not use the historical tournament Elo as this package's human skill estimate.

## Staging decision

Approved for the scoped experimental local-play staging catalog. Public competition
remains unreviewed. The final `ualbertabot-sb-3` ZIP SHA-256 is
`e0666438fe54fbebd9ee1b59c4ed2576ff34d2cc1fccbe1c64bce8193ca1d0f7`
(1,710,587 bytes). Comparing every archive member with the tested corrected review
ZIP found changes only in `package.json`: release identity, review status and
profile evidence. Executable, configuration, sources and notices are byte-identical.
