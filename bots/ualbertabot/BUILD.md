# UAlbertaBot build and source package

Requires Windows, CMake 3.21+, and Visual Studio 2022 with the C++ Win32 toolset
and Windows SDK. The external client is 32-bit and uses the static MSVC runtime,
so the package does not require a separately installed Visual C++ redistributable.

## Build from this repository

Use Node.js 24.12+, pnpm, and Git:

    pnpm install --frozen-lockfile --ignore-scripts
    pnpm sources
    node tools/build-ualbertabot.ts ualbertabot-release
    node tools/package-ualbertabot.ts .build/ualbertabot-release ualbertabot-sb-1 --review

The build directory must not exist. The builder prepares independent copies of
the pinned BWAPI and UAlbertaBot source trees, applies ordered hashed patches,
verifies their index and working trees, and records the source trees and
executable hash in build-info.json. --review creates a review ZIP whose metadata
remains pending. Normal packaging requires approved source and local distribution
reviews. Neither command uploads anything. A release ID identifies one set of
bytes and must not be reused.

## Rebuild the source in a downloaded package

The source directory has the patched compilation inputs, notices, and native
recipe needed to rebuild and relink the executable. With the prerequisites
installed, run from that directory:

    cmake -S native -B rebuild -G "Visual Studio 17 2022" -A Win32 -DSB_NATIVE_BOT=ualbertabot -DBWAPI_SOURCE_DIR="$PWD/bwapi" -DUALBERTABOT_SOURCE_DIR="$PWD/ualbertabot"
    cmake --build rebuild --config Release --target UAlbertaBot --parallel

The result is rebuild/bin/UAlbertaBot.exe. Copy it and
bots/ualbertabot/UAlbertaBot_Config.txt into a fresh working directory, then
create bwapi-data/AI, bwapi-data/read, and bwapi-data/write below that directory.
Use a fresh bot process for every match. ShieldBattery supplies SB_BWAPI_INSTANCE
when it launches the external client. The package contains no StarCraft files,
maps, or opponent data.

The ZIP encoder uses stable ordering, timestamps, and permissions. The source
pins, patches, and build record make the inputs reproducible; byte-identical
output across toolchain versions or checkout paths is not promised.

Use the recipe revision recorded in a published package when reproducing that release.
The TypeScript recipes on `main` require a fresh build directory and a new release ID;
older `.mjs` build records and published archives are not rewritten by this migration.
