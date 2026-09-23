# BWTA2 source and dependency review for OpprimoBot

This is a **source-only admission checkpoint**, not a runtime or skill result. The pinned BWTA2 library is 4222ab0d9b5d49362e4893ffb5fbcdcbeff359ec. The isolation patch is patches/bwta2/0001-isolate-runtime.patch, SHA-256 b4d12564ca8da46e8835dc8c97ad9da4992f5d150dcbc4a2af90bcf0c98b61b1. It was generated from git diff --binary in a separate checkout and passes git apply --check against the pristine pin. No bot or BWTA runtime was executed.

## Runtime profile and effects

Build only the BWTA static-library source units used by the bot, with OFFLINE and DEBUG_DRAW undefined. BWTA/BWTA.vcxproj defines ordinary, offline and debug-drawing configurations. BWTA/Source/main.cpp, OfflineExtractor and OfflineTester are offline utilities; exclude them from the game runtime. Painter.cpp can save PNGs when DEBUG_DRAW is defined (Painter.cpp:1,33-41).

Before patching, TerrainAnalysis.cpp:28-49 made bwapi-data/BWTA2/ on every analyze() call, although cache load/save calls were commented out. LoadData.cpp:20-22 created bwapi-data/logs/BWTA.log, and stdafx.h:43-48 appended to it for each runtime LOG call. The patch removes directory creation and the dead cache read/write implementation, removes direct log creation, and makes runtime LOG inert. It removes the obsolete boost/geometry/extensions/algorithms/dissolve.hpp include from PolygonGenerator.cpp:3; the corresponding invocation was already commented out at line 151. Each changed BWTA2 source file carries a prominent dated ShieldBattery modification notice. The terrain computation calls, thresholds and data transformations are unchanged.

The active patched path obtains map name/hash, dimensions, walkability, resources, neutral buildings and start locations through BWAPI (LoadData.cpp:15-90) and computes terrain in memory (TerrainAnalysis.cpp). The patched runtime compilation units have no direct network or process-launch calls. RectangleArray::saveToFile remains a public template helper in include/BWTA/RectangleArray.h:234-254, but no runtime analysis call reaches it. The bundled filesystem headers contain file and directory operations, but the patch removes their includes from compiled runtime units. Offline utilities and debug drawing retain separate side effects and must remain excluded.

BWTA has process-global result arrays, map data and terrain graphs (BWTA_Result.cpp:5-24, MapData.cpp:5-41). cleanMemory() deletes result objects and clears their containers (BWTA.cpp:9-21), but does not reset every array or all MapData state. Admission assumes **one game per process**, with no concurrent analyses or BWTA reuse across games.

## Dependency and notice provenance

The BWTA2 pin supplies COPYING with LGPL-3.0 text. Its BWTA/Source/filesystem/path.h:1-9 separately names Wenzel Jakob, a BSD-style license and a modification by pauloscustodio/filesystem, but BWTA2 omits the referenced LICENSE file. bots/opprimobot/BWTA2-FILESYSTEM-LICENSE.txt is the exact 1,295-byte original 2015 BSD two-clause notice from [Wenzel Jakob's filesystem initial commit](https://github.com/wjakob/filesystem/blob/77c7102b66cb3c881ed51e84543ebede50759dd0/LICENSE), SHA-256 ad3b5cde8406eb1517692e5ebd78e934747565f115e6643b56d2b8d8a8bdd339. The [named fork](https://github.com/pauloscustodio/filesystem) retained that notice through its last commit before BWTA2's 2017 pin; its later license text differs. Preserve the source headers and ship this separate notice with the patched source, even though the runtime library no longer includes those headers.

The reviewed external Boost input is the official Boost 1.56.0 archive, SHA-256 be168dd499a4929bb9e4ce8b3fc9d6d08a9d1ac2da9f51e70d1945f4acb23041, extracted in .build/opprimobot-compile-check/deps/boost_1_56_0. Its Boost Software License notice and corresponding source are separate package obligations. The unused dissolve include no longer requires an empty compatibility shim. BWAPI, BWTA2, Boost and bot-specific dependencies require distinct provenance and notices in the release.

## Acceptance before packaging

- Pin and hash BWTA2, Boost and BWAPI; verify the patch hash before applying it.
- Compile the patched static library with OFFLINE and DEBUG_DRAW unset; exclude offline tools, main.cpp and debug-painter output.
- Include LGPL-3.0 BWTA2 source/notice, the filesystem BSD notice, Boost's license and corresponding source, and all other linked dependency notices and rebuild inputs.
- Inspect the linked binary and package for cache/log paths, unexpected file/process/network imports and absolute developer paths.
- Run an isolated single-game smoke test. Check terrain queries, no BWTA cache/log/debug artifacts, process exit and a fresh process for the next game.
- Keep the candidate pending until architecture, gameplay and package checks are recorded. Source review does not establish a human skill or matchmaking rating.