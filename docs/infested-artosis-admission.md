# Infested Artosis admission review

Status: isolated source-compile checkpoint, 2026-09-23. A controlled `javac`
probe compiles the pinned bot, selected ASS, and shared patched JBWAPI sources.
No upstream build script or bot was run. No bot JAR or package was made, and no
live match was played.
`sourceReview` and `localDistribution` remain pending; this note does not
approve catalog publication or public competition.

## Pinned inputs and role

- Bot source: [`BradEwing/InfestedArtosis` at `203bdaa97da0ec8088dbfdf7514a625f954536fa`](https://github.com/BradEwing/InfestedArtosis/tree/203bdaa97da0ec8088dbfdf7514a625f954536fa). The isolated research clone was clean at that commit.
- Shared JBWAPI source: [`d6003b0b3a6a27944c979fd8dbc6ec8e3c2c753f`](https://github.com/JavaBWAPI/JBWAPI/tree/d6003b0b3a6a27944c979fd8dbc6ec8e3c2c753f) with the existing instance-discovery patch; prepared index tree `b4390bcad94deed33686ff6ec79898832c210c90`. The bot requests JBWAPI 2.2.0 (`0680856df175f15330c18e0148a0fb87b27d454d`), but the shared pin compiled with the bot. Runtime behavior still needs review.
- Agent Starcraft Simulator (ASS) 1.1 resolves to [`faf1e2be241cbb101785f99f3ef17b9463c619ed`](https://github.com/JavaBWAPI/ass/tree/faf1e2be241cbb101785f99f3ef17b9463c619ed). The source-only probe selects 14 `org/bk/ass/sim/*.java` files other than `BWAPI4JAgentFactory.java`, plus `info/BWMirrorUnitInfo.java`, `collection/UnorderedCollection.java`, `collection/FastArrayFill.java`, and `PositionOutOfBoundsException.java`.
- The [POM](https://github.com/BradEwing/InfestedArtosis/blob/203bdaa97da0ec8088dbfdf7514a625f954536fa/pom.xml) targets Java 8 and packages `Bot` as a JAR with dependencies. It requests JBWAPI 2.2.0, ASS 1.1, Lombok 1.18.48 (`provided`), JetBrains annotations 26.1.0, JUnit 5.14.4 (`test`), and dotenv-java 2.3.2. The isolated probe compiles directly from source and does not execute that Maven build or include its test dependencies.
- [README](https://github.com/BradEwing/InfestedArtosis/blob/203bdaa97da0ec8088dbfdf7514a625f954536fa/README.md#L6) identifies a Zerg bot with macro, scouting, and adaptive opener/unit-mix selection. [BuildOrderFactory](https://github.com/BradEwing/InfestedArtosis/blob/203bdaa97da0ec8088dbfdf7514a625f954536fa/src/main/java/strategy/BuildOrderFactory.java#L73) registers aggressive and economic openers and matchup builds. Human difficulty and the exact shipped build's strength are **uncalibrated**; do not label it beginner or derive a human rating from ladder results.

## Source behavior and required adaptations

[`Bot.main`](https://github.com/BradEwing/InfestedArtosis/blob/203bdaa97da0ec8088dbfdf7514a625f954536fa/src/main/java/Bot.java#L246) creates one `BWClient` and calls `startGame()`. The shared JBWAPI pin defaults to `autoContinue=false` after a completed game, but its connection loop can reconnect after a disconnect. The Windows connector uses BWAPI's local shared-memory game list and named pipe. No active Java network client or child-process creation call was found in `src/main/java`; upstream workflows and batch scripts were not executed and are outside the proposed runtime recipe.

The [reviewed PurpleWave JBWAPI instance patch](../patches/jbwapi/instance-discovery.patch) applies to the shared 1.5.1 source pin used in the compile probe. The bot does not call the 2.2.0-only configuration builder or the removed `Game.*Unsafe` methods; the shared pin compiled without an API patch. JBWAPI 2.2.0 fixes a `Game.unitCreate` array-boundary bug (`id >= units.length`) still present in 1.5.1, so the older runtime path needs targeted review. If 2.2.0 proves necessary, the instance patch must be ported to its relocated `ClientConnectionW32.getGameTable()` code and separately pinned. Verify simultaneous-instance selection, protocol `10003`, reconnect and quiet-output behavior, and actual SC:R matches with the chosen runtime; compilation alone proves none of these.

[`LearningManager`](https://github.com/BradEwing/InfestedArtosis/blob/203bdaa97da0ec8088dbfdf7514a625f954536fa/src/main/java/learning/LearningManager.java#L89) constructs `{opponentName}_{opponentRace}.csv` from the raw enemy name. [`LearningHistoryRepository`](https://github.com/BradEwing/InfestedArtosis/blob/203bdaa97da0ec8088dbfdf7514a625f954536fa/src/main/java/learning/LearningHistoryRepository.java#L17) reads `bwapi-data/read` and writes `bwapi-data/write`; it does not read its own write file. The write directory must already exist. Every completed match attempts a write, but I/O failure is swallowed at [game end](https://github.com/BradEwing/InfestedArtosis/blob/203bdaa97da0ec8088dbfdf7514a625f954536fa/src/main/java/learning/LearningManager.java#L115). A malformed CSV numeric field can throw an unchecked exception during startup ([GameRecord.java](https://github.com/BradEwing/InfestedArtosis/blob/203bdaa97da0ec8088dbfdf7514a625f954536fa/src/main/java/learning/GameRecord.java#L38)). Encode and bound opponent filenames, reject path escapes and reparse points, contain bad history, provision per-instance directories, and copy or promote compatible writes into the next game's read snapshot. Keep reset and updates aligned with the [profile state policy](source-review-and-state.md#persistence-contract-and-reset).

[`Config`](https://github.com/BradEwing/InfestedArtosis/blob/203bdaa97da0ec8088dbfdf7514a625f954536fa/src/main/java/config/Config.java#L60) reads an optional `.env` plus environment/JVM settings for strategy overrides, debug drawing, auto-observer, and telemetry. Missing `.env` is ignored; malformed entries are not explicitly ignored. Telemetry flags default off. Enabled loggers write CSVs under `bwapi-data/write` through [TelemetryWriter](https://github.com/BradEwing/InfestedArtosis/blob/203bdaa97da0ec8088dbfdf7514a625f954536fa/src/main/java/telemetry/TelemetryWriter.java#L23). Do not ship development overrides in the default profile.

## Controlled compile checkpoint

The ignored `.build/infested-artosis-compile-check/` directory records
`compile-command.json` and `compile-command.txt` (the exact JDK 21.0.11
`javac -source 8 -target 8` invocation), `sources.args`, `dependencies.json`,
`javac.log`, `exit-code.txt`, and a per-class `class-inventory.json`. The
explicit annotation-processor path contained only verified Lombok 1.18.48.
Before invoking it, the probe checked its Maven Central SHA-256 and size,
embedded MIT license, official POM license/source pointer, and
`META-INF/services/javax.annotation.processing.Processor` registration.

| Dependency | Probe role | SHA-256 |
| --- | --- | --- |
| JNA 5.18.1 | Runtime; existing JVM pin | `260c4b1e22b1db9e110ee441c4f13ce115f841fa48c41d78750986214b395557` |
| JNA Platform 5.18.1 | Runtime; existing JVM pin | `ad14c1b1ec4f43d396231219dfa635ebf828f738eac9f890ea1bc07795892d9a` |
| dotenv-java 2.3.2 | Runtime; Apache-2.0 | `4b9dd7c095d80d8a140d92c610224449772cc7b07dcb6963535cc23efc503e43` |
| JetBrains annotations 26.1.0 | Compile; Apache-2.0 | `ebc7aec252ed0c7d2d04c039d7f00e69f7b86b1f493c741d67b3ef31b986b054` |
| Lombok 1.18.48 | Compile-time processor; MIT | `85477a4655ebb2c074a9099cfb749be454449fee564d4282610df1b85f7c508b` |

The probe compiled 194 bot, 18 selected ASS, and 95 patched JBWAPI Java
sources: 307 files total. `javac` exited zero and produced 424 class files.
The deterministic class inventory hashes each relative path and class bytes,
separated by NUL bytes; its aggregate SHA-256 is
`e462da34d0aa4f443822ac086132fc3c4599ef38f2b0839649756547ec085fd3`.
No class or constant-pool reference to BWAPI4J appeared, and no second
JBWAPI source tree or JAR was used. The log has 36 warnings, primarily from
Java 8 source/target options and the shared JBWAPI use of `sun.misc.Unsafe`.
No runtime patch was made for this candidate. No bot was launched or package
created; the compile probe does not establish runtime compatibility, safe
persistence, or distribution approval.

ASS 1.1's full Gradle recipe depends on JBWAPI 0.8.2 and a bundled prebuilt
`lib/BWAPI4J.jar`. The selected source closure avoids both; the compiled
classes still need a source-locked release recipe and final package review.
The existing JVM dependency lock supplies the JNA pair, while the other
three probe artifacts need release pins if this approach is adopted. JUnit
5.14.4 is test-only and was not used in this compile.

## Distribution evidence and acceptance

The bot's [MIT license](https://github.com/BradEwing/InfestedArtosis/blob/203bdaa97da0ec8088dbfdf7514a625f954536fa/LICENSE) credits Jasper Geurtz and Brad Ewing. JBWAPI and ASS have MIT notices; ASS credits Dennis Waldherr. dotenv-java and JetBrains annotations use Apache 2.0, and Lombok uses MIT as a build-time processor. The bundled `BWAPI.dll` has SHA-256 `f2e0f937e9592157656118fa7e5ff30c2327694ed56c1d8f55687972ad97d308`, identical to the previously reviewed PurpleWave copy. BWAPI's LGPLv3 notice and replacement/source obligations require release-specific treatment. Pin the final runtime artifacts, preserve their exact notices and corresponding source, and review the final package before assigning local-distribution approval. Java itself is not assumed bundled.

Acceptance before catalog admission:

1. Turn the compile probe into a committed source-locked build and package recipe. Pin artifact bytes, review build-time tools and final notices, and record exact source/patch/build provenance.
2. Test the chosen JBWAPI runtime's unit creation, instance discovery, protocol, commands, lifecycle, quiet output, and x86/x64 SC:R matches. Port the instance patch only if adopting the separate 2.2.0 source pin.
3. Patch and test opponent-name storage, malformed CSV/config, per-instance read/write promotion, repeated matches, reset, updates, and concurrent workers without shared writable history.
4. Trace file, process, and network activity for fresh install, normal match, malformed inputs, crash/shutdown, offline run, and reset; compare it with the declared package permissions.
5. Review the final package and source disclosures under [licensing and attribution policy](licensing-and-attribution.md); benchmark the shipped profile against humans before assigning any difficulty tier.
