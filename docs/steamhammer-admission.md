# Steamhammer admission review

Status: **approved for experimental local distribution** of this exact source,
patch, dependency and build set. Terran, Protoss and Zerg are selectable; 1v1
is experimental, teams remain unverified, and FFA is unsupported after the
recorded production stall. Public competition remains unreviewed and human
difficulty uncalibrated. Signed staging installation and app-managed learning reset checks passed as recorded below.

## Source provenance and build

The author distributes Steamhammer 5.3.6 as a source ZIP rather than an upstream
Git repository. `imports/steamhammer-5.3.6.json` pins the 744,441-byte ZIP at
SHA-256 `d7ccc9f54cb8a9b1d11befc136272646767a7fd494dd937924a82e03581ad522`.
The import is revision `c1390b47d4d3e2f8283ae2513ff6479a81f2b27a` (tree
`acd83a90e59a5b48491770ffc7c9f0eeb15f94b0`): 297 of the author's 298
files remain byte-for-byte identical. `Steamhammer/Source/Timer.hpp` is omitted
because its header provides no permission grant; provenance and missing
third-party license texts are added. The official strategy JSON was extracted
from the author's binary distribution (ZIP SHA-256
`afde6ff7a697abae5364c3e6c623aa579524f05e3015f662e4ef7bce379cc83c`,
JSON SHA-256 `d4cfd34a2d311b01b115632c210189e8c6df7c223b6b3eb33c10b547faaeaca4`).
Neither author-distributed DLL is executed or repackaged.

The controlled CMake recipe selects exactly 102 Steamhammer and 5 RC source
files from the author's Visual Studio projects, the shared external host, and
separately pinned BWAPI 4.4. There is no BWTA/BOSS binary dependency. An
independent ShieldBattery `std::chrono` timer replaces the omitted header.

Final candidate `.build/steamhammer-check-5/build-info.json` has SHA-256
`3d740506f9a1c1630143e2b0d0015ac973403427460548fddab1e6a2cb58464b`.
It records recipe revision `70b551132a5a8c23101dd127b21dbd080cca4bb7`,
recipe SHA-256 `38d0240822e75363f41d5e010965084e2099cd26a8591fa4ab1900099e5ce1c2`,
patched BWAPI tree `1e324bf1cf85fd8c033021eb4ce51997c43bc4f0`, and
patched Steamhammer tree `c5cb559840e274d6788dd430a355bd2dacab7591`.
The BWAPI patch SHA-256 is `e35d406e61cef1c5ff28b2bd3202f3f41a1091c83d4b8dcc82236d946cc01ec0`;
the Steamhammer patch SHA-256 is
`24034b0e026335b503b3f49496ee123af6ebe2d6e20cef4c45978d749e4764c1`.
The Win32 Release/static-MSVC executable is
`bin/Steamhammer.exe`, SHA-256
`6dd7cf48feaafecf97472d7e23894064a1cc41a373dd5a70176dda5f0137be71`.
The recorded toolchain is Visual Studio 2022 MSVC 19.43.34810.0, Windows SDK
10.0.26100.0, and CMake 3.31.0. The gameplay scope is recorded below.

## Reviewed effects and persistent state

Selected source inspection found no active network client or process spawning
in the bot. Intended file effects are fixed configuration reads and opponent
history/evaluator weights in a private profile. Fixed configuration disables
drawing, optional logging, chat configuration changes, and environment/input
overrides while retaining the author's all-race strategy choices and learning.
The source patch encodes opponent names into bounded safe filenames, reads its
own write state before read or static baselines, rejects links and reparse-point
paths, caps file and parser allocations, and replaces learned files atomically.
Saved history is bounded to 300 games; learned-file reads are capped at 4 MiB.
These are source-level observations and storage regressions, not a complete OS
effect trace or an OS sandbox guarantee.

The standalone MSVC regression in `bots/steamhammer/runtime-tests/run.ps1`
passed against the check-5 prepared source. It exercises prepared/read/write
precedence, successive writes and reads, oversized and traversal inputs,
malformed evaluator data, distinct encoded opponent names, reset to the read
baseline, sibling-profile isolation, and refusal of a Windows junction in the
write path. The repository's final recorded Node suite passed 66/66 tests,
including Steamhammer recipe closure and source/archive safety checks. Those
suites do not establish gameplay compatibility.

## Bridge and refinery compatibility

ShieldBattery bridge commit `652c1d07f` delivers frame zero and normalizes
mineral field variants to BWAPI's mineral type. Earlier live games exposed
Steamhammer's dependence on both behaviors: skipping frame zero left its base
status uninitialized, and variant mineral types caused repeated worker orders.
Steamhammer's final source patch also exempts refinery construction from its
generic `connectedToStart` test: an occupied neutral geyser tile is not
literally walkable. Native BWAPI geyser/build validity and Steamhammer's
enemy-range safety and own-depot distance checks remain in force.

Stock BWAPI latency compensation predicts a just-issued Build order and marks
the builder as constructing before the server applies it. Steamhammer skips its
placement recheck in that predicted state. The ShieldBattery bridge currently
reports actual constructing state without that prediction, exposing the false
geysers-are-walkable assumption and causing repeated refinery/assimilator
assignment. The narrow refinery patch addresses that assumption; it does not
claim general BWAPI latency-compensation parity.

## Archive and gameplay evidence

The `steamhammer-sb-4` **review-only** archive is 2,284,187 bytes,
SHA-256 `c78d7a177e6fe92973b2a81865bed1c98ce2a6282949638f1b7c12bbb195da46`.
Its embedded manifest SHA-256 is
`3672125137bed8d73420e6513c570c92d13f2c196f7070cf8a85ebe28b5bd4f9`;
its review catalog SHA-256 is
`facbea089ff06e58f89de5c2dae194148924f642b8a9ec6c56c610430e611b69`.
This review-4 archive packages the final check-5 build with the refinery patch.
The independent extracted-archive review found 419 source files matching the
prepared sources exactly, 9 matching notices, and only the expected Win32
`Steamhammer.exe` binary (x86, importing `KERNEL32`). Its packaged source
passed the standalone storage/parser harness and an offline CMake/MSVC rebuild.
The rebuilt executable SHA-256 is
`f0d2c43fa788c9a60566895aae45f0dd09375a03c730f17a2b2aec4e523207cd`,
which differs from the packaged executable, so the rebuild confirms compilation
from packaged source, not byte-for-byte reproducibility. The archive retains review-only metadata; the approved package preserves
its executable, configuration and source bytes.

Earlier check-4 live probes recorded 31 common x64 sync probes through frame
7,200 for Protoss/Zerg and 51 x86 probes through frame 12,000 for
Terran/Protoss with zero reported mismatches. Those games exposed failed gas
construction and are excluded from final admission proof. Match `516b7e9d`
is also excluded: its x64 game DLL came from a stale `dist` copy that did not
contain the final duplicate-frame guard. Final-build observations follow.

## Final-build gameplay observations

All sessions below use the check-5 executable and ShieldBattery bridge
`652c1d07f`, with the installed test DLL hashes checked against build output.
The map is Fighting Spirit 1.3. These are compatibility observations, not
human strength measurements or exhaustive strategic coverage.

- **Terran/Protoss, x64:** session `1161aee6-1cff-4fbb-a994-3c99656925b3`,
  observer `ef7997ca-09f1-4f60-8ab2-0272b2c65e81`, Terran
  `60fbfc07-3bd0-411e-a127-ac1e8411ac9f`, Protoss
  `9653cf39-7309-4f48-a2ec-fe7315093769`. All 37 common sync probes through
  frame 8640 matched. Each bot received exactly one frame-zero callback.
  Both gathered gas; Terran completed refineries, a factory, starport, armory,
  comsat and Vulture, while Protoss attacked with Zealots and destroyed a
  Terran expansion. Normal Terran concession produced its loss at frame 8677
  and the opponent's win at 8682; both external clients disconnected and exited.
  The private matchup histories and evaluator files were saved.
- **Three races concurrently, x86:** session `8815287f-a193-49cc-b2d3-faefad152a2e`,
  observer `5e066ccb-77bf-4cdf-8b3e-177fc0283f5e`, bots
  `7774bdcd-8b16-4810-ba6b-58dbd01f3bcf`,
  `37497eab-112d-4117-8d37-983eec885f18`, and
  `f047883a-1747-4681-8f8e-f7a711d9b767`. All 25 common sync probes through
  frame 5760 matched, with one frame-zero callback per bot. Terran built a
  refinery and collected gas; Protoss completed an Assimilator, Cybernetics
  Core and Dragoon, and collected gas. Zerg mined but stalled at six Drones
  without further production, so this is not successful Zerg or FFA evidence.
  Normal observer leave ended all three bots at frames 5814-5815 and their
  processes exited. The following 1v1 sessions verify Zerg separately.
- **Zerg/Protoss, x86:** session `bfdd128d-f206-453a-a34e-ed06b63001d9`,
  observer `d4ffac1b-83ed-4ccf-9ff6-33dfaa6fcd34`, bots
  `5ca49c7a-2e9d-40df-9034-d273e2dd7c8c` and
  `e2506135-0106-408e-b2dd-770f01e6f19e`. All 27 common probes through
  frame 6240 matched, with one frame-zero callback each. Zerg completed two
  Hatcheries, Zerglings, Sunkens and Extractors, collected gas, and defended
  against attacking Zealots. Normal Zerg concession gave loss/win callbacks
  at frames 6375/6380 and both external processes exited.
- **Zerg/Protoss, x64:** session `f2baf8e1-b31f-4f51-a262-16efd0418161`,
  observer `1d2540cf-c126-45a0-aa9a-b9ea857c3773`, bots
  `24fb45b6-3436-4c2b-848f-8068f690e0c3` and
  `c4ac944d-da69-44cf-850c-c68df38d1bdf`. All 28 common probes through
  frame 6480 matched, with one frame-zero callback each. Zerg completed two
  Hatcheries, its Pool, thirteen Zerglings and two Sunkens; attack orders
  were observed. Normal Zerg concession gave loss/win callbacks at frames
  6567/6572, followed by process exit. This session did not verify Zerg gas
  collection on x64; the x86 match above did.

Separate race working directories retained opponent histories and matchup
evaluators across successive launches. After the final checks, the Zerg and
Protoss reciprocal histories each contained five records, and the Terran and
Protoss reciprocal histories each contained four. These counts include earlier
diagnostic sessions; they demonstrate persistence, not five/four approved games.
A sampled pair of native bot processes used about 21 MB working set each and
had no TCP/UDP endpoints at the sample. This is not a performance benchmark or
complete runtime-effect audit.

## Scope and remaining limitations

The x86 Terran final-build evidence comes from the concurrent three-player
smoke test; its final-build 1v1 combat test used x64. The other two races have
final-build 1v1 evidence on both architectures. Tests exercised mining, gas
construction, early production, some tech and combat, normal end callbacks and
private learning writes; they do not establish complete BWAPI conformance or
late-game strategic correctness. The exact FFA production gate was not proven.
Steamhammer's strategy code and BWAPI's enemy accessor assume one opponent, and
the observed stall is sufficient to withhold FFA support for this release.

No production publication or public tournament permission is implied.

## Approved artifact

`steamhammer-sb-1.zip`: 2,284,425 bytes, 464 entries, SHA-256
`e4a784d2db74db9867e89d70a7b04effa21a9a16b783bdc9ca6cf1450b1429cc`.
All 463 entries other than `package.json` are byte-identical to the final
review archive. The descriptor adds reviewed approvals and tested capability
metadata; no executable, configuration, source, patch or notice bytes changed.

## Signed staging installation and profile reset

[Staging workflow 35956424379](https://github.com/ShieldBattery/robotics-facility/actions/runs/35956424379)
published revision 12 successfully, with the immutable `published/12.json`
receipt available. Linux and Windows admission CI also passed. The isolated
ShieldBattery app verified the signed catalog and installed `steamhammer-sb-1`
without install failures. The prerelease retains the exact reviewed ZIP.

Two installed copies launched through `practiceGameStart` using catalog keys
in sessions `7bc08300-3034-4e0e-8327-d4f6ae43c27a` and
`5e66579d-cba1-4b54-b50b-64c16f736ff9`, with Terran and Zerg on x64 SC:R.
Both launches reached gameplay using the cached map and local transport; no
backend dev server was needed for these checks. Bot windows were hidden and
normal concessions ended their processes. This checks installed launch and
state lifecycle, not additional full-match strategy coverage.

The app created separate persistent `work` and `work-2` directories. Each
wrote its own matchup evaluator and encoded-name opponent history. Reset was
rejected while the bot was active. After the second launch each history had
two records, and the entire first saved record was preserved. Idle reset
succeeded and restored empty read/write baselines in both profiles. Their
fixed configuration hashes remained unchanged, as did all 459 installed
package files. The app reported no active leases or install failures.

All game and bot processes belonging to this isolated test profile, and its
Electron app, were stopped. Other developers' clients were left alone.
Production publication was not run.
