# OpprimoBot admission review

Status: source feasibility and dependency review only, 2026-09-23. No
upstream build script, binary, or live game was run. This note does not approve
source review, local distribution, catalog publication, or a human-skill tier.

## Pinned inputs and intended role

- Bot source: [jhagelback/OpprimoBot at `65eeb7e0c838e47df5027c8a746248bd30299640`](https://github.com/jhagelback/OpprimoBot/tree/65eeb7e0c838e47df5027c8a746248bd30299640), a clean checkout whose last commit is from 2015. The upstream `SCProjects/OpprimoBot/Source` tree has 63 C++ files and 63 headers; its VS2013 project builds all 63 C++ files as a 32-bit DLL.
- Terrain-analysis candidate: [auriarte/bwta2 at `4222ab0d9b5d49362e4893ffb5fbcdcbeff359ec`](https://bitbucket.org/auriarte/bwta2/src/4222ab0d9b5d49362e4893ffb5fbcdcbeff359ec/), a clean checkout whose last commit is from 2017. Its README declares BWAPI 4 compatibility and names BWAPI 4.1.2; its Release project compiles a 20-file static terrain library. The isolated source compile result is recorded below; a match test remains required.

The README describes an AI that plays Protoss, Terran, and Zerg on almost all
maps, with its best results as Terran. The source selects `ProtossMain`,
`TerranMain`, or `LurkerRush` for an unrecorded matchup, and can select the
second Zerg strategy when history is present. This supports only a three-race
candidate with a Terran-first test matrix. It does not establish a human
difficulty. Keep `humanSkill` uncalibrated until the shipped profile has been
measured against humans.

## Native build route

The upstream project is a Win32 VS2013 DLL that links its bundled old
`BWAPI.lib`, `BWTA.lib`, CGAL 4.4, Boost 1.56, GMP, and MPFR. Do not reuse any
of those prebuilt libraries. The existing external-client host already calls
the `gameInit` and `newAIModule` symbols provided by OpprimoBot's `Dll.cpp`, so
the shortest integration is an executable using that host, the current static
BWAPI 4.4 libraries, and the whole upstream OpprimoBot C++ source list.

BWTA is the main compatibility boundary. The pinned BWTA2 source builds with BWAPI 4.4, but its public polygon API changed; the small Opprimo source port is recorded below. Opprimo uses
only the familiar BWTA2 surface: map read/analyze; base locations; regions,
polygons, and chokepoints; nearest chokepoints; and shortest paths. The calls
are concentrated in `OpprimoBot.cpp`, `AIloop.cpp`, `MapManager`,
`ExplorationManager`, `BuildingPlacer`, `PathObj`, `NavigationAgent`, and one
disabled Comsat scan branch. BWTA2 provides that surface and is a source-built
static library, rather than the obsolete `BWTA.lib` bundled with OpprimoBot.

Create an Opprimo-specific native CMake input that:

1. builds BWTA2's 20 `BWTA/bwta.vcxproj` Release sources with the current
   BWAPI headers and static CRT, without `DEBUG_DRAW`, the offline tools, or
   the bundled binaries;
2. builds the 63 upstream OpprimoBot C++ files plus `native/host.cpp` as a
   32-bit external client and links BWTA2, `BWAPIClient`, and `BWAPIStatic`;
3. records both source trees, all downstream patches, the complete source
   lists, toolchain, executable digest, and Boost header source in the source
   lock/build record; and
4. does not copy CGAL, Qt, GMP, MPFR, old Boost libraries, BWTA/BWAPI libraries,
   PDBs, the offline extractor/tester, or solution user files into a package.

BWTA2's Release project has no library dependencies in its project file; its
active terrain code uses Boost Geometry/Polygon headers. Its README still lists
CGAL and Qt, and its debug/offline configurations do use Qt and other legacy
libraries. Pin the actual Boost headers used by the release source and include
their notice. Treat a BWAPI 4.4 compile failure as an adaptation checkpoint,
not permission to fall back to opaque old BWTA binaries.


## Isolated compile-only result

An ignored `.build/opprimobot-compile-check` probe configured Visual Studio 2022
Win32 with the static CRT and reused only the already-built facility
`BWAPIClient.lib` and `BWAPIStatic.lib`. It did not run either bot, an upstream
build script, a DLL, or a game. Both upstream trees were freshly cloned at the
pins above and remain clean.

BWTA2's 20 Release files compile as a static library against the current BWAPI
4.4 headers in C++14 mode. The probe forced its project precompiled header,
which its sources assume, and placed a local empty compatibility header ahead
of Boost for the stale `boost/geometry/extensions/algorithms/dissolve.hpp`
include; BWTA2's only use of that extension is commented out. A release patch
should delete that unused include instead of shipping the shim. The official
Boost 1.56.0 source archive was inspected and pinned as SHA-256
`be168dd499a4929bb9e4ce8b3fc9d6d08a9d1ac2da9f51e70d1945f4acb23041`; its
license is the Boost Software License 1.0.

The 63-source Opprimo compilation was attempted in the same C++14 compatibility
mode. Compilation reaches the BWTA consumer sources; the only reported errors
are the BWTA API differences below. The current BWAPI also reports three
`Race::getCenter` deprecation warnings in `ResourceManager.cpp:7`,
`Constructor.cpp:72`, and `BuildingPlacer.cpp:726`. The C++17 external-client
host compiles separately. No combined executable was produced because these
source errors stop compilation before linking:

1. `OpprimoBot.cpp:41` calls the removed `BWTA::readMap`; delete that call,
   since BWTA2 performs map setup from `analyze`.
2. `AIloop.cpp:274` copies `BWTA::Polygon`. BWTA2's polygon is abstract, so
   change this debug-only local to `const BWTA::Polygon&`.
3. BWTA2 removed `Polygon::isInside`. Replace the six calls in
   `MapManager.cpp:129,261,273,285,297` and
   `ExplorationManager.cpp:215` with one tested point-in-polygon adapter over
   the returned polygon vertices, including a defined boundary rule.

These are source-level compatibility edits, not a reason to reuse Opprimo's old
BWTA binary. They need a focused terrain/map test before the link result can
count as runtime evidence.
## Required source and runtime changes

The following changes are required before an isolated local-play build. They
keep the game strategy intact while removing runner control, persistence, and
unsafe lifecycle behavior.

- In `OpprimoBot.cpp`, do not enable `Flag::UserInput`, do not call
  `setLocalSpeed`, and remove the initial debug toggles. Set `AIloop` debug
  state false, remove the per-frame `Config::displayBotName` overlay, and make
  `onSendText`, `onReceiveText`, `onNukeDetect`, and `onSaveGame` quiet no-ops.
  The current text handler changes speed and debug state; it also echoes raw
  received player text. `onFrame` currently calls `leaveGame` after 81 minutes;
  leave match termination to the runner.
- Make strategy history truly disabled. Although `onStart` immediately calls
  `StrategySelector::disable`, constructing that singleton first invokes
  `loadStats` from `bwapi-data\\AI\\Strategies_OpprimoBot.csv`. Remove that
  load and make result/stat/profile persistence unavailable in the release
  profile. The stock fixed filenames contain no opponent name, map name, or
  other raw input, but their CSV contents include the raw map filename. No
  player name reaches a filesystem path in the reviewed source.
- Make shutdown unconditional and once-only. `onEnd` returns for games under
  four minutes, but the current external host destroys the module immediately
  after its `MatchEnd` callback and sends no later `onFrame`. That leaves the
  singleton graph and Pathfinder worker alive. Guard an unconditional cleanup
  call in `onEnd`; do not write an outcome while doing so.
- Replace the raw `CreateThread` Pathfinder or join it before freeing its
  queue. Its derived destructor currently frees `pathObj` before the base
  `CThread` destructor waits (and may call `TerminateThread`), while the worker
  iterates that queue and calls BWTA pathfinding. A synchronous bounded path
  request is the smallest safe first implementation; otherwise use a joined
  C++ thread with synchronized queue ownership. Measure startup and frame time
  on the intended maps before choosing either option.
- Build BWTA2 without `DEBUG_DRAW`. Its active `analyze` still creates
  `bwapi-data/BWTA2` and its `LOG` macro appends
  `bwapi-data/logs/BWTA.log`, even though map cache load/save calls are
  commented out. Patch those two effects out for the no-cache profile, or give
  every instance a pre-created, isolated working directory and include those
  paths in the package's mutable-state declaration. Do not enable the cache
  until its map-hash files have an explicit reset/promotion policy.

The source review found no HTTP client, socket, child-process, dynamic-library
load, shell-launch, or raw-name-derived filename operation in OpprimoBot. The
external client and BWAPI still use local process/shared-memory IPC; trace that
and BWTA2 filesystem behavior from a fresh package before distribution.

## Attribution and distribution

OpprimoBot's README declares it MIT-licensed, identifies Dr. Johan Hagelback,
and requests this reference for published work based on OpprimoBot or BTHAI:

> Johan HagelbÃ¤ck. "Potential-Field Based navigation in Starcraft". In
> Proceedings of 2012 IEEE Conference on Computational Intelligence and Games
> (CIG), 2012.

Retain the README's MIT declaration, the author notices in the source headers,
the complete downstream patch set, and that requested citation in the release
notice. The repository contains no separate LICENSE file; this review relies on
the README declaration as accepted for this intake.

BWTA2 ships the LGPL-3.0 text (`COPYING`) and asks, but does not require, citation
of Uriarte and Ontanon, *Improving Terrain Analysis and Applications to RTS
Game AI* (AIIDE 2016). A statically linked external client must ship the full
LGPL and GPL texts, the exact BWTA2 source and modifications, the OpprimoBot
source, and reproducible relinking/build material under the facility licensing
policy. Preserve the BWAPI notice and license obligations separately, and
inventory the pinned Boost headers before approving a final archive. The BWTA2
`BWTA/Source/filesystem/path.h` header also carries a Wenzel Jakob BSD-style
copyright notice and a modification credit, but the pinned tree contains no
separate license text for it. Resolve and include that notice before packaging.

## Admission evidence still required

1. Add both source records and their exact trees to the source lock, create a
   reviewed CMake recipe and patches, and compile with the current 32-bit
   BWAPI 4.4 toolchain. Inspect the resulting archive and license disclosures.
2. Test a fresh isolated work directory, all three races, normal 1v1 maps,
   unknown and irregular maps, fast losses, repeated matches in one external
   client, concurrent instances, disconnect/reconnect, reset, and shutdown.
   Verify the worker cannot survive module teardown.
3. Trace file, process, shared-memory IPC, network, chat, and configuration
   behavior. Confirm no bot-controlled speed, quit, drawing, user input, or
   complete-map-information flag remains, and that BWTA2 emits neither cache
   directories nor logs in the release profile.
4. Measure the exact shipped Terran, Protoss, and Zerg profiles against humans
   before assigning a difficulty label. A catalog record must leave `humanSkill` uncalibrated until then.
