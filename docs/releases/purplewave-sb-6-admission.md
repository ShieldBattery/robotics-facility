# PurpleWave sb.6 experimental staging admission

sb.6 targets **experimental local 1v1** with assigned Protoss, Terran or Zerg.
Source and local-distribution review cover the pinned source and fixed
configuration. **Production approval is deferred.** Public competition, human
difficulty, Random, teams, FFA, unusual maps and exhaustive late-game command
conformance remain unverified.

## Artifact status

The final staging artifact is pending a build from a committed recipe on main
after this update and [the production gate](https://github.com/ShieldBattery/robotics-facility/pull/4)
land. A follow-up will record the recipe revision, ZIP and descriptor digests,
JAR digests and artifact-specific validation. The candidate metadata retains the
last published recipe revision until that build is recorded. The embedded
descriptor will take its recipe revision from the new build record.

The [historical record](purplewave-sb-6-history.json) preserves the two
superseded, unpublished sb.6 archives and their validation. Both bundled the
downstream Gather guard. Their digests and archive checks apply to the
provisional bytes. The active catalog will receive the generated fragment after
maintainers host the final reviewed ZIP.

The candidate uses `purplewave-sb-6` pending maintainer confirmation. Keep that
ID if provisional installs were limited to known test profiles. On those
profiles, remove the provisional bot package and reinstall the final build.
Removal preserves learning data. ShieldBattery offers updates by release ID,
so a provisional sb.6 install will stay in place until it is removed. If the
test installs cannot be accounted for, choose a fresh release ID and update
the report filename and tag-pinned candidate links before packaging.

Validate the final artifact in fresh, isolated profiles. For the reload check,
save history in one match and read it in the next using the final build. Record
any test of learning data carried over from an earlier build separately as an
upgrade check.

## Player-facing update

The source moves from `a57d2511cc4f6318c2a2d61a504e8f58a7b090af` to
`08672150433a2c60f5db23e10d2bc15dbc6e302e`, a 172-commit upstream update.
It includes PvP opening and defense changes, Dark Templar targeting, Observer
survival and scouting fixes, and pathfinding and combat simulation changes.
Playing strength and performance have yet to be measured for this package.

The update retains upstream Gather behavior. Earlier games recorded a caught
`empty.max` exception four times in one game and once in another. Both games
completed. The exception can occur when a worker reports zero or negative
total health, stands on a tile in enemy ground range, has a base and an
eligible resource goal, and has an empty melee threat list. Source inspection
shows that the exception reaches the `onFrame` handler and skips the remaining
work for that frame. The effect on gameplay was unmeasured.

## Static source and file-access review

[2Pacalypse- reviewed the full upstream delta](https://github.com/ShieldBattery/robotics-facility/pull/2#issuecomment-6579979770)
between the pins above. The findings below apply to compiled PurpleWave source
with the retained runtime and storage isolation patch and fixed configuration.

- The new file access in compiled `src/` is a read of the fixed
  `bwapi-data/AI/fixedbuilds-by-opponent.json` path through `FileFlag`.
  The opponent name selects a JSON key.
- `CombatVisIO` simulation-log writes require both `debugging` and `simviz`.
  The fixed configuration disables both, and the isolation patch prevents
  enabling `simviz` and removes external visualizer auto-launch.
- `CombatForecastDiagnostics` and `FormationPathAudit` log through
  `With.logger.debug`. The fixed configuration omits their settings, which
  default to false. Combat forecasts also require `debugging`.
- Changes to Logger, Storyteller, Zippers and PlacementCache add no paths.
  PlacementCache moves from format 3 to 5, which requires regenerating old caches.
- The delta adds no process, network, registry or reflection calls. The
  combat simulation thread predates the old pin.
- Upstream moved its mjson submodule from `e7a4da2` to `6c6c5c1`. The package
  lock retains `e7a4da2`. The packaged main path uses mjson for fixed package
  inputs. Optional URL/schema APIs and standalone research entrypoints are
  outside that path.

Contributor follow-up found that the existing fixed `fixedbuilds.txt` path
remains the fallback and that the simulation thread now uses the caller's
priority. The new `strategySelectionRandom` setting selects the testing
playbook when enabled. It defaults to false and the fixed configuration omits it.

Active runtime effects include package and configuration reads, assigned BWAPI
shared-memory and named-pipe IPC, encoded opponent histories, placement caches
and logs below isolated app-owned profiles. The historical JFR and WPR/ETW
observations cover their recorded builds and bounded scenarios. JFR event
counts alone do not identify paths, and the captures do not establish complete
syscall coverage.

## Distribution

The recipe includes corresponding patched sources, locks, patches, offline
build materials and upstream license and attribution notices. This includes the
original PurpleWave MIT notice and component notices for Java BWEM, JBWEB,
JavaJPS, mjson, Scala, JNA/JNA Platform, Commons Lang and native libffi. Java is
detected separately. The source build invokes the pinned Java and Scala
compilers directly. Local distribution and public competition are separate
review scopes.

## Historical gameplay and client requirements

The [historical record](purplewave-sb-6-history.json) ties gameplay and saved
state to exact archive, runtime and client hashes. It includes natural
Protoss/Zerg and Terran/Zerg outcomes, saved winner/frame agreement, later
history reload, and isolated profiles. Historical upgrade and reload checks
retained opponent-history format v5 and deduplicated read/write entries.
Bounded factory games and separate fixtures exercised building flight and
Spider Mines. If the new JARs match the recorded pre-Gather build, its runs
cover the same runtime on the clients used in those runs. The final archive
and fixed-client behavior require separate validation.

The compatible client must include gathered-resource reporting, training
cancellation, building flight and Spider Mine translation, supervised release
practice, signature and archive verification, isolated writable profiles and
lease-aware reset. `minimumBridgeVersion` is descriptive. Development clients
select staging by default, so coordinate testing on a build known to include
the fixes.

## Staging and production rollout

After both PRs land, build and review the final artifact from main. Verify
signed installation, archive rejection paths and reset against the final
bytes using an isolated signed catalog with test trust. Record the digests and
pre-publication checks in this report, tag the report on main, and host the
exact ZIP before adding its generated fragment to the catalog. After staging
publication, verify signed CDN delivery and record the result and receipt in a
later commit. The release stays experimental and carries no production approval.
Production approval requires a separate review after client rollout and verified
staging delivery.
