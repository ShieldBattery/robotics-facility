# Marine Hell admission checkpoint

Status: source port and compile check only, 2026-09-23. No bot binary,
upstream script, or live game was run. Source review and local distribution
remain pending; this checkpoint does not approve catalog publication.

## Inputs and intended role

- Upstream: [libor-vilimek/marine-hell at `672da02d0fcf2d4b3546d4a0f7770a9aa3a28e2e`](https://github.com/libor-vilimek/marine-hell/tree/672da02d0fcf2d4b3546d4a0f7770a9aa3a28e2e), Git tree `3a642842beb0712e11fac0a47bc34d01933c3759`. Original `src/TestBot1.java` SHA-256: `0e353f07ab45785573f787a1e84a9111942f016d9aabf64131ef71117e29ecd0`.
- Downstream: [`0001-use-isolated-jbwapi.patch`](../patches/marine-hell/0001-use-isolated-jbwapi.patch), SHA-256 `f5673b4b6f0a7a67d61ba0be6ba44ebeaa3e674fb8aa3fa26dd8b4ceb9d1b663`. Patched `src/TestBot1.java` SHA-256: `bc1dfed429a1de47562b58fb4daf9169e78a96a8e3d000d9aa373fc1ae13ae48`. The patch applies cleanly to the upstream commit.
- Bridge candidate: reviewed JBWAPI source `d6003b0b3a6a27944c979fd8dbc6ec8e3c2c753f` (POM 1.5.1), with [instance-discovery patch](../patches/jbwapi/instance-discovery.patch) SHA-256 `82e1250afeea171440f071431a1f99247da3f392fbb08d9b52829569e9391fc1`. The actual release recipe and artifact inputs are not yet pinned for Marine Hell.

The author's [README](https://github.com/libor-vilimek/marine-hell/blob/672da02d0fcf2d4b3546d4a0f7770a9aa3a28e2e/readme.md) describes a simple Terran mass-Marine bot that gathers at a choke and attacks after about 50 Marines. This makes it a plausible lower-end variety candidate, not an established human difficulty tier. The original and this port have no calibrated human skill; keep `humanSkill` uncalibrated and restrict any initial profile to Terran 1v1.

## Port scope and source behavior

The pinned source is one [Java file](https://github.com/libor-vilimek/marine-hell/blob/672da02d0fcf2d4b3546d4a0f7770a9aa3a28e2e/src/TestBot1.java). It imports BWMirror's `Mirror` and BWTA. The patch starts JBWAPI's `BWClient`, passes its `Game` to `BWTA.readMap(game)`, and uses the matching JBWAPI unit constants. JBWAPI's BWTA facade uses Java BWEM for the choke, base, and path calls used by the bot. This route does not need the upstream `bwmirror_v2_5.jar`, `bwapi_bridge2_5.dll`, `libgmp-10.dll`, or `libmpfr-4.dll`; do not copy those legacy binaries into the proposed package.

The port removes per-frame game-speed changes and debug drawings/chat. It uses no `UserInput` or `CompleteMapInformation` flag. The map analysis supplies terrain/chokes and potential starting locations; enemy building positions enter its memory only through observed enemy units. A bounded fallback to the bot's own start position handles maps with no analyzed choke. A missing Command Center, empty base list, or fewer than eight workers no longer causes the known null/index failure. The 20-frame production cycle, 20-worker cap, six-Barracks cap, bunker-builder threshold, 50-Marine attack trigger, and 40-Marine continuation threshold remain unchanged. No deliberate weakening was added.

No explicit file, network, child-process, or environment API occurs in the bot Java source. The selected JBWAPI connector uses local BWAPI shared memory and a named pipe; it prints connection diagnostics by default, so quiet operation and its native/JNA effects still require artifact-level review. Java BWEM map analysis did not show filesystem calls in the reviewed source. The original BWMirror/JNI behavior and bundled library licenses are not inherited because those files are excluded from this port.

## Licensing and verification

Marine Hell's [MIT license](https://github.com/libor-vilimek/marine-hell/blob/672da02d0fcf2d4b3546d4a0f7770a9aa3a28e2e/LICENSE) credits libor-vilimek. This is a ShieldBattery-modified Java source build; release disclosures must identify the JBWAPI port, omitted legacy bridge, runtime safeguard and speed/debug changes, and include the exact patched source and original MIT notice. JBWAPI and its bundled Java BWEM have separate MIT notices. Review the final JNA/JNA Platform and BWAPI DLL notices and any LGPLv3 source/replacement obligations under the [licensing policy](licensing-and-attribution.md). Inspect the actual package archive before marking local distribution approved.

`javac 21.0.11 --release 8 -Xlint:-options` compiled the patched source against the reviewed PurpleWave release-5 JBWAPI 1.5.1 classes. This proves Java source/API compatibility with that class set, not a runnable Marine Hell package or game behavior. `git apply --check` passed against the untouched upstream clone; `git diff --check` passed in patchwork.

Acceptance before admission:

1. Record Marine Hell and JBWAPI patch hashes in the source lock, build a Java 8-compatible JAR from isolated prepared sources, package the reviewed BWAPI bridge, and record the exact toolchain, dependency, archive, and notice hashes.
2. Run fresh install, normal Terran 1v1, repeated-match, concurrent-instance, x86/x64 game, offline, crash/shutdown, and reset tests. Trace file, process, network, and BWAPI IPC activity.
3. Test low-worker openings, a lost Command Center, zero analyzed bases/chokes, bunker behavior, and the transition from choke defense to the 50-Marine attack. Verify the runner controls game speed and no debug drawing or hidden enemy information is used.
4. Review the final patched source, package contents, licensing disclosure, and measured human experience before assigning any difficulty tier or publishing a catalog record.
