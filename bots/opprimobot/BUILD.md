# OpprimoBot build and corresponding source

Requires Windows, CMake 3.21+, Visual Studio 2022 with the Win32 C++ toolset,
and the Windows SDK. The external client is 32-bit with the static MSVC runtime.
It can connect to either supported ShieldBattery game architecture.

## Build from this repository

Use Node.js 24.12+, pnpm, and Git from a committed checkout:

    pnpm install --frozen-lockfile --ignore-scripts
    pnpm sources
    node tools/build-opprimobot.ts opprimobot-release
    node tools/package-opprimobot.ts .build/opprimobot-release opprimobot-sb-1 --review

The output directory must not exist. An optional second builder argument supplies
an already-downloaded boost_1_56_0.zip; it must match native/dependencies.json's
exact size and SHA-256. Otherwise the builder downloads the pinned official ZIP.
Only Boost headers and its license are extracted. No upstream build scripts or
prebuilt bot libraries are used.

The builder prepares independent pinned BWAPI, BWTA2, and OpprimoBot trees,
applies ordered hashed patches, and records the source trees, toolchain, recipe,
Boost inventory, and executable digest in build-info.json. Review packaging keeps
approval pending. Normal packaging requires approved source and distribution
records. Neither command uploads anything. Never reuse a release ID for new bytes.

## Rebuild or relink a downloaded package

The package includes the patched sources used to build the executable, all
ordered patches, dependency notices, and the native recipe. Boost headers are
nested in a ZIP to keep the installable archive's file count small. With the
prerequisites installed, run these PowerShell commands from source/:

    Expand-Archive -LiteralPath boost-headers.zip -DestinationPath boost
    cmake -S native -B rebuild -G "Visual Studio 17 2022" -A Win32 -DSB_NATIVE_BOT=opprimobot -DBWAPI_SOURCE_DIR="$PWD/bwapi" -DBWTA2_SOURCE_DIR="$PWD/bwta2" -DOPPRIMOBOT_SOURCE_DIR="$PWD/opprimobot" -DOPPRIMOBOT_BOOST_DIR="$PWD/boost"
    cmake --build rebuild --config Release --target OpprimoBot --parallel

The result is rebuild/bin/OpprimoBot.exe. Sources already have the patches
applied; do not apply them again. You can modify the bot or either LGPL library
and rebuild/relink with this recipe without downloading additional source.
Visual Studio, the Windows SDK, and CMake are build prerequisites, not bundled.

Copy the executable to a fresh working directory and create bwapi-data/AI,
bwapi-data/read, and bwapi-data/write there. ShieldBattery supplies
SB_BWAPI_INSTANCE to select the game's external-client bridge. Run a fresh
process for every match; this profile exits after match end or disconnection.
It accepts no runtime configuration or chat commands, and does not retain
strategy history, statistics, profiling output, or terrain caches.

The download contains no StarCraft files, maps, or opponent data. Source and
patch hashes make the inputs auditable; byte-identical output across toolchain
versions or checkout paths is not promised.

Use the recipe revision recorded in a published package when reproducing that release.
The TypeScript recipes on `main` require a fresh build directory and a new release ID;
older `.mjs` build records and published archives are not rewritten by this migration.
