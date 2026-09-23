# OpprimoBot admission review

Status on 2026-09-23: **approved for local Terran staging distribution; prototype-tested**. The source-built executable completed local combat games against ZZZKBot on x86 and x64 SC:R, with matching sync probes and clean shutdown. Exact corresponding source rebuilds from the review archive. Other races, team/FFA games, irregular maps, and late-game spell behavior still need broader playtesting. Human skill is uncalibrated.

## Pinned source and intended role

- [OpprimoBot 65eeb7e0c838e47df5027c8a746248bd30299640](https://github.com/jhagelback/OpprimoBot/tree/65eeb7e0c838e47df5027c8a746248bd30299640). The source tree has 63 C++ files, but its VS2013 project lists **62**: Agentset.cpp is outside that project. The facility CMake recipe uses **61** project files, excluding Utils/cthread.cpp because the patched pathfinder no longer inherits CThread.
- [BWTA2 4222ab0d9b5d49362e4893ffb5fbcdcbeff359ec](https://bitbucket.org/auriarte/bwta2/src/4222ab0d9b5d49362e4893ffb5fbcdcbeff359ec/). Its Release static library uses 20 source files. The fixed runtime profile excludes OFFLINE and DEBUG_DRAW.
- Official Boost 1.56.0 archive: SHA-256 be168dd499a4929bb9e4ce8b3fc9d6d08a9d1ac2da9f51e70d1945f4acb23041, 161050696 bytes, pinned in native/dependencies.json. The build recipe extracts only headers and LICENSE_1_0.txt.

The upstream README says the bot plays Protoss, Terran, and Zerg on almost all maps and works best as Terran. With history disabled, the source chooses the empty-history strategy for each race; the alternate learned Zerg choice is unavailable. This supports further all-race research, but the current review package offers Terran only and makes no human difficulty claim. Leave humanSkill uncalibrated until the shipped profile is measured against humans.

## Source adaptation

The ordered Opprimo patches are 0001-bwta2-compatibility.patch and 0002-single-match-runtime.patch. Patch 0001 removes the obsolete BWTA::readMap call, takes BWTA2 polygon data by reference, and replaces six removed Polygon::isInside calls with one integer point-in-polygon helper. Its edge/vertex rule treats boundary points as inside. Patch 0002 moves BWTA analysis before initial units enter the agent graph, removes the Pathfinder background worker, and calculates at most one queued path on each game callback. An individual path query is not time-limited, so frame-time measurement remains necessary.

Patch 0002 also makes end-of-game cleanup unconditional and idempotent, repairs singleton/squad/exploration ownership, disables strategy-history reads and writes, and removes statistics and profiling output. It removes UserInput, bot speed changes, chat command/output handlers, debug overlays, and the bot's 81-minute leaveGame rule. The facility host uses SB_SINGLE_MATCH to exit after MatchEnd or bridge disconnection, so the admitted lifecycle is a **fresh process per match**. The early live probe checks exit and quiet work directories for one map and short match; full-match behavior still needs verification.

The BWTA patch, 0001-isolate-runtime.patch, removes the unused Boost dissolve include, cache directory creation, runtime log writes, and dead cache serializer/deserializer. Terrain algorithms and thresholds are unchanged. It carries dated modification notices in every changed source file. BWTA globals are not fully reset by cleanMemory, reinforcing the one-game-per-process profile. See [the BWTA source audit](opprimobot-bwta-review.md) for the file-level trace.

The facility recipe in native/opprimobot.cmake builds the 20 BWTA2 source files, the 61 Opprimo project files, and native/host.cpp as a Win32 static-CRT external client against source-built BWTA2 and BWAPI 4.4 static libraries. It excludes old bundled BWAPI/BWTA libraries, CGAL, Qt, GMP, MPFR, offline tools, and cthread.cpp. source-lock.json has OpprimoBot and BWTA2 entries and ordered patches; its patch hashes must match the actual files before the locked recipe runs. tools/build-opprimobot.mjs records the Boost archive and extracted-header inventory. The locked build and nested-header review archive have passed an offline source rebuild.

## What has been validated

Committed recipe b748042 checks every selected Boost header and license byte
against the pinned official ZIP before packaging. Final packaging also requires
the approved candidate to match committed bot.json bytes and the build recipe
revision; the review-only path remains unapproved. The locked
.build/opprimobot-review-3 build produced a Win32 static-CRT external client and
passed the CMake geometry test (1/1). Its unpublished opprimobot-sb-3 review ZIP
has SHA-256 fab9be50fe0ff28f8494738647635a6b3e864cfbeea22df04bb488efc50f2c01,
is 16,323,624 bytes, and contains 377 outer entries. Rebuilding from extracted
source in .build/opprimobot-package-check-3 succeeded, including the nested
Boost headers; the rebuilt geometry test passed (1/1). All 49 robotics-facility
tests pass. These checks establish rebuildability and package input integrity,
not full live-match compatibility or human difficulty.

## Attribution and distribution

The OpprimoBot README declares MIT licensing, credits Dr. Johan Hagelbäck, and requests a citation for published work based on the bot or BTHAI. The repository has no separate license file. Preserve that README and the source copyright notices; OPPRIMOBOT-MIT.txt supplies standard MIT text without inventing an upstream copyright year.

BWTA2 supplies LGPL-3.0 text in COPYING. Static linking requires the full LGPL/GPL texts, exact corresponding BWTA2 and BWAPI source, modifications, dependency headers, and practical rebuilding/relinking material in the package. BWTA2's bundled filesystem helper also has a separate Wenzel Jakob BSD two-clause notice: the exact original text is now in bots/opprimobot/BWTA2-FILESYSTEM-LICENSE.txt. Boost uses its own Boost Software License 1.0; BWAPI's smallsha1 BSD notice must also travel with the archive. The unused Opprimo CThread files credit Ciprian Miclaus separately and are excluded from the selected corresponding-source bundle; they are not compiled or needed to relink this profile. BWTA2 requests, but does not require, citation of Uriarte and Ontanon's AIIDE 2016 terrain-analysis paper.

## Scope and follow-up validation

1. Rebuild and review the final package after any bot recipe or bridge changes;
   confirm its source-lock patch hashes, toolchain, Boost inventory, binary
   digest, archive entries, and notices.
2. Run complete fresh-process Terran games on normal and irregular maps,
   including wins, losses, disconnects, concurrent instances, and shutdown.
   Check that no worker survives and no bot cache, log, strategy, statistics,
   or profiling files appear. Any additional race needs its own evidence.
3. Measure terrain analysis and per-frame path-query time on intended maps.
   Inspect file, process, shared-memory IPC, network, chat, and configuration
   behavior from the final package; verify no speed, quit, debug drawing, user
   input, or complete-map-information flag is active.
4. Local distribution is approved for the tested Terran profile. Public
   competition approval remains separate. Measure the shipped profile against
   humans before assigning a difficulty label.

## Live probes and bridge progress

The first source-reviewed executable was launched through an independent
ShieldBattery feature/bwapi-compat worktree at 3e9411268, using freshly built
x64 game DLLs and a separate muted profile. Local session
3748529b-789f-48c6-b88a-0ce958eec5f1 ran two Terran instances plus an
observer on Fighting Spirit 1.3. Both mined and trained workers. All seven
common sync probes matched. A clean bot leave before four minutes delivered
loss at frame 1617 and win at frame 1622; both external processes and all
three game clients exited. Neither bot work directory contained a file
afterward. The game clients exited with code zero. This checks
startup/concurrent isolation/early teardown, not a complete Terran game.

The earlier command audit found that the Terran strategy uses Build_Addon,
Siege/Unsiege, Stim Packs, and Medic Healing, which were not encoded at bridge
revision 3e9411268. Their final behavior still needs validation. A later
refinery probe found a separate bridge issue: the missing SCV-to-building
backlink made BWAPI isBeingConstructed return false for a refinery, so the bot
assigned gas workers before construction completed. That backlink was fixed in
a private ShieldBattery worktree. Instrumented two-Terran x64 session
cf6805e7-92ef-4df0-aec4-5f0feba4f85d then observed gas after refinery
completion, followed by factory, machine shop, comsat, and unit production.
The probe reached siege tanks and medics. All 70 common synchronization probes
matched through frame 16560. A normal bot quit delivered loss at frame 16776
and win at frame 16781; all three game clients exited and both work directories
remained empty. This verifies production and deliberate midgame teardown, not
an autonomous combat result. It used an instrumented probe and a private bridge
worktree, so final packaged-build combat validation remains outstanding.

## Play-style labels

The fixed TerranMain profile builds two early bunkers and gathers its infantry
force before attacking; its main squad starts with Marines and later adds Medics
and supporting tanks. The live refinery probe reached both occupied bunkers and
that mixed army. This supports the Bio and Defensive labels for the offered
Terran profile. Supporting factory units alone do not establish a Mech label,
and neither tag establishes human difficulty.

## Packaged combat checkpoint

The executable extracted from review archive `opprimobot-sb-3` is 1,260,544
bytes, SHA-256 `9d32d951a2403269002fbcefa0a0cd2272b75a127403faca35759e43be7d0d14`.
It was tested with the bridge changes committed as ShieldBattery `bd63be767`
(the tested game source is identical to that commit). Both game DLLs were
rebuilt with `game/build.bat`; 34 BWAPI regression tests passed on each
architecture, with clippy and formatting checks passing. The source-only
visibility tests cover cloaked observations and prevent revealing detector-gated
fields; this is not a live validation of every late-game spell.

- **x86:** local session `1abb552a-c464-4b99-b9ae-a73b057912f0`, Terran Opprimo
  versus Zerg ZZZKBot on Fighting Spirit 1.3. Natural defeat at frame 5087,
  opposing win at 5092. All 22 common sync probes matched through frame 5040.
  Opprimo submitted 94 accepted commands and zero rejected commands.
- **x64:** session `ca993f2a-6575-487f-8e00-8387a1bf07a2`, same matchup/map.
  Natural defeat at frame 6234, opposing win at 6239. All 26 common sync
  probes matched through frame 6000. Opprimo submitted 122 accepted commands
  and zero rejected commands.

In both games Opprimo delivered MatchEnd, disconnected, and exited; all owned
game clients and the opposing supervised bot exited too. Opprimo's working
directory remained empty. Its external process used about 21 MB of working
set in one early-game observation, excluding SC:R; this is not a performance
bound or a broad benchmark. The two earlier concurrent Terran probes cover
fresh-process isolation, early quit, and midgame production/teardown.

## Release artifact

`opprimobot-sb-1.zip`: SHA-256
`c11c0b1733ba84b6fb635e118632a0b88fd52b53dcd4e50402c5ea01573dff99`,
16,323,772 bytes, 377 entries. Every entry is byte-identical to the tested
review-3 archive except `package.json`, which records the stable release ID
and committed local-distribution/source-review approvals. The final package
passed archive verification, catalog validation, and all 49 publisher tests.
