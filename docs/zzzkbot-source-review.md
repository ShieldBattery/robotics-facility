# ZZZKBot source review

The release-specific artifact decision and runtime evidence are recorded in
[zzzkbot-sb-1](releases/zzzkbot-sb-1.md); the checklist below describes the broader
production review scope.

Status: scoped source review completed for the first staging release on 2026-09-21. This report does not approve catalog publication. It records the reviewed input and the persistence remediation that must be carried with the built artifact.

## Reviewed input

- Upstream: ZZZKBot commit `7183e37b6b416ea53c1040c83e639a3a3c395eed`, clean under `.sources/zzzkbot/` at review start.
- Compiled sources: `ZZZKBot/Source/Dll.cpp` and `ZZZKBot/Source/ZZZKBotAIModule.cpp`, as listed by `ZZZKBot/ZZZKBot.vcxproj`.
- Build project: Win32 DLL; it includes the BWAPI headers and links BWAPI dynamically. There are no custom, pre-build, or post-build commands in the project.
- Review boundary: the external BWAPI client, launcher, StarCraft process, packaging, and containment are reviewed separately.

`Dll.cpp` only stores the BWAPI game pointer and creates the bot module. The compiled bot source has no direct process-creation, shell, registry, socket, HTTP, updater, or telemetry calls. `ZZZKBotAIModule.cpp` uses relative file paths and standard stream I/O. The `creep_data.txt` and `creep_data_debug.txt` references are inside a block comment and are not reachable in this pin.

## Persistence behavior

At match initialization, the module resolves these paths from its process working directory:

- `bwapi-data/AI/<self-name>.cfg` is optional strategy configuration.
- `bwapi-data/read/<history>.dat` is copied into the write area when needed.
- `bwapi-data/write/<history>.dat` is parsed, recovered through `.0.tmp` and `.1.tmp` renames, and appended during the match.

The history is tab-delimited and retains strategy outcomes that affect later strategy selection. It is learning state, rather than a disposable log. The source has no cross-process lock, does not create or canonicalize these directories, and assumes a separate process working directory provides isolation.

## Downstream patch

Patch: `patches/zzzkbot/0001-encode-persistence-names.patch`

SHA-256: `2802cc9b666a95a5dbd6314f0c123bf5614da93d33a8dbe6bed05e46bce8e9f6`

Changed source files carry a ShieldBattery modification attribution dated 2026-09-21. The patch keeps the existing LGPL notices and adds `ZZZKBot/Source/PersistenceEncoding.h`.

- `encodeFilenameComponent` leaves ordinary ASCII letters, digits, spaces, dots, hyphens, and underscores unchanged. It percent-encodes every other byte, including `%`, so encoded names remain unambiguous and cannot introduce a path separator. It applies to both the self-name config filename and the opponent-name history filename.
- `escapeHistoryField` percent-encodes tabs, CR, LF, NUL, and `%`. It is used for self and opponent names, map name, map filename, and `onPlayerLeft` player names before tab-delimited history serialization.
- Existing histories for ordinary ASCII names keep their exact paths and records. Existing histories or config filenames containing encoded characters are not migrated; they are retained and can be imported deliberately if needed.

The added standalone regression test is `bots/zzzkbot/tests/persistence-encoding-test.cpp`. It compiled and ran with MSVC 2022 against the patched header. It verifies an ordinary compatible name, separator/control-byte filename encoding, and tab/CR/LF/NUL-safe history fields. The patch itself passed `git apply --check --index` against a reset clean checkout of the pinned source.

## Malformed state and remaining release gates

The line parser checks many required sentinels, field counts, and numeric conversions, and skips many incomplete records. It does not bound input line size, provide a complete malformed-state recovery policy, or lock concurrent writers. A structurally valid but malicious history can still influence adaptive strategy choice. The runner must therefore keep state app-owned, enforce a per-profile exclusive lease, stage input from a committed snapshot, and validate/limit retained state before promotion.

This review did not perform artifact review or file/process/network runtime tracing. Before catalog approval, run the required clean-install, normal-match, malformed state/name, concurrent worker, crash/shutdown, offline, and reset traces against the resulting executable. Verify that the runner supplies a unique app-owned working directory and profile for each active bot, preserves the shipped optional configuration separately from learned history, and rejects reparse-point escapes. Preserve the LGPL source and modification notice with the release as required by the licensing and modification-disclosure policy.