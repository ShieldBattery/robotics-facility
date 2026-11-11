# BananaBrain package

Uses original AIIDE 2025 source/data pinned in `source-lock.json` and recorded in
`imports/bananabrain-aiide2025.json`, plus the source-locked storage patch and shared
`native/storage.hpp`. Native host and BWAPI build are unchanged. See
`docs/bananabrain-prototype-validation.md` for build and
gameplay evidence.

On Windows with Node 24, Visual Studio 2022 and CMake available:

```powershell
node tools/build-bananabrain.ts bananabrain-build
node tools/package-bananabrain.ts .build/bananabrain-build bananabrain-sb-1 --review
```

Build recipe inputs must be committed before the guarded build/package flow.
Earlier development tests used verified prepared source and direct CMake builds,
recorded separately under `.build/bananabrain-storage-build/`. Those development
records cannot be used to package the patched executable. Keep provenance checks
intact and use a fresh build directory and release ID.

The archive includes the executable, pinned source, original AI text files,
configuration, build information and license notices. Extract to an isolated
directory and register `bin/BananaBrain.exe` through SB's local-build flow with
working directory `work`, native runtime and Protoss race. Do not copy files into
the installed game or an existing learning profile.

Current sb.6 changes the fixed configuration to human-opponent mode: UCB1 opening
exploration and original glhf/gg chat, with tournament history behavior retained
and drawing disabled. It remains an experimental review candidate. sb.5 evidence
is historical and does not verify the new executable. See
`docs/releases/bananabrain-sb-6.md` for exact new inputs and validation scope.

Source commit remains unchanged; canonical import location is ShieldBattery's
`source/bananabrain-aiide2025`. Maintainers must host that branch before an upstream-only
fetch is reproducible. Original three nested `.DS_Store` files remain in the pin
but are excluded from packages; lowercase `readme.txt` is required and included.
`--review` remains mandatory while current source/distribution review is pending.

## Offline rebuild from a review ZIP

Extract the archive to a fresh directory, open a Windows command prompt there,
and put CMake on PATH. Only the extracted `source/` plus installed Visual Studio
2022/Windows SDK are needed; no source download or existing `.build` tree:

```bat
cmake -S source/native -B rebuild -G "Visual Studio 17 2022" -A Win32 -DSB_NATIVE_BOT=bananabrain -DBWAPI_SOURCE_DIR="%CD%/source/bwapi" -DBANANABRAIN_SOURCE_DIR="%CD%/source/bananabrain" -DBANANABRAIN_OUTPUT_DIR="%CD%/rebuilt-bin"
cmake --build rebuild --config Release --target BananaBrain --parallel 4
```

This succeeded for the original `bananabrain-sb-2`; see
`docs/bananabrain-source-review.md` for hashes and confirmed storage blockers.
Rebuilding successfully does not approve the original storage behavior.

## Storage regression tests

With Node 24, CMake and Visual Studio available, prepare the source through the
existing hash-checked patch flow and run tests in a fresh directory:

```powershell
node tools/prepare-source.ts bananabrain .build/bananabrain-storage-source
node bots/bananabrain/runtime-tests/run.cjs .build/bananabrain-storage-source .build/bananabrain-storage-tests
```

Tests compile exact patched storage methods against small model stubs, check all
original training data, and exercise malformed records, stale inputs, failed
replacement, input/output bounds, junctions and hardlinks. They do not replace SB
gameplay or full crash/concurrency testing. Fixtures remain in the test directory.

For save-failure and interruption checks, extract a verified review ZIP and pass
its actual `source/native` directory to the separate Windows harness:

```powershell
node bots/bananabrain/runtime-tests/faults.cjs extracted/source/native .build/bananabrain-storage-faults
```

This compiles the packaged helper with wrappers around Windows write, flush and
replacement calls. It injects disk-full errors, short writes and replacement
failure, terminates only its own child before/after atomic replacement, and runs
two writers in separate profiles. It checks retained history and subsequent
reload/save. Interrupted pre-replacement saves leave an ignored temporary file;
idle reset can remove it. The harness does not exhaust a physical disk or permit
multiple writers to share a learning profile.
