# ZZZKBot build and source package

Requires Windows, CMake 3.21+, and Visual Studio 2022 with the C++ Win32 toolset
and Windows SDK. The external bot is always 32-bit and works with either game
architecture. All C++ targets use the static MSVC runtime, so the bot package does
not require a separately installed Visual C++ redistributable.

## Build from this repository

Use Node.js 24+, pnpm, and Git:

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm sources
node tools/build-zzzkbot.mjs zzzkbot-release
node tools/package-zzzkbot.mjs .build/zzzkbot-release zzzkbot-sb-1
```

The build directory must not exist. The builder prepares independent copies of
both pinned source trees, applies the ordered hashed patches, verifies the index
and working trees, and records the source trees and executable hash in
`build-info.json`. Packaging requires completed source and license review; it
produces a ZIP and candidate catalog in `dist/<release-id>/`. Build and packaging
commands never upload anything. Never reuse a release ID for different bytes.

## Rebuild the source included in a downloaded package

The `source` directory contains the actual patched compilation inputs, host,
notices, and recipe. No Git checkout, upstream download, Node, or pnpm is needed.
From that directory, with the prerequisites installed:

```powershell
cmake -S native -B rebuild -G "Visual Studio 17 2022" -A Win32 -DBWAPI_SOURCE_DIR="$PWD/bwapi" -DZZZKBOT_SOURCE_DIR="$PWD/zzzkbot"
cmake --build rebuild --config Release --target ZZZKBotClient --parallel
```

Modify either source tree and run the build again to relink. Import the resulting
`rebuild/bin/ZZZKBotClient.exe` as a local bot, with a writable working directory
containing `bwapi-data/AI`, `bwapi-data/read`, and `bwapi-data/write`. Run a fresh
process for each match. ShieldBattery supplies `SB_BWAPI_INSTANCE` when launching.
No StarCraft game files, maps, or learned opponent data are distributed here.

The ZIP encoder uses stable ordering, timestamps, and permissions. The source
pins and patches make build inputs reproducible; byte-identical native output
across toolchain versions or checkout paths is not promised.
