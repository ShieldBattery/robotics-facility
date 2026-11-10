# Scoped local-practice production approvals

This proposal reviews the seven existing catalog bots against
release-specific source, artifact, gameplay, installer, and state evidence. It adds
production availability for six exact existing releases. It does not rebuild bots,
change their immutable package descriptors, or claim fresh gameplay evidence.
The [machine-readable decisions](local-practice-production-approvals.json) pin the
archive, manifest, and canonical package digests and record per-release limits.

Production approval here permits distribution for supervised local practice within
the reviewed profile. It does not turn an experimental format into a verified one,
calibrate human difficulty, approve public competition, or certify every map/command.
Known experimental capability labels remain in the package and app. The scope in
this report is an evidence boundary, not a newly implemented runtime format lock.

## Decisions

| Bot | Exact release | Decision | Reviewed scope and material limits |
| --- | --- | --- | --- |
| ZZZKBot | `zzzkbot-sb-1` | Approve | Assigned Zerg, ordinary local 1v1. x64 natural win/history evidence; x86 paired-instance smoke. App-owned isolated history is required. |
| UAlbertaBot | `ualbertabot-sb-3` | Approve | Assigned Terran, fixed MarineRush configuration, ordinary local 1v1. No learning or arbitrary configuration support. One historical observer startup timeout remains recorded. |
| Marine Hell | `marine-hell-sb-4` | Approve | Assigned Terran, ordinary local 1v1, x64 Java 21. Corrected bunker adapter and installed-package launch verified. Unusual/island/no-choke maps remain unverified. |
| OpprimoBot | `opprimobot-sb-1` | Approve | Assigned Terran, ordinary local 1v1, fresh process each match. Natural defeats on both game architectures; caches/history stay disabled. |
| Infested Artosis | `infested-artosis-sb-1` | Approve experimental 1v1 | Assigned Zerg with x64 Java 21 and corrected morph/completion bridge. Keep `one-v-one: experimental`; late progression and one unclassified rejection remain outside verified scope. |
| Steamhammer | `steamhammer-sb-1` | Approve experimental 1v1 | Assigned Terran/Protoss/Zerg, ordinary local 1v1 with required frame-zero/mineral/refinery fixes. Keep experimental 1v1 and incompatible FFA. Final-build Terran x86 evidence is a concurrent smoke; its 1v1 combat evidence uses x64. |
| PurpleWave | Existing `purplewave-sb-1` through `sb-4` | Withhold | Earlier packages lack the libffi notice corrected in sb.4. sb.4 exposes three races while dedicated game evidence carried forward is Protoss-only. New sb.6 evidence does not approve these older bytes. |

Pluto remains development-only. No Pluto package, candidate, or approval is imported
by this change. Missing status remains a candidate; no other historical release is
implicitly approved.

## Evidence supporting the six approvals

- **ZZZKBot:** [release review](zzzkbot-sb-1.md) records pinned source/notice review,
  source-only rebuild, unsafe-name tests, a natural synchronized x64 win, history
  output and malformed-record play, separate x86 instances, owned-process cleanup,
  and signed staging readback. Arbitrary imported history and exhaustive hostile
  state/OS tracing are not covered. Profile isolation remains essential.
- **UAlbertaBot:** [source/release review](../ualbertabot-source-review.md) records
  corresponding-source rebuilding, fixed configuration, disabled StrategyIO/chat
  setters, x86/x64 gameplay and end callbacks, concurrent isolation, and unchanged
  configuration after play. The profile has no learning state to reload/reset.
  Its ordinary-map scope and recorded startup timeout remain explicit.
- **Marine Hell:** [admission](../marine-hell-admission.md) records the exact corrected
  JAR, notices and offline rebuild, x86/x64 progression/combat, actual Marines loaded
  into bunkers, signed CDN installation, installed practice launch, Java selection,
  and normal shutdown. The source has no persistent learning; forced crashes and
  unusual terrain were not exhaustively exercised.
- **OpprimoBot:** [admission](../opprimobot-admission.md) and
  [BWTA review](../opprimobot-bwta-review.md) cover source/dependency boundaries,
  corresponding-source rebuild, natural losses against ZZZKBot on x86/x64 with
  matching simulation probes and zero recorded command rejections, signed staging
  installation, paired launch, and cleanup. Fixed fresh-process configuration
  disables history/statistics/cache writes. Late-game spells/path timing remain
  broader follow-up work.
- **Infested Artosis:** [admission](../infested-artosis-admission.md) covers source and
  dependency notices, offline class reproduction, bounded history/isolation tests,
  corrected Zerg birth/completion behavior, a natural x64 loss, concurrent x86
  gameplay, and signed staging installation. Repeated installed launches retained
  earlier history rows; idle reset restored empty baselines. The earlier broken
  pre-fix run is excluded. These observations support experimental local 1v1
  availability, not an upgrade of its package's compatibility rating.
- **Steamhammer:** [admission](../steamhammer-admission.md) covers source/notices,
  offline native rebuild, storage regressions, final-build production/combat and
  normal concession callbacks, signed staging installation, repeated installed
  launches, and idle reset without package changes. Prior broken refinery/stale-DLL
  runs are excluded. Its recorded final endings were concessions, not natural
  combat results. The observed FFA Zerg stall remains a reason to keep FFA
  incompatible; it is not silently counted as successful Zerg/FFA gameplay.

These are artifact-specific reassessments of existing evidence. Limited command
rejections, missing exhaustive tracing, uncalibrated strength, and untested formats
are retained as limitations rather than relabelled as completed tests.

## PurpleWave and BananaBrain follow-up

[PurpleWave sb.4](purplewave-sb-4.md) fixes native libffi notice delivery, but does
not supply dedicated Terran/Zerg gameplay for its all-race profile. sb.1-sb.3 do not
inherit that notice correction. These existing releases remain unapproved; evidence
for a separately reviewed update must not be backfilled into their package bytes.

PurpleWave updates in [PR #2](https://github.com/ShieldBattery/robotics-facility/pull/2)
and BananaBrain admission in [PR #3](https://github.com/ShieldBattery/robotics-facility/pull/3)
remain separate reviews. Neither adds a release or production approval here.
Their exact packages must complete review and artifact delivery before a separate
catalog approval change.

## Client and publication requirements

Use a ShieldBattery client with supervised release practice, signature/archive
verification, isolated per-instance writable profiles, lease-aware reset, and owned
process cleanup. [SB #1838](https://github.com/ShieldBattery/ShieldBattery/pull/1838)
supplies release practice and fixed production catalog trust. Approval is not a
claim that historical debug-only clients support production practice.

The tested native command/construction observations, Zerg morph/completion, and
frame-zero/mineral normalization fixes are in the current `feature/bwapi-compat`
line as `da532f3e2`, `11346b118`, and `e9abd018c`. Their older review commit IDs
were rewritten; this report does not infer compatibility from a stale binary.
[SB #1831](https://github.com/ShieldBattery/ShieldBattery/pull/1831) supplies accurate
collected-resource totals, and [SB #1841](https://github.com/ShieldBattery/ShieldBattery/pull/1841)
supplies building flight/Spider Mine translations where used. Ship the reviewed
client integration; these metadata approvals do not implement missing commands.

Only the external `releaseStatus` field changes in `catalog/catalog.json`.
Archive URLs/digests/sizes, package descriptors, source pins, runtime operands,
licenses, configuration, races, and format support remain unchanged. No bot build,
new match, archive repack, signing, upload, workflow dispatch, or production
promotion is part of this change.

The existing signed staging revision does not gain these flags retroactively.
After review/merge, maintainers publish a **new signed staging revision** carrying
the approvals and exact existing archives, verify its activation and receipt, then
promote that revision through the protected production workflow. Select revision
numbers at publication time. Existing installations stay accessible under the
client policy; publication approval is not an installed-package revocation system.

## Verification of this metadata change

Prior six-release readback verified the pinned staging signature and publication
receipt for revision 12. Each of the six selected CDN archives passed the maintained archive verifier,
including its size, SHA-256, descriptor digest/content, paths, entry sizes, CRCs, and
required files. Their descriptors match the signed staging catalog and the source
catalog. The machine-readable record pins the verified signed envelope digest.

Prior six-release local production preparation applied the proposed approval fields
to the verified staging package set, selected exactly those six releases, and retained identical
archive and descriptor bytes. Its destination was `.invalid`; nothing was signed
or uploaded. This dry run does not establish a newly signed staging receipt or
a production deployment. A new real staging revision remains required.
