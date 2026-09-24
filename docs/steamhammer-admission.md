# Steamhammer admission review

Status: pending. Source/runtime changes and build are under review; no race is
approved for distribution yet. Public competition and human difficulty remain
unreviewed/unrated.

## Source provenance

The author distributes Steamhammer 5.3.6 in a source ZIP rather than an upstream
Git repository. `imports/steamhammer-5.3.6.json` pins that download and records the
source snapshot on `source/steamhammer`. Of 298 original files, 297 are preserved
byte-for-byte; Timer.hpp is omitted because its copyright header supplies no
permission grant. The snapshot adds provenance and missing third-party license
texts. No author-distributed DLL is executed or repackaged. Only the official
strategy configuration was extracted from the binary distribution; its original
hash is also recorded in the import record.

The controlled CMake build selects exactly 102 Steamhammer and 5 RC source files
from the author's Visual Studio projects, plus the shared external host and
separately pinned BWAPI 4.4. There is no BWTA/BOSS binary dependency. The timer is
an independent ShieldBattery std::chrono implementation shared with UAlbertaBot.

## Effects and persistent state

Selected source inspection found no active network client or process spawning
in the bot. Intended file effects are configuration reads, bounded opponent
history and evaluator weights. Fixed configuration disables drawing, optional
logging and input overrides. Runtime patches encode opponent names, use private
write state before read baselines, reject links, bound parsers and file sizes,
and replace learned files atomically. These are source-level observations,
not a complete OS-effect trace or a sandbox guarantee.

The admission record will be completed with the exact patched trees, build,
archive rebuild, storage regressions and live race/architecture results before
source review and local distribution are marked approved.
