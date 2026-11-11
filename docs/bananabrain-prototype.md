# BananaBrain native host prototype

Local prototype only. No catalog entry or distribution approval. Uses AIIDE 2025
source and the existing native host/BWAPI client; no custom companion. The original
prototype was unmodified; current recipe adds a source-locked storage patch.

The verified archive and local source-import branch are recorded in
imports/bananabrain-aiide2025.json. Source/ and BWEM compilation units mirror the
original Visual Studio project. Original license notices remain in source.
The author license has a separate public-tournament permission condition.

Build committed recipe inputs on Windows with Node 24, CMake and Visual Studio:

```powershell
node tools/build-bananabrain.ts bananabrain-prototype
```

For an isolated SB local-build test, use the resulting bin/BananaBrain.exe with
runtime native. Copy the imported AI text data into a fresh working directory's
bwapi-data/AI; create empty read and write directories. Preserve the original
Configuration.txt as original source data. Runtime fixes tournament=true and
human_opponent=true (UCB1 opening selection and original glhf/gg); drawing is disabled. Start Protoss
first. Test only controlled names in an isolated profile.

Current storage patch bounds parsing, encodes opponent filenames, fixes shipped
configuration and saves atomically. Saved write output takes precedence over read
inputs; reset must clear both while the profile is idle and preserve AI assets.
See docs/bananabrain-source-review.md for scope and pending admission checks.
Existing BotSagi binaries and profiles are untouched.
