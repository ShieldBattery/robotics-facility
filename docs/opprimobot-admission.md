# OpprimoBot admission review

Status on 2026-09-23: **source and isolated compile checkpoint**. A patched Win32 executable links, and the polygon helper test passes. The locked build, source archive rebuild, and initial concurrent startup/early-teardown probe pass. Full combat compatibility and distribution approval remain pending. No human-skill tier is established.

## Pinned source and intended role

- [OpprimoBot 65eeb7e0c838e47df5027c8a746248bd30299640](https://github.com/jhagelback/OpprimoBot/tree/65eeb7e0c838e47df5027c8a746248bd30299640). The source tree has 63 C++ files, but its VS2013 project lists **62**: Agentset.cpp is outside that project. The facility CMake recipe uses **61** project files, excluding Utils/cthread.cpp because the patched pathfinder no longer inherits CThread.
- [BWTA2 4222ab0d9b5d49362e4893ffb5fbcdcbeff359ec](https://bitbucket.org/auriarte/bwta2/src/4222ab0d9b5d49362e4893ffb5fbcdcbeff359ec/). Its Release static library uses 20 source files. The fixed runtime profile excludes OFFLINE and DEBUG_DRAW.
- Official Boost 1.56.0 archive: SHA-256 be168dd499a4929bb9e4ce8b3fc9d6d08a9d1ac2da9f51e70d1945f4acb23041, 161050696 bytes, pinned in native/dependencies.json. The build recipe extracts only headers and LICENSE_1_0.txt.

The upstream README says the bot plays Protoss, Terran, and Zerg on almost all maps and works best as Terran. With history disabled, the source chooses the empty-history strategy for each race; the alternate learned Zerg choice is unavailable. This supports a three-race candidate and a Terran-first test matrix, not a human difficulty claim. Leave humanSkill uncalibrated until the shipped profile is measured against humans.

## Source adaptation

The ordered Opprimo patches are 0001-bwta2-compatibility.patch and 0002-single-match-runtime.patch. Patch 0001 removes the obsolete BWTA::readMap call, takes BWTA2 polygon data by reference, and replaces six removed Polygon::isInside calls with one integer point-in-polygon helper. Its edge/vertex rule treats boundary points as inside. Patch 0002 moves BWTA analysis before initial units enter the agent graph, removes the Pathfinder background worker, and calculates at most one queued path on each game callback. An individual path query is not time-limited, so frame-time measurement remains necessary.

Patch 0002 also makes end-of-game cleanup unconditional and idempotent, repairs singleton/squad/exploration ownership, disables strategy-history reads and writes, and removes statistics and profiling output. It removes UserInput, bot speed changes, chat command/output handlers, debug overlays, and the bot's 81-minute leaveGame rule. The facility host uses SB_SINGLE_MATCH to exit after MatchEnd or bridge disconnection, so the admitted lifecycle is a **fresh process per match**. Source changes do not prove exit, cleanup, or quiet operation in a live match.

The BWTA patch, 0001-isolate-runtime.patch, removes the unused Boost dissolve include, cache directory creation, runtime log writes, and dead cache serializer/deserializer. Terrain algorithms and thresholds are unchanged. It carries dated modification notices in every changed source file. BWTA globals are not fully reset by cleanMemory, reinforcing the one-game-per-process profile. See [the BWTA source audit](opprimobot-bwta-review.md) for the file-level trace.

The facility recipe in native/opprimobot.cmake builds the 20 BWTA2 source files, the 61 Opprimo project files, and native/host.cpp as a Win32 static-CRT external client against source-built BWTA2 and BWAPI 4.4 static libraries. It excludes old bundled BWAPI/BWTA libraries, CGAL, Qt, GMP, MPFR, offline tools, and cthread.cpp. source-lock.json has OpprimoBot and BWTA2 entries and ordered patches; its patch hashes must match the actual files before the locked recipe runs. tools/build-opprimobot.mjs records the Boost archive and extracted-header inventory, but its final build and nested-header archive have not yet been validated.

## What has been validated

An earlier clean-source probe compiled BWTA2's 20 Release files against current BWAPI 4.4 headers in C++14 mode. Its temporary empty Boost dissolve shim is replaced by the reviewed source patch. The same probe found only the expected Opprimo BWTA API incompatibilities; it did not produce a combined executable.

For the latest isolated two-patch cleanup revision, the build in .build/opprimobot-port-work/runtime-review/build completed a Win32 MSVC 19.43 Release link with static /MT CRT. It produced Release/OpprimoBotCompileCheck.exe, linked to source-built BWTA2 and existing BWAPI Client/Static probe libraries. CTest passed 1/1 PolygonUtilsTest (0.22 s), covering interior, exterior, edge, vertex, and a concave notch. The test executable was run; **the bot executable was not run**. This compile-only probe is separate from the final source-lock-driven build and does not validate game behavior, package contents, or performance.

## Attribution and distribution

The OpprimoBot README declares MIT licensing, credits Dr. Johan Hagelbäck, and requests a citation for published work based on the bot or BTHAI. The repository has no separate license file. Preserve that README and the source copyright notices; OPPRIMOBOT-MIT.txt supplies standard MIT text without inventing an upstream copyright year.

BWTA2 supplies LGPL-3.0 text in COPYING. Static linking requires the full LGPL/GPL texts, exact corresponding BWTA2 and BWAPI source, modifications, dependency headers, and practical rebuilding/relinking material in the package. BWTA2's bundled filesystem helper also has a separate Wenzel Jakob BSD two-clause notice: the exact original text is now in bots/opprimobot/BWTA2-FILESYSTEM-LICENSE.txt. Boost uses its own Boost Software License 1.0; BWAPI's smallsha1 BSD notice must also travel with the archive. The unused Opprimo CThread files credit Ciprian Miclaus separately and are excluded from the selected corresponding-source bundle; they are not compiled or needed to relink this profile. BWTA2 requests, but does not require, citation of Uriarte and Ontanon's AIIDE 2016 terrain-analysis paper.

## Admission evidence still required

1. Run the locked build recipe from a committed checkout and verify source-lock patch hashes, toolchain, Boost-header inventory, binary digest, and all archive entries and notices.
2. Run isolated fresh-process games for each race and normal and irregular maps. Include fast losses, wins, disconnects, concurrent instances, and shutdown. Check that no worker survives and no bot cache, log, strategy, statistics, or profiling files appear.
3. Measure terrain analysis and per-frame path-query time on intended maps. Inspect file, process, shared-memory IPC, network, chat, and configuration behavior from the final package; verify no speed, quit, debug drawing, user input, or complete-map-information flag is active.
4. Keep source/local-distribution review and catalog approval pending until package and live evidence is recorded. Measure the shipped race profiles against humans before assigning a difficulty label.

## Initial locked build and live probe

Recipe fb365c7 builds all three pinned source trees with MSVC 19.43 and the
static CRT. The actual CMake geometry target passes (1/1). Its unpublished
review ZIP had 376 entries and was 16,322,015 bytes; offline rebuilding caught
an omitted BWTA2 OfflineExtractor/MapFileParser.h header. Recipe 18cd404 adds
that required header without compiling the offline tools. A fresh full build
and archive rebuild are required for that corrected recipe.

The first source-reviewed executable was launched through an independent
ShieldBattery feature/bwapi-compat worktree at 3e9411268, using freshly built
x64 game DLLs and a separate muted profile. Local session
3748529b-789f-48c6-b88a-0ce958eec5f1 ran two Terran instances plus an observer on
Fighting Spirit 1.3. Both mined and trained workers. All seven common sync
probes matched. A clean bot leave before four minutes delivered loss at frame
1617 and win at frame 1622; both external processes and all three game clients
exited. Neither bot work directory contained a file afterward. The game clients
exited with code zero. This checks startup/concurrent isolation/early teardown,
not the full Terran strategy or other races.

The command audit found necessary bridge work before admission: the Terran
strategy uses Build_Addon, Siege/Unsiege, Stim Packs, and Medic Healing, which
were not encoded at that ShieldBattery revision. Keep compatibility unverified
and publication pending until those behaviors are implemented and tested.

Corrected recipe 18cd404 and review archive opprimobot-sb-2 completed the full
offline rebuild from extracted package contents, including the nested Boost
headers. The rebuilt executable linked and its geometry test passed (1/1).
Archive SHA-256: 62e8affc5c47b468a0aeb0e5250581217620711de9b30ab42c8061b14b202aff;
16,322,645 bytes, 377 outer entries. The package keeps source review pending and
local distribution unreviewed, so it cannot be published as an approved release.
