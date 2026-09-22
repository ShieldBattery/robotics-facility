# PurpleWave sb.1 review

Review date: 2026-09-22. Intended channel: staging only.

## Inputs and build

PurpleWave is pinned to `a57d2511cc4f6318c2a2d61a504e8f58a7b090af`.
Its JBWAPI, JBWEB, JavaJPS, and mjson dependencies use the exact submodule commits
from that tree, independently recorded in `source-lock.json`. Downstream patches
are hash-checked and applied in isolated prepared trees; pristine sources remain
unchanged. The recipe uses direct Java/Scala compilation, without running upstream
Maven plugins, launch scripts, or downloaded bot executables.

Java 21 x64, Scala 2.12.20, JNA/JNA Platform 5.18.1, and Commons Lang 3.8.1 were
used. The six build dependency jars are size/SHA-256 pinned in
`jvm/dependencies.json`. Five runtime jars are shipped unchanged beside the thin
executable JAR. The compiler is not shipped at runtime.

Two independent prepared-tree builds produced the same executable JAR hash:
`db18998ddcedecfffc2dc4bd4de82c897cbac4b4d3d0542a1f907a19957f9138`.
This establishes repeatability on the tested toolchain, not across arbitrary JDKs.
The final package records exact source trees, recipe revision, and binary hashes.

## Source and saved-state review

The reviewed runtime paths initialize JBWAPI local named mappings and a local named
pipe, parse a fixed JSON configuration, read opponent history and placement caches,
and write history, caches, performance logs, and gathering data. The fixed package
configuration leaves human/livestream/debug/chat modes off, with normal strategy
selection, asynchronous simulation, and 20/35 ms target/limit settings.

The runtime patch:

- Uses the assigned process working directory instead of searching its parents.
- Requires `bwapi-data/AI/PurpleWaveShieldBattery.config.json`.
- Removes the automatic external simulation-visualizer process path and rejects
  simulation-visualizer configuration.
- Encodes externally derived filename components and constrains general data
  reads/writes to their assigned directory.
- Introduces history format v5 with reversible UTF-8 percent encoding for map and
  opponent CSV fields, preserving commas, control characters, and edge spaces.
- Adapts two String line-iteration calls for current JDKs.

The JBWAPI patch selects the discovery table using `SB_BWAPI_INSTANCE`; invalid
identifiers cannot fall back to an unrelated game's default table. Helper tests
exercise length bounds, traversal, separators, Unicode, and newline inputs.

Configuration uses `mjson.Json.read(String)`. The library's optional URL/schema
resolution API is not called by the bot. Runtime source scans and call-path review
found no automatic HTTP/socket or child-process launch path in this configuration.
JNA loads its platform native support through its standard JVM/temp-file mechanism;
this is not an OS sandbox. TCP/UDP endpoint samples of the running Java process
were empty. These samples are not a complete syscall trace.

State belongs in the isolated `work/bwapi-data/read` and `write` directories.
Observed files include `_v5_history_<encoded-opponent>.csv`, opponent log files,
`placement-*.bin.gz`, and `accelerants-map.json`. Placement-cache reads have upstream
compressed/decoded size and structure bounds. Malformed history rows are caught and
skipped by the existing history reader; the codec has standalone counterexample
tests. No seeded learning files are packaged. Reset restores the empty baseline;
compatible state survives updates. v4 history is not imported into the v5 profile.

## Attribution and distribution

PurpleWave is MIT licensed by Dan Gant and contributors. Included notices cover
PurpleWave, JBWAPI, Java BWEM, JBWEB, JavaJPS (including its README license and
Kevin Sheehan attribution), mjson, Scala, JNA/JNA Platform, and Apache Commons Lang.
JNA is distributed under its Apache-2.0 option. Original JAR LICENSE and NOTICE
entries are copied into separately readable package notices. Java is not bundled.

`notices/RELEASE.txt` identifies this as a modified ShieldBattery build, lists
changes and dates, links upstream, and points to included source/rebuild material.
Local distribution and public competition are separate; no competition permission
or author endorsement is claimed.

## Runtime evidence

Windows, Temurin Java 21.0.11 x64, SC:R 1.23.10.13515.

- Java discovery identified the installed major version and architecture.
- The same Java executable/JAR connected to both x86 and x64 SC:R clients.
- Protoss games on Fighting Spirit progressed with commands accepted and clients
  synchronized; the background game window stayed hidden.
- Java needed one-byte BWAPI pipe requests supported by the bridge alongside
  native four-byte requests. Real Windows pipe regressions pass on both arches.
- Normal app shutdown initially killed clients before MatchEnd. The app's bounded
  native-exit phase now permits the callback and profile writes before cleanup.
- Explicit JVM options are required before `-jar`; catalog and BYO parsing retain
  them. The package requests `-Xms128m -Xmx1024m`. Native JVM/JNA allocations are
  additional to the heap cap.

- Full x64 session `e6a7be7e-b9a4-4320-81ca-1d89e1d48ada`: PurpleWave
  defeated ZZZKBot, receiving `MatchEnd(winner=true)` at frame 11756. Its game ID
  was `a33b8e72-897b-4c01-a253-4372b18b4dbe`. At frame 11520 the bridge had
  accepted 24,993 commands and rejected four. The game remained synchronized.
  Opponent history and the normal match log were written in the assigned profile.
- Java's actual command line contained both heap flags. Working-set samples were
  about 827-837 MiB during that match; this is one machine/match, not a maximum.

Resignation session `40f6b30e-83e2-43ff-9b34-24673f3cac12` verified the
updated lifecycle: the human left normally, PurpleWave received a win, saved
history, and the app reported `finished` with native cleanup completed. The local
transport forwards authenticated leave directives with a final-turn fence; the
app allows result delivery before shutting down the remaining client. Code-0 bot
exit waits briefly for its native game result instead of immediately failing the
match. Focused app regressions and native x86/x64 checks cover those paths.

The final archive's runtime JARs and configuration match the live-tested review
package byte for byte. Build provenance includes only public toolchain properties.
Post-publication installation evidence is recorded separately.

## Limits

Only Protoss 1v1 is offered initially. Other upstream races, teams, and FFA are
unverified. Human skill remains uncalibrated. The BWAPI bridge is experimental
and requires the updated development game DLL; tournament-level behavioral
compatibility and performance on low-memory machines have not been established.

## Final archive

`purplewave-sb-1.zip`: 19,381,730 bytes, SHA-256
`fdcf96c648bd8d7de38c2a58e6e17e87f81a60fa748d0ca58058a1e2de19cf7b`.
The package contains 1,120 entries, including the patched source, original notices,
source/patch/dependency locks, build recipe and provenance. Recipe revision:
`6a93089` (the complete commit is recorded in the package).

Source review and local distribution are approved for this staging artifact under
the recorded working-directory contract. Public competition remains unreviewed.
