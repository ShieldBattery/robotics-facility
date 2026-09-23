# Starter bot roster

Research date: 2026-09-23. Aim for seven distinct bot families first, with an eighth
slot reserved for a genuinely approachable opponent. This is an integration
shortlist, not approval to distribute the unreviewed candidates. Only ZZZKBot and
PurpleWave are currently in the published catalog.

## Selection

| Bot | Races / role | Strength evidence | Why include it | Next work |
| --- | --- | --- | --- | --- |
| ZZZKBot | Zerg; committed early pressure | Saved SSCAIT entry Chris Coxe: 2631 | Already available; a clear scouting and rush-defense exercise. Rush does not mean easy. | Keep as the cheese specialist and regression opponent. |
| PurpleWave | All three; varied openings, reactive, micro-heavy | Saved Protoss entry: 3135; no equivalent strength claim for its off-races | Already available; strong generalist, with three selectable races in sb.3. | Collect race-specific human calibration and further Terran/Zerg game evidence. |
| UAlbertaBot | Start with Terran; predictable opening profiles | Saved random-race Dave Churchill entry: 2551 | Existing native bridge prototype makes this the smallest next integration. Useful for practicing recognizable openings. | Port the recipe into this repo; finish persistence patches, dependency review, and packaging. Evaluate stock MarineRush first and a separately disclosed TankPush configuration next. |
| Infested Artosis | Zerg; macro and adaptive opener/unit mix | Human difficulty and exact shipped-build rating uncalibrated | A second Java-family candidate with a potentially closer integration path than BWAPI4J. | Pin source and JBWAPI dependencies, reconcile documented/runtime Java requirements, audit persistence and dependencies, then benchmark before assigning difficulty. |
| Steamhammer 5.3.6 | All three upstream; prioritize Zerg macro coverage | Saved Zerg entry is **3.6.5**, 2914; it is not a rating of 5.3.6 | Adds a macro-oriented generalist with opening variety and history-based adaptation. | Pin the exact author source archive, review saved-state/config paths, build against BWAPI 4.4, then exercise long macro games and all offered races. |
| Stardust | Protoss; high-end benchmark | Saved entry: 3445 | Provides a demanding opponent at the top of the bot field. | Pin source/dependencies, adapt its native module to the external host, review BWEM/FAP and state handling. Keep public-competition approval separate. |
| Ecgberht | Terran; Marines/Medics with some mechanical units | Saved entry: 2521 | Distinct bio play and another comparatively lower-ranked candidate, without promising beginner difficulty. | Resolve BWAPI4J/native bridge compatibility first; then review GPL/source delivery, dependencies, persistence, and disable optional sounds. |

The Elo values above are from ShieldBattery's user-supplied saved standings
inspected on 2026-09-21, not fresh rankings, human ratings, or ratings of our
compiled packages. The exact source/build behind most entries is unknown. See
[the snapshot and its qualifications](https://github.com/ShieldBattery/ShieldBattery/blob/feature/bwapi-compat/docs/sscait-bot-snapshot-2026-09-21.md).
No numerical conversion from bot Elo to ShieldBattery divisions is proposed.

Recommended integration order: **UAlbertaBot, Infested Artosis, Steamhammer,
Stardust, Ecgberht**. The first candidates prioritize useful variety and existing
native/JBWAPI integration groundwork.
Stardust adds the benchmark; Ecgberht supplies a distinctive Terran option once
its different Java bridge is supported. This ordering is engineering judgment,
not a difficulty ranking. Suggested styles in this document do not automatically
become catalog tags; assignments require evidence from the shipped configuration.

## Source and distribution evidence

- **UAlbertaBot:** pinned [MIT license](https://github.com/davechurchill/ualbertabot/blob/558899d8793456f4a6ec4196efbb5235552e24db/License.md)
  and [configuration](https://github.com/davechurchill/ualbertabot/blob/558899d8793456f4a6ec4196efbb5235552e24db/UAlbertaBot/bin/UAlbertaBot_Config.txt).
  MarineRush, VultureRush, and TankPush exist upstream. Our current candidate only
  offers the stock Terran profile. A TankPush variant would be a documented
  configuration change, with opponent-specific overrides disabled and its actual
  play tested; it should not silently replace MarineRush or inherit its rating.
  The MIT top-level license does not complete the BOSS/SparCraft/BWAPI package audit.
- **Infested Artosis:** [author README](https://github.com/BradEwing/InfestedArtosis)
  and [MIT license](https://github.com/BradEwing/InfestedArtosis/blob/main/LICENSE).
  The author describes macro, scouting, and adaptive opener/composition selection,
  with units through lair tech. It descends from JavaBWAPI; its README documents
  Java 8; the inspected [POM](https://github.com/BradEwing/InfestedArtosis/blob/main/pom.xml)
  targets Java 8 and JBWAPI 2.2.0. Verify those requirements on the pinned build
  rather than copying those of PurpleWave. Dependency and saved-state review remain open.
- **Steamhammer:** the [author's release page](https://www.satirist.org/ai/starcraft/steamhammer/)
  identifies 5.3.6, all-race support, improved Terran/Protoss macro, MIT inheritance
  from UAlbertaBot, and BWAPI 4.4 for recent versions. Review the exact downloaded
  source and bundled components before approving a release. The author calls
  Terran its weakest race; that is not a human difficulty calibration.
- **Stardust:** [project](https://github.com/bmnielsen/Stardust) and
  [license](https://github.com/bmnielsen/Stardust/blob/main/LICENSE).
  The license permits distribution with notices but requires written permission
  for public StarCraft tournament submissions. Record the actual license, not
  plain MIT. Treat local play and eventual public competition as separate decisions.
  Its README identifies BWEM and modified FAP dependencies.
- **Ecgberht:** [project and build requirements](https://github.com/Jabbo16/Ecgberht)
  and [GPL-3.0 license](https://github.com/Jabbo16/Ecgberht/blob/master/LICENSE).
  The author describes bio preference and opponent-history strategy learning.
  Its documented stack is **32-bit Java 8, BWAPI4J, and BWAPI 4.2**, unlike the
  Java 21/JBWAPI route used for PurpleWave. A working PurpleWave installation does
  not establish Ecgberht compatibility. The source bundle must cover patches and
  the applicable dependency obligations as well as the bot.

Upstream branch links are discovery evidence, not release pins. Pin an exact
commit/archive digest before building, reviewing, assigning tags, or publishing.
No new bot binaries or upstream build scripts were executed for this shortlist.

## The beginner gap

A lower bot-ladder rating is useful for choosing candidates to test, but it does
not establish that a new human player can beat them. The core roster still needs
human playtesting at the lower end. Do not label ZZZKBot or UAlbertaBot Easy by
assumption; narrow rushes can be especially punishing for newcomers.

**Marine Hell** now has a [reviewed staging package](marine-hell-admission.md)
with Bio and Defensive tags. Its simple Terran strategy accumulates Marines
behind a bunker before attacking. The source is ported to JBWAPI; the upstream
BWMirror/JNI binaries are excluded. Java 21 x64 is required. This fills a useful
strategy-variety slot, but human difficulty is still uncalibrated.

**OpprimoBot** has a source-built Terran profile approved for local staging
play, with Bio and Defensive tags. Its upstream supports all races, but only
Terran is offered after packaged combat tests on both SC:R architectures.
The [admission review](opprimobot-admission.md) records source/dependency
notices, offline rebuilding, construction/ability bridge fixes, synchronization,
and cleanup evidence. Strategy-history learning and terrain cache/logs are
disabled. Human difficulty remains uncalibrated; the disabled SSCAIT entry's
comparison with the built-in AI does not measure this patched build.
Other races, team/FFA modes, and irregular maps remain unverified.

For calibration, test the exact packaged configurations against newer human
players, record player race/map, bot race, bot learning state, and package version,
and collect feedback on whether the game offers useful practice. Use those results
to assign ShieldBattery skill estimates. A deliberately weaker profile needs its
own clear name, attribution, reviewed configuration, and calibration; merely
choosing an old bot binary or slowing its process is not a difficulty design.

## Additional outreach / reserve choices

- **WillyT:** [upstream](https://github.com/nklausner/WillyT) uses native BWAPI 4.4,
  making it a plausible Terran alternative if redistribution terms are clarified.
  No top-level license was found during this pass. Its README cites bio/SCV-rush
  inspiration, which is insufficient on its own to assign current play-style tags.
  The saved SSCAIT entry mentions FFA support; test that separately if included.
- **McRaveZ:** [source family](https://github.com/Cmccrave/McRave) is another strong
  Zerg candidate. Prefer one broad Zerg integration first; establish the actual
  rated version rather than transferring the saved McRaveZ entry's 2992 to an
  arbitrary current checkout.
- **BananaBrain family:** BananaBrain/Crona/Terminus/Brainiac provide another
  strong all-race family. Author outreach should establish recommended source,
  build access, and redistribution terms before scheduling integration.

For every outreach candidate, ask separately about local distribution of patched
source/binaries and public competitive use. Also ask about the preferred build,
recommended races/maps, saved learning data, human-facing difficulty, and CPU/RAM.
No outreach messages have been sent as part of this research.
