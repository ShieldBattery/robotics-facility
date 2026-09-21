# robotics-facility

Pinned bot sources, build metadata, and the downloadable bot catalog for ShieldBattery.
Each bot retains its upstream license; this repository does not relicense bot code.

This is a local development scaffold. ZZZKBot and UAlbertaBot have prototype-tested
candidate records, not approved downloadable releases. The public-format catalog is
intentionally empty. No uploader, signing service, installer, or offline app integration
is implemented here yet.

## Working locally

Requires Node.js 24+, pnpm, and Git. Native builds additionally require Visual Studio
C++ tools and CMake as described in the ShieldBattery build instructions.

```powershell
pnpm install --frozen-lockfile
pnpm validate
pnpm test
pnpm sources
```

`pnpm sources` clones each exact `source-lock.json` commit into `.sources/<id>`.
Sources are independent ignored checkouts, not submodules or vendored source trees.
An existing checkout must already match its pin, upstream origin, and be clean; the
fetcher refuses to reset local changes. Change source pins deliberately and move
aside old checkouts when updating. It does not recursively initialize upstream
submodules; inventory and pin any additional sources before building a bot that
needs them. Fetching a pin is not proof of a reproducible or license-complete build.

Existing local research clones can seed the checkouts without another download:

```powershell
node tools/fetch-sources.mjs --from bwapi=C:\path\to\bwapi --from zzzkbot=C:\path\to\ZZZKBot --from ualbertabot=C:\path\to\ualbertabot
```

The tool does not modify the seed repositories. The canonical upstream remains in
the lock and clone origin. No hosted GitHub repository is needed for this workflow.

## Layout

- `source-lock.json`: full upstream commit pins shared by build recipes.
- `bots/<id>/bot.json`: candidate identity, attribution, capabilities, permissions,
  ratings provenance, and existing build evidence.
- `schemas/metadata.schema.json`: draft versioned candidate, package, and catalog contracts.
- `catalog/catalog.json`: publishable releases only; an empty catalog is valid.
- `tools/`: source fetching and metadata checks, with network-free tests.
- `.sources/`, `.build/`, `dist/`: ignored local sources and build artifacts.

The initial build recipes still live in ShieldBattery at the exact revision listed
in each candidate. See each bot's `BUILD.md`. Move those recipes and any required
host code here with their notices in a later checkpoint; fetching sources alone
does not create a redistributable package.

See [catalog and offline installation design](docs/catalog-and-offline.md) for
refresh behavior, installed-state ownership, packaging, and hosting decisions.
