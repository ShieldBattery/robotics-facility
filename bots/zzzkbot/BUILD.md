# zzzkbot build status

The exact source IDs, ShieldBattery recipe revision, and prototype evidence are
recorded in `bot.json`. Run `pnpm sources` from the repository root to fetch the
pinned upstream checkouts. Licenses remain in those upstream trees at the paths
recorded in the candidate metadata; include all required dependency notices and
source material before distributing an artifact.

The runnable build recipe remains in ShieldBattery's `tools/bwapi/README.md` at
commit `980037a028c78a9c0285d34337b6fbd8ddeb9ff0`. It builds Release Win32 with
Visual Studio and CMake. Source paths are configurable in the CMake recipes, so
`.sources/` can supply the inputs. This is not yet a standalone recipe in this repo.

The current profile describes the tested configuration, not every capability of
the upstream project. No release archive or catalog installation is approved yet.
