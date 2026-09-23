# Marine Hell admission review

Status: scoped source review and local distribution approved, 2026-09-23.
Published in signed staging catalog revision 9; fresh app installation and
x86 launch verified from the CDN package.

## Inputs and intended role

- Upstream: [libor-vilimek/marine-hell at `672da02d0fcf2d4b3546d4a0f7770a9aa3a28e2e`](https://github.com/libor-vilimek/marine-hell/tree/672da02d0fcf2d4b3546d4a0f7770a9aa3a28e2e), Git tree `3a642842beb0712e11fac0a47bc34d01933c3759`. Original `src/TestBot1.java` SHA-256: `0e353f07ab45785573f787a1e84a9111942f016d9aabf64131ef71117e29ecd0`.
- Downstream: [`0001-use-isolated-jbwapi.patch`](../patches/marine-hell/0001-use-isolated-jbwapi.patch), SHA-256 `f5673b4b6f0a7a67d61ba0be6ba44ebeaa3e674fb8aa3fa26dd8b4ceb9d1b663`. Patched `src/TestBot1.java` SHA-256: `bc1dfed429a1de47562b58fb4daf9169e78a96a8e3d000d9aa373fc1ae13ae48`. The patch applies cleanly to the upstream commit.
- Bunker adapter: `0002-load-bunker-with-right-click.patch`, SHA-256 `8f38bd8e7cc9f96320321abdb582b5210ea2f15b6c1a24d119581c60e102ebfe`. Final patched Java source SHA-256 `818f5cce5496fea3265027a91a05e753993ea61ac20922a13e82ef3e3131ee60`; final executable JAR SHA-256 `c414bcab47675b0f8f332ee56cee1444b639ec037b22267287525cbad4bcdfef`.
- Bridge candidate: reviewed JBWAPI source `d6003b0b3a6a27944c979fd8dbc6ec8e3c2c753f` (POM 1.5.1), with [instance-discovery patch](../patches/jbwapi/instance-discovery.patch) SHA-256 `82e1250afeea171440f071431a1f99247da3f392fbb08d9b52829569e9391fc1`. The Java dependency hashes are pinned in `jvm/dependencies.json`; the build records exact source, patch, toolchain, and recipe input digests.

The author's [README](https://github.com/libor-vilimek/marine-hell/blob/672da02d0fcf2d4b3546d4a0f7770a9aa3a28e2e/readme.md) describes a simple Terran mass-Marine bot that gathers at a choke and attacks after about 50 Marines. This makes it a plausible lower-end variety candidate, not an established human difficulty tier. The original and this port have no calibrated human skill; keep `humanSkill` uncalibrated and restrict any initial profile to Terran 1v1.

## Port scope and source behavior

The pinned source is one [Java file](https://github.com/libor-vilimek/marine-hell/blob/672da02d0fcf2d4b3546d4a0f7770a9aa3a28e2e/src/TestBot1.java). It imports BWMirror's `Mirror` and BWTA. The patch starts JBWAPI's `BWClient`, passes its `Game` to `BWTA.readMap(game)`, and uses the matching JBWAPI unit constants. JBWAPI's BWTA facade uses Java BWEM for the choke, base, and path calls used by the bot. This route does not need the upstream `bwmirror_v2_5.jar`, `bwapi_bridge2_5.dll`, `libgmp-10.dll`, or `libmpfr-4.dll`; do not copy those legacy binaries into the proposed package.

The port removes per-frame game-speed changes and debug drawings/chat. It uses no `UserInput` or `CompleteMapInformation` flag. The map analysis supplies terrain/chokes and potential starting locations; enemy building positions enter its memory only through observed enemy units. A bounded fallback to the bot's own start position handles maps with no analyzed choke. A missing Command Center, empty base list, or fewer than eight workers no longer causes the known null/index failure. The bunker adapter uses native right-click on the same own bunker instead of the unsupported BWAPI Load command. The 20-frame production cycle, 20-worker production threshold, six-Barracks production threshold, bunker-builder threshold, 50-Marine attack trigger, and 40-Marine continuation threshold remain unchanged. No deliberate weakening was added.

No explicit file, network, child-process, or environment API occurs in the bot Java source. The selected JBWAPI connector uses local BWAPI shared memory and a named pipe; it prints connection diagnostics to the runner-owned log. Two independently selected instances connected successfully through the external bridge. Java BWEM map analysis did not show filesystem calls in the reviewed source. The original BWMirror/JNI behavior and bundled library licenses are not inherited because those files are excluded from this port.

## Licensing and build verification

Marine Hell's MIT license credits libor-vilimek. The archive includes its exact
patched source and original notice, JBWAPI and Java BWEM MIT notices, both JNA
JARs' original notices, the full Apache-2.0 text elected for JNA/JNA Platform,
and the separate MIT notice for libffi embedded in JNA's native support. The
libffi notice is pinned to JNA 5.18.1 (SHA-256
`097eee0a217d07a7b298a0e9e725313884582275a2ec95e01c7c7168d1b087de`).
Java, BWAPI.dll, and the legacy BWMirror/GMP/MPFR binaries are not bundled.
`notices/RELEASE.txt` and structured package modifications disclose the port,
state isolation, safeguards, and omitted speed/debug effects.

The package uses Java 21 x64, tested with Temurin 21.0.11. Bytecode version 52
alone does not establish Java 8 runtime compatibility, so Java 8 is not advertised.
The JAR was rebuilt offline from the review archive's included sources and
locked JNA JARs. Recipe checks reject dirty build inputs, altered binary bytes,
and altered prepared source; non-review packaging rejects unapproved candidates.

The corrected recipe is `de430f1` (`marine-hell-check-6`). Its review ZIP
contains 146 entries and was independently checked against all source trees,
ordered patches, build records, runtime JAR hashes, and eight notices.

## Live checks and remaining boundaries

Tests use cached Fighting Spirit 1.3, a separate Electron profile, local transport,
legacy unit limits, and the same Java 21 x64 runtime. Background SC:R clients
suppress sound, visible windows and replays. Human difficulty is uncalibrated;
no game against a human here establishes a novice or ladder-equivalent rating.

- x64 SC:R test `730cf641-6db6-490e-94b8-e509fffc1889`: connected, produced
  workers, supply, barracks and Marines; survived early worker losses without a
  Java exception. MatchEnd reported winner at frame 10056 after the human slot
  left/lost; this is a lifecycle check, not a claim of playing strength.
- x86 SC:R test `9b6d786b-08a4-4647-b0b2-949083dccc0f`: two independent Java
  processes and working directories, observed through frame 17679. All 74 common sync probes (frames 0-17520) matched across all three clients. Both built
  bunkers and six barracks, trained large Marine armies and fought. The final
  samples had 56/50 Marines (51/47 complete). Leaving the observer normally
  stopped all three SC:R processes with exit code zero and both JVMs disappeared.
- That longer test exposed unsupported BWAPI Load commands. The second patch changes only the own-bunker load call to native right-click.
  In corrected x64 session `81a818e3-7492-4617-9633-c3e98451520b`,
  the read-only BWAPI snapshot showed three Marines actually loaded at frame
  5305. This establishes entry, beyond command acceptance alone.
- The two JVMs sampled around 247-265 MB working set, with no TCP/UDP endpoints
  in the process snapshot and no bot-created files in their instance folders.
  This is sampled evidence, not an OS sandbox or exhaustive syscall trace.
  HotSpot also created its normal 64 KiB diagnostic files under global temporary
  `hsperfdata_Travis`; these are runtime diagnostics, not persistent learning.

The bot contains no learning state. JVM/JNA temporary files use the per-match
`work/tmp` directory and are discarded by the runner's existing cleanup.
No user reset/migration is needed for this profile. Java initialization and
terrain analysis still consume CPU and memory; this is a simple strategy, not
an assurance of negligible runtime cost.

Unverified cases remain explicit: teams, FFA, unusual/island maps, no-choke or
empty-terrain maps, injected crashes and lost-Command-Center scenarios. Null and
index safeguards for these are source-reviewed but not all forced in live games.
Public competition is a separate permission/review decision.

The initial long test logs confirm both replay autosave and LastReplay copy were
suppressed. The corrected hidden client reported `windowVisible: false`,
893 skipped HD asset loads, and no skipped simulation/render hooks.

Play-style tags are `bio` and `defensive`: the shipped strategy builds an
infantry force, gathers at a defended choke/bunker, then moves out after its
Marine-count threshold. No learning, varied-opening, or human-skill label is inferred.

## Release artifact

`marine-hell-sb-4.zip`: 3,784,197 bytes, SHA-256
`777703249cd4cdebb45ae4ab936600cc7f58af7804aa6d2d6c6c81cecb2e8688`.
Every source, binary, notice, and working-directory byte matches the tested
corrected review archive; only `package.json` changes for the release ID,
profile evidence, and scoped approvals. Published in signed staging catalog revision 9 through
[workflow 35849089388](https://github.com/ShieldBattery/robotics-facility/actions/runs/35849089388).
Independent CDN readback verified the current catalog, immutable catalog and
publication receipt signatures, revision, cache headers, and exact ZIP bytes.
Production was not changed.

The corrected x64 pair reached frames 7707/7708 with four Marines loaded in each
bunker. All 33 common sync probes through frame 7680 matched across three clients;
both bots still had zero rejected commands at frame 7680. Normal observer quit
stopped all owned SC:R and Java processes.

## Installed package check

The real Electron library refreshed signed revision 9, downloaded and installed
`marine-hell-sb-4`, and exposed the bundled libffi notice and modification
disclosure through the notice API. It automatically selected detected Java 21
x64 (rather than the also-detected Java 8) and launched through
`practiceGameStart` with x86 SC:R in session
`4a855c53-6a6b-40db-8978-92033f032537`. The hidden bot reached frame 6103 with
two Marines inside its bunker. All 28 common probes through frame 6480 matched;
the last command sample had zero rejections. The library marked Marine Hell
in use and did not report learning data. A process snapshot found no bot JVM
TCP/UDP endpoints; sampled working set was about 226 MB.

All 45 repository tests pass. Offline recompilation from the corrected archive
and the package integrity negative checks pass. Catalog-unavailable launch and
forced-crash behavior were not re-tested for this release.

Normal human-client quit returned the library to no bots in use, both SC:R
processes exited with code zero, and the JVM stopped. The dedicated test Electron
instance was then closed; the user app and existing development servers remained running.
