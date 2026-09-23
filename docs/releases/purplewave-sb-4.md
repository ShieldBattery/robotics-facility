# PurpleWave sb.4 native dependency notice update

Status: published in signed staging catalog revision 9 on 2026-09-23. This is a notice-only successor to [sb.3](purplewave-sb-3.md), built
from its reviewed ZIP (19,382,241 bytes, SHA-256
`748767387d6c1a633b8f9f6f2595e6e4af471b16eeff31a56bf39ce3c7c2dd55`).
No Scala or Java bot binary was rebuilt or executed.

JNA 5.18.1 embeds native `jnidispatch` libraries. The [pinned native
Makefile](https://github.com/java-native-access/jna/blob/5.18.1/native/Makefile)
links libffi into `jnidispatch` by default. The locked JNA JAR includes the
Windows x64 `jnidispatch.dll` (SHA-256
`5a7ff949f6d93d86491eb5b26b1cfc60051168a60622650224b89995ac420023`)
but only JNA's dual Apache-2.0 / LGPL-2.1-or-later `META-INF/LICENSE`, with no
libffi notice. Its PE imports list `PSAPI.DLL` and `KERNEL32.dll`, with no
separate libffi DLL. The [libffi license in JNA tag
5.18.1](https://github.com/java-native-access/jna/blob/5.18.1/native/libffi/LICENSE)
requires preservation of its copyright and permission notice. Tag `5.18.1`
resolves to commit `3c493c1642b1555d541755e0984c968ba6c0f540`. The
1,153-byte notice is copied exactly to
`notices/JNA-THIRD-PARTY-NOTICES.txt` and
`source/bots/purplewave/JNA-THIRD-PARTY-NOTICES.txt`, SHA-256
`097eee0a217d07a7b298a0e9e725313884582275a2ec95e01c7c7168d1b087de`.
The package's `licenses` list records the new notice.

[The repack script](../../tools/repackage-purplewave-notices.mjs) verifies the
exact sb.3 ZIP and catalog, changes only a fixed allowlist, validates the
package schema and both archives, and reads back the sb.4 ZIP entry by entry.
An independent ZIP comparison found 1,120 original entries: 1,117 unchanged,
three modified, none removed, and five added. The complete delta is:

| Entry | Change |
| --- | --- |
| `notices/JNA-THIRD-PARTY-NOTICES.txt` | Added exact upstream libffi notice |
| `source/bots/purplewave/JNA-THIRD-PARTY-NOTICES.txt` | Added source-side notice copy |
| `source/bots/purplewave/RELEASE-sb-4.txt` | Added current attribution text |
| `source/repackage-info.json` | Added parent ZIP, script and notice hashes, and the changed-path inventory |
| `source/tools/repackage-purplewave-notices.mjs` | Added the repack recipe |
| `notices/RELEASE.txt` | Updated attribution to name bundled libffi |
| `package.json` | Updated release ID/version, libffi license, modification, and source/local-distribution evidence |
| `work/bwapi-data/AI/revision.txt` | Updated the release suffix to `sb-4` |

The original `source/bots/purplewave/RELEASE.txt` stays byte-identical to
sb.3 because it is part of the hashed build recipe. The sb.4 attribution is
included at the distinct path above. The original
`source/build-info.json` (SHA-256
`7ba513952f313840723390e5d28cab6aea2a8887bb9d2712a5a8b496612cde34`)
and `build.recipeSource.revision`
`bac6f6b1c26a9b99e06c22b08f311561ee35321b` are unchanged.

All six `bin/` files are byte-identical to sb.3, including
`bin/PurpleWave.jar` (SHA-256
`db18998ddcedecfffc2dc4bd4de82c897cbac4b4d3d0542a1f907a19957f9138`),
all five runtime jars, and their manifest/dependency relationships. The
configuration, patched upstream source, source lock, game profile, runtime,
launch settings, and BWAPI metadata are unchanged. Source and local
distribution approvals carry forward from the prior reviewed release with the
libffi notice correction recorded here. Protoss retains prior full-match and
x86/x64 bridge evidence; Terran and Zerg have no new dedicated SC:R game tests.
Public competition remains a separate review. No human difficulty calibration
is claimed.

The local sb.4 artifact is 19,389,195 bytes, SHA-256
`d6ee2468d4534a6f500650f34c54ff0824c6c0ccef6e6c47f5de69d09c9b2c10`;
its embedded package manifest SHA-256 is
`e320952e34104cf8384c81df4a514036b443cb54dccf96c6c93cdec579c2c96c`.
The local catalog and ZIP passed schema and archive validation. Staging
publication succeeded in revision 9 through [workflow 35849089388](https://github.com/ShieldBattery/robotics-facility/actions/runs/35849089388).
Independent readback verified current/immutable/receipt signatures and the exact
CDN artifact bytes above. Production was not changed.
