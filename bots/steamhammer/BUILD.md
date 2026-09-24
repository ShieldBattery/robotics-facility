# Steamhammer build and source package

Requires Windows, CMake 3.21+, Visual Studio 2022 with the Win32 C++ toolset,
and the Windows SDK. The external client uses the static MSVC runtime.

## Build from this repository

Use Node.js 24.12+, pnpm, and Git:

    pnpm install --frozen-lockfile --ignore-scripts
    pnpm sources
    node tools/build-steamhammer.ts steamhammer-release
    node tools/package-steamhammer.ts .build/steamhammer-release steamhammer-sb-1 --review

Output directories must be new. The builder prepares independent copies of
pinned BWAPI and Steamhammer sources, applies ordered hashed patches, checks
source and recipe integrity, and records the executable hash and toolchain.
Review packages remain unapproved. Normal packaging requires approved source
and distribution reviews. Neither command uploads anything.

The author distributes source as a ZIP. imports/steamhammer-5.3.6.json records
its checksum and the independently pinned source snapshot on this repository's
source/steamhammer branch. SOURCE-IMPORT.md documents preserved files and
license supplements. The bundled Timer.hpp is omitted because it lacks a
permission grant; the recipe supplies an independent std::chrono timer.

## Rebuild a downloaded package offline

The package includes patched compilation inputs and the native recipe. With
the prerequisites installed, run from the extracted source directory:

    cmake -S native -B rebuild -G "Visual Studio 17 2022" -A Win32 -DSB_NATIVE_BOT=steamhammer -DBWAPI_SOURCE_DIR="$PWD/bwapi" -DSTEAMHAMMER_SOURCE_DIR="$PWD/steamhammer"
    cmake --build rebuild --config Release --target Steamhammer --parallel

The result is rebuild/bin/Steamhammer.exe. Copy it to the package's bin folder.
Keep work/bwapi-data/AI/Steamhammer_5.3.6.json in place. Launch from work with a
fresh process for each match; ShieldBattery supplies SB_BWAPI_INSTANCE.
Persistent learning lives in work/bwapi-data/write. Each concurrent instance
needs a separate writable profile; resetting learning clears read and write
and restores their packaged empty baselines without deleting the configuration.

No StarCraft files, maps, upstream executable, or opponent data are bundled.
The selected BWAPI library is separately built from its pinned source; the
source ZIP's redundant BWAPILIB copy is not used. License texts, source notices,
applied patches, and the recipe are included for modification and relinking.
Use the recorded recipe revision when reproducing a release. Stable ZIP
ordering does not promise identical compiler output across toolchain versions
or checkout paths.
