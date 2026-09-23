# PurpleWave sb.3 all-race release

Release date: 2026-09-23. Enables Protoss, Terran, and Zerg in the selectable-race
profile. Upstream uses the same source for PurpleWave (Protoss), PurpleSpirit
(Terran), and PurpleSwarm (Zerg); the game race selects the appropriate plan.
See the [pinned upstream README](https://github.com/dgant/PurpleWave/blob/a57d2511cc4f6318c2a2d61a504e8f58a7b090af/readme.md)
and [race dispatcher](https://github.com/dgant/PurpleWave/blob/a57d2511cc4f6318c2a2d61a504e8f58a7b090af/src/Gameplans/All/StandardGameplan.scala).

## Scope and verification

This is a package metadata change, using the exact reviewed sb.2 executable JAR,
runtime libraries, sources, licenses, patches, and configuration. Source and local
distribution approval carry forward from [sb.2](purplewave-sb-2.md). Public
competition remains unreviewed. Recipe revision remains
`bac6f6b1c26a9b99e06c22b08f311561ee35321b`.

Every extracted archive entry was compared against sb.2. Only `package.json` and
`work/bwapi-data/AI/revision.txt` differ. Archive and embedded manifest validation
passed. The source recipe's schema file required restoration of its original
line endings before its exact build-input hash matched; no recipe content changed.

Protoss has the prior full-match and x86/x64 bridge evidence. Terran and Zerg are
enabled based on genuine upstream support at the maintainer's request; no new
Terran/Zerg SC:R gameplay verification is claimed. Random-race behavior and
non-1v1 formats remain unverified. There is no forced Protoss setting in the
packaged gameplay configuration.

The package retains the same writable directories and saved-state format.
Updating preserves compatible learning data; no reset is required. Existing
sb.1/sb.2 installations retain their original race restrictions until updated.

Artifact: `19,382,241` bytes, SHA-256
`748767387d6c1a633b8f9f6f2595e6e4af471b16eeff31a56bf39ce3c7c2dd55`.

To reproduce the package from the reviewed build:
`node tools/package-purplewave.mjs .build/purplewave-release-5 purplewave-sb-3`.
The output directory must not already contain the archive. The current candidate
profile supplies the release metadata; the recorded recipe supplies the binaries.
