# Infested Artosis admission review

Status: approved for experimental local distribution, 2026-09-23. Review by Codex,
including independent source, artifact rebuild, and JVM-boundary checks. Recipe
`5b2c73bd95ebc5eaddab9319a1e0895d842a1227` produced the tested build.
Requires ShieldBattery's Zerg morph/completion fix `46ef63a6d` or later.
Public competition remains unreviewed; human difficulty is uncalibrated.

## Pinned sources and behavior

- Bot: [BradEwing/InfestedArtosis at `203bdaa97da0ec8088dbfdf7514a625f954536fa`](https://github.com/BradEwing/InfestedArtosis/tree/203bdaa97da0ec8088dbfdf7514a625f954536fa), with [the isolated-runtime patch](../patches/infested-artosis/0001-isolate-runtime.patch), SHA-256 `c6a384a4dc81e3bec67eac6709446a170734908f93462b0cd04d46772c1e1407`. Prepared tree: `c8ed4fb8934972785d1587aa16f68bb5b7ca80c6`.
- Agent Starcraft Simulator: [Bytekeeper/ass at `faf1e2be241cbb101785f99f3ef17b9463c619ed`](https://github.com/Bytekeeper/ass/tree/faf1e2be241cbb101785f99f3ef17b9463c619ed), prepared tree `931156442fe1af9597febd81fcbe45e38779d6fc`. The recipe compiles 18 selected simulator files: 14 `org/bk/ass/sim` files excluding `BWAPI4JAgentFactory.java`, plus `BWMirrorUnitInfo.java`, `UnorderedCollection.java`, `FastArrayFill.java`, and `PositionOutOfBoundsException.java`. It does not run ASS Gradle or include its bundled BWAPI4J binary.
- Shared JBWAPI: [JavaBWAPI/JBWAPI at `d6003b0b3a6a27944c979fd8dbc6ec8e3c2c753f`](https://github.com/JavaBWAPI/JBWAPI/tree/d6003b0b3a6a27944c979fd8dbc6ec8e3c2c753f), with [instance discovery](../patches/jbwapi/instance-discovery.patch) SHA-256 `82e1250afeea171440f071431a1f99247da3f392fbb08d9b52829569e9391fc1` and [single-match lifecycle](../patches/jbwapi/0002-single-match-lifecycle.patch) SHA-256 `0409c1f1bed19d5cc81457b1b19848a106bbd108034c471fceeb9375672a3e6b`. Final prepared tree: `6e5ddbca17ab121d01255c13424d580a744f15cf`. These patches apply to this new build; immutable earlier bot releases are unchanged.

The bot's upstream POM requests JBWAPI 2.2.0, ASS 1.1, dotenv, and a Maven assembly.
The controlled recipe instead compiles the pinned bot, selected ASS, and patched shared
JBWAPI directly with JDK 21 targeting Java 8 bytecode. Its JAR main class is `Bot`;
the package selects x64 Java 21. Human difficulty remains uncalibrated, and only Zerg
is a candidate race.

The bot patch removes `.env` and JVM-property strategy/debug overrides, leaving
debug drawing, auto-observer, and optional telemetry disabled. It replaces raw
opponent-name CSV paths with bounded encoded names, checks directory/file links,
contains malformed records, and atomically replaces a bounded history snapshot.
A later match reads its private write snapshot before the packaged read baseline;
Reset learning must restore the empty baseline in the installed profile.
The JBWAPI patches select the assigned `SB_BWAPI_INSTANCE`, bound initial retries
to about 60 seconds and honor interruption, stop a single-match client after pipe
loss without inventing `onEnd`, gate successful connection/probe messages on
debug mode, and reject unit IDs outside the 10,000 shared-memory slots while
growing the unit cache safely. Normal match-end callbacks remain unchanged.
An individual blocking named-pipe read can still outlast the retry deadline;
the launcher retains responsibility for process lifetime.

A source-level trace of the selected bot and ASS files found no active network
client or child-process creation. The bot's reachable file writes are its
bounded opponent history under `bwapi-data/write`; telemetry write code remains
present but is disabled by the fixed configuration. JBWAPI discovers the local
BWAPI game through a Windows shared-memory mapping and named pipe, and JNA loads
the Windows native interface. The package places Java/JNA temporary files in
per-instance `work/tmp` with `-Djava.io.tmpdir=tmp` and `-Djna.tmpdir=tmp`.
These source findings do not establish a complete runtime effect trace:
the focused storage and sampled live observations below cover a narrower scope
than exhaustive monitoring of every operating-system effect.

## Build and package evidence

The clean build record has recipe SHA-256
`9ba88efa2a15d92da907bf3bd1013e52c2f921a3397ae035116c011294a99b97`,
JDK `21.0.11` x64, and `recipeDirty: false`. It records the source pins, patched
trees, four locked dependency roles, and `bin/InfestedArtosis.jar` SHA-256
`bc46e81ddfd04c3cdf7289a676d3c091b569df25634ba7e9d0349b79436f696e`.
JNA and JNA Platform 5.18.1 are the only runtime jars; JetBrains annotations
26.1.0 and Lombok 1.18.48 are compile-only, with Lombok as the sole explicit
annotation processor. Dotenv and BWAPI4J are absent.

| Locked artifact | Role | SHA-256 |
| --- | --- | --- |
| JNA 5.18.1 | Runtime | `260c4b1e22b1db9e110ee441c4f13ce115f841fa48c41d78750986214b395557` |
| JNA Platform 5.18.1 | Runtime | `ad14c1b1ec4f43d396231219dfa635ebf828f738eac9f890ea1bc07795892d9a` |
| JetBrains annotations 26.1.0 | Compile only | `ebc7aec252ed0c7d2d04c039d7f00e69f7b86b1f493c741d67b3ef31b986b054` |
| Lombok 1.18.48 | Processor only | `85477a4655ebb2c074a9099cfb749be454449fee564d4282610df1b85f7c508b` |

The review ZIP is 6,882,363 bytes with 488 entries and SHA-256
`cfb483a213b869164eb5a1e43aeb993f1689e427fd7be15944322a442db48949`.
It contains patched corresponding source, the exact build record and recipe,
both compile-only jars under `source/build-dependencies`, and original notices
for Infested Artosis, ASS, JBWAPI, Java BWEM, JNA/JNA Platform, Lombok, and
JetBrains annotations, plus the Apache-2.0, libffi, and modification notices.
The upstream bot and ASS notices are MIT; JBWAPI and Java BWEM have their
respective MIT notices. Java and upstream `BWAPI.dll` are not bundled.

An independent extraction to `.build/infested-offline-review` ran the packaged
`source/bots/infested-artosis/rebuild.ps1` with JDK 21.0.11 without a network
download or bot execution. The script verified all four dependency hashes,
compiled the packaged sources, and produced 424 classes; all 424 class names
and SHA-256 hashes matched the archived runtime JAR, with zero missing or
extra classes. The compile emitted 32 `sun.misc.Unsafe`/related warnings.
The standalone `SingleMatchLifecycleTest` passed against the final
`.build/infested-check-1/classes` and JNA pair, covering unit-ID capacity
and retry deadline/interruption boundaries. These checks prove source
reproducibility and the exercised JVM boundaries, not a playable match.

The earlier isolated compile probe in `.build/infested-artosis-compile-check`
also produced 424 classes, but used unpatched upstream Infested Artosis source
and only the instance-discovery JBWAPI patch. Its historical class inventory
hash `e462da34d0aa4f443822ac086132fc3c4599ef38f2b0839649756547ec085fd3`
is not the final build's class inventory.

## Sampled x64 runtime and storage evidence

The first attempted match, session `5ab2b667...`, predates the bridge
correction. It reached approximately frame 1700 and ended with a
`ManagedUnit.morph` null-pointer exception. That result diagnosed the bridge
boundary and is excluded from approval evidence.

After ShieldBattery bridge commit `46ef63a6d` corrected Zerg birth and
normalized completion events, x64 session
`a3ddacbd-fc5c-426b-a2ff-b3b29afcd289` ran Infested Artosis game
`bc99f6ad-22fe-4e88-9f9e-59c4fdb25f98` against ZZZKBot game
`bc21b107...`, with observer `c3a75eb9...`. The match ended naturally:
Infested Artosis lost at frame 5025 and its opponent won at frame 5030.
Twenty-one common synchronization probes from frames 0 through 4800 were
identical across the three participants. Ten born-and-completed Zerglings
were observed by frame 3353. Infested Artosis recorded 2,467 accepted and
one rejected command at the final sample; the rejection reason is unknown.

The pair-0 private `bwapi-data/write` copy held one hashed-name opponent
history CSV with a single loss row recording `4Pool`, `EarlyRush`, and
frame 5025. Java and game processes exited through normal owned cleanup.
A sampled JVM memory measurement was 283,987,968 bytes. The sampled runtime inspection
found no TCP/UDP sockets; its child `conhost` was normal Windows console
hosting. During play the observed files in private `work/tmp` were the
JNA-extracted DLL and marker. HotSpot diagnostics and other process/file
effects were not exhaustively traced, so these observations do not establish
an OS sandbox or a complete effect inventory.

The independent `bots/infested-artosis/runtime-tests/run.ps1` harness also
passed against the actual prepared source. It exercised repeated history
use, size and record limits, Random-race compatibility, link rejection,
profile isolation, and junction handling. These are source-level storage
checks; the observed match supplies only one live write example.

## 32-bit concurrent gameplay and lifecycle

Session `99ca70c2-733d-4b48-8d14-88784a131c9f` ran two independent Java 21 x64
processes against x86 SC:R on Fighting Spirit. Game IDs were
`c6cb21b5-f528-4dd9-8541-034316743ec8` and
`e69a985a-cc90-4754-8b02-002737641edd`; observer
`49b43381-f5ec-492f-990a-1d16dbe06cda`. Both produced completed Zerglings,
fought, and built static defense. All 23 shared sync probes through frame 5280
matched across the three clients. Normal leave of the first bot at frame 5300
produced a loss callback and the other bot's win at 5305; this is a lifecycle
check, not a natural defeat or strength measurement. At frame 5280 their command
counters were 2921/0 and 3302/1 accepted/rejected. Each wrote a separate opponent
history with its own result; the earlier ZZZKBot history remained intact.
All three SC:R clients and both JVMs exited. Sampled JVM working sets were
273,244,160 and 287,805,440 bytes, with no TCP or UDP endpoints in either sample.

## Scope and remaining limitations

Approval covers this exact source/patch/dependency set and its reviewed package,
for experimental local Zerg 1v1 use. The runtime observations combine source
tracing, focused malformed-state/reset/isolation tests, and sampled files,
processes and endpoints; they are not an exhaustive syscall trace or an OS sandbox.
The source rebuild and shared Marine Hell packaging regression also passed.
Teams, FFA, unusual maps, broader strategic progression, and human skill remain
unverified. No existing bot release is replaced, and no production publication
is implied by staging. Installed-profile reset and signed-catalog launch are
recorded separately after staging verification.

## Approved artifact

`infested-artosis-sb-1.zip`: 6,882,516 bytes, 488 entries, SHA-256
`9e114acc51d37abf924e8cac1fb233ccd54cb335cc636ca1b23a7a9370200370`.
All 487 entries other than `package.json` are byte-identical to the tested
review archive. The descriptor adds the reviewed local-distribution/source
approvals and experimental 1v1 profile. The package validator verifies its
archive and descriptor hashes.
