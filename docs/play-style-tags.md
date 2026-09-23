# Play-style tags

Catalog `bot.playStyleTags` contains stable lowercase IDs, never display text or
translation keys. ShieldBattery owns the localized labels and ships them with
app releases, so installed bots can display them offline. The authoritative
allowlist is `$defs.bot.properties.playStyleTags.items.enum` in
[`schemas/metadata.schema.json`](../schemas/metadata.schema.json).

## Vocabulary

These thirteen tags describe the kinds of practice an opponent offers. The groups
below explain the vocabulary; they do not add grouping fields to the catalog.

| Group        | ID                | English label   | Meaning / assignment boundary                                                                                                                                                                                                           |
| ------------ | ----------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Composition  | `air-focused`     | Air armies      | Air combat units commonly form a major part of its offensive plan. Detection, transports, or an occasional support unit are insufficient.                                                                                               |
| Composition  | `bio`             | Bio             | Terran infantry, usually Marines and Medics, forms its characteristic army core. This does not mean all biological units or all Zerg armies.                                                                                            |
| Composition  | `mech`            | Mech            | Terran factory units such as Vultures, Siege Tanks, and Goliaths form its characteristic army core. A few tanks supporting infantry are insufficient.                                                                                   |
| Game plan    | `aggressive`      | Aggressive      | Frequently takes the initiative, contests the map, and sustains offensive pressure. Can follow an economic opening; a single early cheese or isolated timing attack is insufficient.                                                    |
| Game plan    | `cheese`          | Cheese          | Committed early aggression or surprise openings, including early unit rushes, worker rushes, cannon rushes, and proxy openings. This category deliberately includes Rush; ordinary pressure during an economic opening is insufficient. |
| Game plan    | `defensive`       | Defensive       | Characteristically secures positions and absorbs attacks before moving out. Responding to an occasional rush does not qualify.                                                                                                          |
| Game plan    | `macro`           | Macro           | Emphasizes expansion, economic growth, and sustained production as its route to winning. Every bot gathering resources does not qualify.                                                                                                |
| Game plan    | `timing-attack`   | Timing attack   | Builds attacks around a specific upgrade, tech completion, or unit-count power spike. Simply attacking once it has an army is insufficient.                                                                                             |
| Tactics      | `drops`           | Drops           | Regularly attacks with transported units behind enemy lines. Transporting a worker to an island is insufficient.                                                                                                                        |
| Tactics      | `harassment`      | Harassment      | Regularly disrupts workers, expansions, or production through raids and hit-and-run attacks.                                                                                                                                            |
| Unit control | `micro-heavy`     | Micro-heavy     | Precise unit control is a defining emphasis: sustained kiting, focus fire, splitting, dodging, or coordinated spell use. Basic targeting, high APM, or merely having micro code is insufficient.                                        |
| Variety      | `reactive`        | Reactive        | Changes strategy or composition in response to what it scouts during a game. Basic combat targeting or choosing an opening from past results is insufficient.                                                                           |
| Variety      | `varied-openings` | Varied openings | Uses meaningfully different opening plans across games under the shipped configuration. Unused build orders in its source do not qualify.                                                                                               |

Tags can overlap: a bot may use `drops` for `harassment`, or pair `cheese` with
`bio`. Prefer two to four characteristic traits, not a badge for every
code path. This is editorial guidance, not a schema maximum. An empty list is
valid when evidence is insufficient; there is no `unknown` or `unclassified` tag.

Use composition tags only when they are useful expectations for the supported
races and matchups. A multi-race bot should not acquire `bio` solely because one
optional Terran build uses Marines. Put matchup-specific exceptions and particular
units/builds in its description. Tags are guidance, not launch restrictions or
promises that every game will follow one build. `micro-heavy` describes how the
bot fights, not an overall skill rating or a promise of human-like control. It
can apply to full-army engagements without `harassment`, and vice versa.

## Assignment and review

Review the **packaged version and configuration**, including our patches and
learning defaults. Record the source revision/configuration and supporting games
in its release review. Recheck assignments when either changes. A source feature
or an author's description is useful evidence, but does not establish how often
a released bot actually uses that feature. Do not infer tags from a bot's name,
its parent project's repertoire, or its tournament rank.

Bot identity tags currently apply across its catalog releases. Keep them true for
all releases still offered for installation; document important version/matchup
qualifications. If different release configurations become independently
selectable opponents, revisit where tags live rather than silently showing a
new release's style on an older installed version.

Races, formats, skill ratings, and learning have separate fields. In particular,
`profile.learning.mode = "persistent"` supports a localized **Learns** badge and
an explanation of saved history/reset controls. It does not imply `reactive`.
Do not put `learns`, race names, difficulty labels, runtime/language names, or
marketing claims such as "smart" or "human-like" in `playStyleTags`.

We intentionally start without separate tags for every unit, build order, or
micro technique. Rush and Cheese share one category; proxy/cannon/worker-rush
specifics can be explained in the description. Scouting reactions use Reactive;
build selection variety uses Varied openings.
Aggressive describes sustained initiative; Cheese describes a committed opening.
A bot that occasionally attacks and occasionally defends should not automatically
receive both Aggressive and Defensive. Leave vague labels such as "balanced" to
the description. Add a tag when it answers a distinct player choice and has
credible release evidence, not just because another synonym is possible.

## Research basis (2026-09-21)

This is a representative survey, not an audit of every SSCAIT entry or approval
to distribute the projects below. The tag vocabulary is our editorial inference
from these sources. ZZZKBot receives `cheese` in the published catalog; the
unpublished UAlbertaBot candidate's `marine-rush` becomes `cheese` and `bio`.
The other rows identify useful distinctions for future reviews.

| Bot / family               | Primary evidence                                                                                                                                                                                                                                                                                    | What it tells us                                                                                                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ZZZKBot                    | [Author's competition description in our pinned tree](https://github.com/chriscoxe/ZZZKBot/blob/7183e37b6b416ea53c1040c83e639a3a3c395eed/CIG2018_ENTRY.txt) and [changes through the pinned version](https://github.com/chriscoxe/ZZZKBot/blob/7183e37b6b416ea53c1040c83e639a3a3c395eed/CHANGES.md) | Describes an early 4-pool and alternative rushes selected using saved opponent history. Together with the packaged bot's live tests, supports `cheese`. The competition description is for 1.8.0; our release is 1.9.1, so it is not a description of an identical tournament binary. Learning remains a separate capability. |
| UAlbertaBot                | [Author's configuration](https://github.com/davechurchill/ualbertabot/blob/master/UAlbertaBot/bin/UAlbertaBot_Config.txt)                                                                                                                                                                           | Default race selections are rush builds; alternative strategies are configurable. Available build definitions are not automatically the shipped behavior.                                                                                                                                                                     |
| Steamhammer / Randomhammer | [Author's overview and version notes](https://satirist.org/ai/starcraft/steamhammer/)                                                                                                                                                                                                               | Opening variety, production planning, and opponent-history selection are distinct traits. Randomhammer is Steamhammer playing Random; race belongs in capabilities. Claims about one version should not transfer to old ladder submissions.                                                                                   |
| McRave                     | [Author's README](https://github.com/Cmccrave/McRave)                                                                                                                                                                                                                                               | Describes a refined build repertoire and reactions to enemy builds/technology. Supports distinguishing `reactive` from learning between games.                                                                                                                                                                                |
| PurpleWave                 | [Author's README](https://github.com/dgant/PurpleWave/blob/master/readme.md) and [gameplans at reviewed revision](https://github.com/dgant/PurpleWave/tree/a57d2511cc4f6318c2a2d61a504e8f58a7b090af/src/Gameplans)                                                                                  | Broad strategy variety across races is more useful as a summary than labeling the bot with every conditional opening.                                                                                                                                                                                                         |
| Stardust                   | [Strategy source at reviewed revision](https://github.com/bmnielsen/Stardust/tree/22d93d7a55d0a0494384474a456fd7ee26baee97/src/Strategist)                                                                                                                                                          | Defensive, expansion, and specialist attack plans make macro, defense, and harassment useful distinctions. Conditional air/transport plans alone do not make this an air/drop specialist.                                                                                                                                     |
| Ecgberht                   | [Author's README](https://github.com/Jabbo16/Ecgberht) and [strategy implementations](https://github.com/Jabbo16/Ecgberht/tree/master/src/ecgberht/Strategies)                                                                                                                                      | Explicit infantry preference makes Bio meaningful to players; separate mechanical and air strategy implementations motivate Mech and Air armies as vocabulary, not blanket assignments.                                                                                                                                       |
| Iron                       | [Author's strategy explanation](https://bwem.sourceforge.net/Iron.html)                                                                                                                                                                                                                             | Describes autonomous individual unit behaviors, mobile guerrilla play, and emphasis on army strength, while noting style changes over time. Motivates separate Micro-heavy and Harassment tags; a release review must establish that precise control is characteristic, not just an implementation goal.                      |
| WillyT                     | [Author's README](https://github.com/nklausner/WillyT)                                                                                                                                                                                                                                              | Mentions bio/SCV-rush inspiration. Inspiration alone is insufficient to tag a future packaged version.                                                                                                                                                                                                                        |

BananaBrain and its race variants, and PurpleCheese, were also considered. We
have not established enough primary, release-specific strategy evidence to assign
them tags here. Do not inherit another bot's tags on the basis of a family name.

## PurpleWave release tags (2026-09-23)

The offered `purplewave-sb-1` and `purplewave-sb-2` profiles share the same
Protoss strategy configuration and upstream revision
`a57d2511cc4f6318c2a2d61a504e8f58a7b090af`. Their identity tags are:

- **Micro-heavy**: the normal unit-action pipeline runs specialized combat
  control, including Reaver/Shuttle unloading, danger avoidance, and cooldown
  management. See [Fight](https://github.com/dgant/PurpleWave/blob/a57d2511cc4f6318c2a2d61a504e8f58a7b090af/src/Micro/Actions/Combat/Fight.scala)
  and [BeReaver](https://github.com/dgant/PurpleWave/blob/a57d2511cc4f6318c2a2d61a504e8f58a7b090af/src/Micro/Actions/Protoss/BeReaver.scala).
- **Reactive**: scouting an enemy fast expansion changes the active PvP plan
  between expansion and several pressure responses; these decisions issue
  different build orders during the game. See
  [PvPOpeningVsFE](https://github.com/dgant/PurpleWave/blob/a57d2511cc4f6318c2a2d61a504e8f58a7b090af/src/Gameplans/Protoss/PvP/PvPOpeningVsFE.scala).
- **Varied openings**: the shipped configuration uses the default playbook's
  history-aware strategy selection. Its legal branches include distinct Robo,
  Dark Templar, expansion, and multi-Gateway openings. See
  [Playbook](https://github.com/dgant/PurpleWave/blob/a57d2511cc4f6318c2a2d61a504e8f58a7b090af/src/Strategery/Playbook.scala),
  [StrategySelectionGreedy](https://github.com/dgant/PurpleWave/blob/a57d2511cc4f6318c2a2d61a504e8f58a7b090af/src/Strategery/Selection/StrategySelectionGreedy.scala),
  and [PvPStrategies](https://github.com/dgant/PurpleWave/blob/a57d2511cc4f6318c2a2d61a504e8f58a7b090af/src/Strategery/Strategies/Protoss/PvPStrategies.scala).

These are source-based editorial descriptions, not measured frequencies of
particular builds in ShieldBattery games. Macro, Cheese, and composition-specific
tags are omitted because the repertoire contains those capabilities without
establishing them as defining traits of this profile.

Upstream supports all three races in this same source tree: its
[README](https://github.com/dgant/PurpleWave/blob/a57d2511cc4f6318c2a2d61a504e8f58a7b090af/readme.md)
names PurpleWave (Protoss), PurpleSpirit (Terran), and PurpleSwarm (Zerg), and
[StandardGameplan](https://github.com/dgant/PurpleWave/blob/a57d2511cc4f6318c2a2d61a504e8f58a7b090af/src/Gameplans/All/StandardGameplan.scala)
dispatches to each race's game plans. The sb.1 and sb.2 packages offer only Protoss. The sb.3 package enables all three
races from upstream support; dedicated Terran/Zerg SC:R bridge game verification
is pending. The concrete tag examples above were traced through the Protoss
profile; individual openings and micro techniques differ by race.

## Validation and app integration

Candidate and catalog validation share the allowlist and reject unknown IDs,
duplicate tags, and display labels such as `Cheese`. `rush` is not a separate ID;
use `cheese` for that category. The publisher runs this
validation before publishing. Tests cover both candidate and catalog paths.

Consumer contract for ShieldBattery's UI implementation: define matching IDs and
explicit extractable translation strings in the app. Preserve unknown IDs in
catalog data but omit their labels and tag-search matches. A catalog introducing
a new tag must not make an older app reject all bots or display an untranslated ID.
Add IDs to both repositories and ship labels/translations before using them widely;
never rename or repurpose an existing ID to mean a different strategy. This is
an integration contract, not a claim that the consumer currently implements it.

Tag corrections are bot identity metadata updates: publish a new signed catalog
revision while retaining the existing immutable ZIP and release descriptor. The
UI should use refreshed catalog tags for installed bots too, falling back to
saved metadata when there is no catalog entry, subject to the release-scope rule
above. No app or translation files are maintained by this repository.
