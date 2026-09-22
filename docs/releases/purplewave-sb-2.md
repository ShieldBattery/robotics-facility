# PurpleWave sb.2 staging release review

Review date: 2026-09-22. Local distribution and source review remain approved;
public competition is unreviewed. This is a metadata/notice follow-up to
[sb.1](purplewave-sb-1.md), whose source, dependency, license, patch, and live-game
evidence also applies here.

## Changes and build

The package now includes structured `modifications` records for the bot and JBWAPI
runtime changes. These populate the app's modified-build disclosure and license
notice panel. The package version and revision marker identify sb.2. The full
notices, patched sources, and original attribution remain bundled.

Recipe revision: `bac6f6b1c26a9b99e06c22b08f311561ee35321b`. The executable JAR,
five runtime libraries, and gameplay configuration were compared byte for byte
with the live-tested review package; all are unchanged. Build provenance contains
only public toolchain properties.

Artifact: `19,382,183` bytes, SHA-256
`56469338c3393eb58ecfa210098f61033a01d96a6d02e08fe384bc02598fcf4d`.

## Installed-app verification

The app verified staging revision 4's signature and downloaded/installed sb.1 from
the CDN, then launched the installed Java package against x86 SC:R. Session
`1cb6eb59-634f-4363-96ca-2eb581d2a2c0` stayed synchronized with the bot window hidden,
ended normally, and saved learning data. Reset learning restored an empty baseline.
The library displayed Java 21 installed and Ready; the requirements panel identified
the actual x64 Java executable. The packaged modification notice was readable
through the restricted notice IPC.

Session `e29a69e9-4568-48fc-b5d1-5dc3011ddf63` launched the installed package and cached
map with no usable catalog: a test catalog override intentionally failed to load.
It progressed past frame 1300 with the bot hidden, then ended normally. This proves
independence from the catalog service; the workstation itself remained connected.

The first test profile was inside the actively watched development workspace,
where even independent extracted-directory rename probes failed persistently.
The same archive and unmodified installer succeeded in a normal temporary profile
outside that workspace. No security settings were changed.

An observer session `615723de-50a3-4581-9383-93bfe27a249d` also verified code-0 Java
exit after a win: the hidden client dismissed its finished game normally, native
results arrived, and the session ended successfully while the observer remained.

## Staging publication and update

[Staging revision 5](https://github.com/ShieldBattery/robotics-facility/actions/runs/35712665770)
and Windows/Linux validation both passed. Independent readback verified the
configured Ed25519 key against `catalog.json`, `catalogs/5.json`, and
`published/5.json`; the CDN ZIP matched the local artifact byte for byte.
The current catalog requests revalidation; immutable revisions and artifacts keep
long cache lifetimes. Production promotion was not run.

The real app refreshed revision 5 and updated the installed sb.1 to sb.2 with no
install errors. Saved learning data remained present. Its detail panel displayed
both modification summaries and the License action opened the original licenses
and modified-build notice. The UI emitted a duplicate-key warning because it keys
modification records only by modifier/date; the bot and dependency records share
both values. This UI issue is recorded in ShieldBattery's Java integration handoff.
All owned test games and Java processes were stopped.
