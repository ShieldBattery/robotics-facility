# BananaBrain prototype validation (superseded)

Historical prototype evidence. See the pending [sb.6 review](releases/bananabrain-sb-6.md)
for the current candidate.

Tested on 2026-10-25 and 2026-10-26. Local prototype only; no catalog entry or publication.

## Build

- Original AIIDE 2025 archive verified against `3d68f16ca785665c56ef78148271c5a1e19d1df82cdd1cf4620f3090ca207549`.
- Unmodified source/data import: `f66d7336ca61a0a0a1a984fad55c162d942694e4` on local branch
  `source/bananabrain-aiide2025`. That branch must be made available with any
  future contribution so its source pin can be fetched externally.
- Recipe: `393f86bbe5f9d8eebf873577f894d3548bcf1b67` on `prototype/bananabrain`.
- Existing native host and BWAPI client unchanged; no custom companion or bot
  source patch. All 37 original C++ compilation units built with MSVC as Win32
  Release/static CRT using the common build/provenance tooling.
- Executable SHA-256: `ff23054c8c9d9777aea9d131a689dc2b939982cd00c6d497223f1fe104750cca`.
- Metadata, typecheck, lint/format, catalog validation and all 66 tooling tests passed.

## Local SB tests

Used existing SB local-build/practice flow, a Win32 BananaBrain client and x64
StarCraft on Fighting Spirit 1.4. SB commit: `ff167db43053cead7a991a68c224c8d6bf61066d`.
Original AI text data and configuration were copied to an isolated working profile;
read started empty. Bot race was restricted to Protoss for this prototype.

| Run | Observations | End scope |
| --- | --- | --- |
| Opening | 16 Probes, two Pylons, Gateway, Assimilator and Cybernetics Core present; 1,233 accepted commands, zero rejected at frame 3,600 | Automatically stopped after frame 3,629; one result row saved |
| Same-profile restart | 7 Probes; 32 accepted commands, zero rejected at frame 720 | Automatically stopped after frame 734; two result rows saved |

The result-file hash before the second match matched the first match's saved
file. Original result-store code reloads that file and rewrites its result list;
growth from one to two rows confirms reuse in this controlled setup. Owned app
and game processes exited. These were deliberately stopped opening tests, not
naturally completed matches or strength measurements.

## Completed human match

On 2026-10-26, a human played Terran against BananaBrain as Protoss on Fighting
Spirit 1.4 through the normal SB practice UI in the separate `local-bots` profile.
The executable hash matched the build above. The player confirmed the match had
finished; the bot's game log recorded `MatchEnd winner=true frame=9115`, followed
by a clean client finish with 3,243 accepted commands and two rejected commands.
The rejected commands were not diagnosed in this check.

The bot saved one opponent-result row (83 bytes) and a map-specific mining-data
file (6,097 bytes) under its working directory's `bwapi-data/write`. The result
row records frame 9,115 and a win, agreeing with the game log. Persistence was
verified; reuse of these particular files in a later match remains untested.
This is one completed local human match, not a strength evaluation.

## Review package test

On 2026-10-26, packaged the recorded prototype build using the shared native
packager. No bot source or binary changes. The final archive is
`dist/bananabrain-sb-2-review/bananabrain-sb-2.zip`:

- SHA-256: `d2e45d778276e547814add5be873affe34839c2e6a3eeae2bdc60d9be868c87d`.
- 3,287,909 bytes; 294 entries, including source, build information and notices.
- All 12 runtime AI text files match the pinned author source byte for byte.
- Executable SHA-256 matches the prototype build above.
- Build-source metadata points to the fork containing the recorded recipe commit.
- Metadata, typecheck, lint/format, repository validation and all 67 tooling tests
  passed. Archive verification passed; pending review blocks normal packaging and
  catalog admission.

Extracted the final ZIP into a fresh directory and registered its executable
through SB's local-build flow. Both tests used a separate persistent profile,
Protoss against an idle Terran slot on Fighting Spirit 1.4, and the same x64 SB
build recorded above. Working files came from the archive, not the build tree.

| Run | Observations | End scope |
| --- | --- | --- |
| Package opening | 15 Probes, Nexus, two Pylons, Gateway, Assimilator and Cybernetics Core; 433 accepted commands, zero rejected | Deliberately stopped at frame 3,626; result and mining data saved |
| Same-package restart | 7 Probes; 55 accepted commands, zero rejected | Deliberately stopped at frame 805; result file grew from one row to two |

The saved result hash matched before restart and read remained empty. Combined
with the original result store's reload-and-rewrite behavior, the second row
confirms reuse. All owned test app/game processes exited. These are opening and
reload tests, not completed competitive matches or signed-catalog installation.

The archive is review-only: source review is pending and local distribution is
unreviewed. At that stage packaging changes were uncommitted, so those tests
verified local assembly/gameplay, not a committed packaging recipe. The subsequent offline
source rebuild is recorded in the review linked below.
The earlier local `bananabrain-sb-1` archive was superseded to correct its
build-source repository link; it was not published.

## Remaining before admission

The [source/storage review](bananabrain-source-review.md#storage-patch-verification)
records the minimal downstream patch and its earlier development build.
Malformed-input, overflow, stale-read, failed-save and junction/hardlink tests
passed, including all original training data. Patched SB opening/restart tests
accepted 357/63 commands with zero rejections and verified result-file reuse
despite corrupt stale read inputs. Both were deliberately stopped.

A subsequent patched full match against passive Terran completed at frame 3,823:
bot reported victory, 455 commands accepted, zero rejected. Result/mining files
persisted and owned processes exited. See the source review for exact scope/hashes.

Review remains pending. The committed recipe and [sb.3 review package](releases/bananabrain-sb-3.md)
passed guarded build, offline source rebuild, extracted-package full match and
saved-state restart. Complete
crash/disk-full, concurrent-profile, broader gameplay, learning reset and
distribution review. Test additional race/game-architecture combinations; source
supports Terran and Zerg but neither was tested here.

Existing BotSagi binaries, profiles and the published catalog are unchanged.
Prototype and source-import branches were pushed before packaging work.
Packaging/storage and final verification are committed locally; no additional
push or PR creation is included.
