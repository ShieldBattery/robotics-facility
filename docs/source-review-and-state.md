# Source review and saved-state policy

Status: required catalog admission policy and scoped initial findings, 2026-09-21.
Neither seed bot has completed a release review. `sourceReview.status` remains
`pending`; catalog validation requires `approved` independently of distribution
permission. No OS sandbox, runtime tracing, or reset UI is implemented by these docs.

## Admission and update review

Review the exact upstream revisions, downstream patches, configuration, assets,
dependencies, build scripts, host/JNI code, and resulting package. Record reviewer,
scope, evidence, unresolved issues, and approved artifact/input hashes in a release
review report. Repeat review when any input changes; a familiar bot name or an
upstream license is not a source-behavior approval. Candidate smoke tests do not
constitute this review, and validator status fields cannot prove it happened.

Trace filesystem reads/writes/deletes/renames, path construction from player/map
names and configuration, registry/settings changes, process creation, networking,
telemetry, dynamic code loading, automatic updating, and persistence at startup.
Inspect bundled libraries and build-time execution too. Determine which helpers are
actually compiled and reachable instead of treating every textual match as active.
Do not run unfamiliar build scripts on a credential-bearing development machine
before inspecting them; use a disposable restricted review environment as needed.

Exercise the resulting artifact with file/process/network tracing: fresh install,
normal match, malformed names/config/state, repeated matches, simultaneous bots,
crash, shutdown, offline run, and reset. Compare observed accesses with the declared
storage policy. Reject unexplained access to unrelated user files, credentials,
autostart locations, global settings, or remote endpoints. Local bot runtime should
need its own files and the assigned BWAPI IPC endpoint, not internet access or admin.
Publish only after reachable issues are fixed or documented constraints are verified.

A working directory and Windows job object are not an OS security sandbox. Source
review complements a least-privilege runner; evaluate restricted token/ACL or other
Windows containment against actual SC:R/BWAPI IPC requirements before promising one.
Catalog signatures establish provenance, not that the code is safe. Bring-your-own
bots remain explicitly user-supplied code rather than inheriting catalog review status.

## Persistence contract and reset

Use app-owned storage rooted below Electron's `userData` directory, never the user's
StarCraft install, Documents, or the catalog package directory by accident. Proposed
layout: `bots/state/<package-origin-id>/<bot-id>/<profile-id>/`. These
components are generated/validated identifiers, not raw player names or URLs. Keep
packages immutable and separate learning/results, rebuildable caches, logs, and user
configuration. Profiles isolate learning across users; per-match workspaces prevent
concurrent bots from writing the same files.

A profile ID identifies a persistent learning history, not an SB user ID or a login/
match session. Its local metadata can associate an owner with an SB user ID without
requiring an online lookup. Start with a default profile per local owner and bot;
match IDs identify temporary workspaces. The profile survives executable updates.

Track a state-format identifier/version, last writer release, and current state
snapshot in profile metadata. Each package declares verified readable/writable state
formats and any supported migration. Release IDs identify executable packages, not
state directories. This compatibility metadata and migration behavior are proposed
requirements for the installer/runner; they are not implemented in the draft schemas.

- **Compatible update:** reuse the profile history after verifying the new package
  supports its format. Do not silently reset learning because the release changed.
- **Migration:** preserve a snapshot, migrate a copy with the reviewed migrator,
  validate it, then atomically adopt the result and its metadata. Failure leaves the
  original state usable. Migration needs an exclusive profile lease with no workers
  or pending match outputs able to overwrite the result.
- **Unknown or incompatible format:** retain the history and offer a fresh profile
  or continued use of a compatible installed release. Never infer migration support
  from a newer version number or discard old state automatically.
- **Downgrade:** verify compatibility again. If necessary, offer a pre-migration
  snapshot or separate profile; retain newer history rather than overwriting it.

Retain required baseline/migration resources locally so supported updates and resets
can complete offline after installation. Compatibility is based on the actual pinned
source, configuration, and patches, including storage changes introduced here.

A package declares exactly which paths are inputs, mutable learning/results, caches,
logs, and configuration, including whether they are active by default. Stage each
match's `read` inputs from a committed state snapshot and collect `write` output
according to that bot's rules. Some bots update a history file while others overwrite
counters; do not blindly merge or copy directories for every bot. Serialize promotion
for a profile or use independent profiles; partial/crashed output needs an explicit
validation policy. Bound retained data and rotate logs. No gameplay-time downloading.

Offer **Reset learning** for adaptive bots and **Clear saved results** for bots that
only persist counters. Both restore the profile's read inputs and write outputs to
the selected compatible release's immutable packaged baseline, updating state-format
metadata together with the data. That baseline may include author-provided seed data;
if so, identify it in metadata. Never delete all of `bwapi-data` indiscriminately:
`AI` can hold config/assets and other subdirectories can contain required files.
Caches, logs, settings, and learned state need separate reset/removal semantics.

Require an exclusive profile lease for reset. Disable or defer reset while a match
uses the profile, so end-of-game output cannot restore data the user just cleared.
Once workers stop, swap in baseline state atomically and update the local record.
Clear only validated app-owned paths, refusing traversal and symlink/reparse escapes.
A failed reset must leave a usable previous state. Reset works offline and does not
uninstall/re-download the bot. "Pristine" means the packaged learning baseline, not
guaranteed identical match decisions or random seeds. An optional fresh-state practice
mode can use disposable state per match without changing persistent profiles.

## Initial findings: ZZZKBot

Reviewed source pin: `7183e37b6b416ea53c1040c83e639a3a3c395eed`.
File references are relative to `.sources/zzzkbot/`.

- `ZZZKBot/Source/ZZZKBotAIModule.cpp:935-937` sets `bwapi-data/AI/`, `read/`, and
  `write/` as relative directories. In the external client these resolve against
  the bot process working directory. Prototype data is currently under ShieldBattery's
  `.claude-scratch/bwapi-live/bot/bwapi-data/write/`; it is not app-managed storage.
- Lines 953-977 and 1024-1027 produce
  `ZZZKBot_v_1.7.0.0.0_<race>_vs_<opponent>_<race>.dat`. The data-format version in
  the filename differs from the bot's own 1.9.1.0.0 version; do not infer release
  identity from that filename. The source default allows strategy updates (985),
  and consumes opponent history for strategy selection (1899-1916).
- Lines 1145-1248 copy/recover read/write history using `.0.tmp` and `.1.tmp`, rename,
  and removal. There is no cross-process locking. Per-instance/profile isolation is
  required. Clear both retained inputs and outputs when restoring an empty baseline.
- Optional read-only config is `bwapi-data/AI/<self-name>.cfg` (975-977, 1035-1108).
  Preserve user configuration separately from learned state.
- **Unresolved:** raw self/opponent names enter filenames (975-977, 1024-1027).
  Invalid characters can fail access; separators/traversal can change path meaning
  if the runtime permits those names and intermediate paths exist. Reachability
  through every game-name source is not established. Patch filename encoding or
  establish and test restrictive runtime inputs before approval. Names containing
  tabs/newlines can also affect its record format; the source notes unescaped fields.
- `creep_data.txt` and `creep_data_debug.txt` I/O at 599-810 is inside a block comment,
  so it is not active persistence in this pin. A text-search hit alone is misleading.

The scoped review found no direct bot-source network/process/registry calls in the
normal path. This is not a review of all BWAPI, launcher, StarCraft, or binary behavior.

## Initial findings: UAlbertaBot

Reviewed source pin: `558899d8793456f4a6ec4196efbb5235552e24db`.
References are relative to `.sources/ualbertabot/UAlbertaBot/` unless noted.

- `bin/UAlbertaBot_Config.txt:72,90-91` enables strategy I/O and selects relative
  `bwapi-data/read/` and `bwapi-data/write/`. C++ fallback defaults disable strategy
  I/O; distinguish the shipped config from compiled defaults. `Source/Config.cpp:15`
  selects `UAlbertaBot_Config.txt` in the process working directory. The prototype
  working directory is ShieldBattery's `.claude-scratch/ualbertabot-build/bin/`.
  A comment mentions the StarCraft directory, but the actual external executable's
  `fopen`/fstream calls resolve relative paths against its working directory.
- `Source/StrategyManager.cpp:319-408` reads `read/<opponent>.txt` and overwrites
  `write/<opponent>.txt` with strategy win/loss counters. Only spaces in the opponent
  name become underscores. The source does not promote write output into read.
- **Not adaptive learning in this pin:** `setLearnedStrategy` immediately returns
  at 411-415. Saved counters do not currently select a different strategy. Label this
  saved results, not a claim that the bot becomes stronger from experience.
- **Unresolved:** name-derived paths lack comprehensive filename handling, and
  configurable read/write/log paths lack containment checks. Review or patch these
  before release and do not accept unrestricted remote configuration overrides.
- Optional assertion logging targets `bwapi-data/AI/UAlbertaBot_ErrorLog.txt` in the
  supplied config, but is disabled (38-42). Profiling output `results.json` and map
  exports are disabled in the normal build/path. Logs are not learned state.
- Normal BOSS/SparCraft calls initialize and simulate in memory. Research helpers
  contain additional I/O and process calls; the scoped review did not find those
  helpers in the executable's normal build/call chain. Full dependency and artifact
  review, runtime tracing, and hostile-input tests remain required.

These findings justify per-bot storage declarations and downstream source patches.
They do not approve either bot for catalog publication. No existing learning data
was removed or reset during this review.
