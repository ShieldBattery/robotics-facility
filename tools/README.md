# Tooling maintenance

The tools run directly on Node.js 24.12+ using its [built-in TypeScript type stripping](https://nodejs.org/docs/latest-v24.x/api/typescript.html).
There is no emitted JavaScript or additional runner. Relative imports use `.ts`, and
`import type` keeps type-only dependencies out of runtime and offline recipe execution.
`erasableSyntaxOnly` prevents syntax that would need a separate transpiler.

## Checks

- `pnpm typecheck`: strict TypeScript across tools and tests.
- `pnpm lint`: type-aware oxlint and an oxfmt check, using ShieldBattery's applicable
  native JavaScript/TypeScript rules and formatting conventions.
- `pnpm lint:fix`: safe lint fixes, import ordering, and formatting.
- `pnpm validate`: JSON Schema plus semantic checks on source pins, candidates, and catalog.
- `pnpm test`: network-free Node tests for archive integrity, publication, and source/build safety.
- `pnpm gen:metadata`: regenerate `metadata.ts` from `schemas/metadata.schema.json`.
- `pnpm check:metadata`: fail if generated types are stale.

Both Windows and Linux validation jobs run these checks. Publication checks run before
credentials are made available. Type checking supplements the runtime validators; JSON,
ZIPs, source provenance, command arguments, and downloaded bytes still need runtime checks.
Do not bypass a validator with a type assertion when accepting external input.

## Concepts and module boundaries

A bot's identity is separate from a particular compiled binary:

| Concept | Owns | Location |
| --- | --- | --- |
| Candidate | Identity, races, tags, review/permission status, saved-state policy | `bots/<id>/bot.json` |
| Source | Upstream commit and ordered downstream patches | `source-lock.json`, `fetch-sources.ts`, `prepare-source.ts` |
| Prepared source | Evidence that HEAD, patched index, and working files match the source pin | `source-provenance.ts` |
| Build recipe | Selected sources/dependencies, compilation steps, output names, complete recipe input list | `build-<bot>.ts`, `native/*.cmake` |
| Build machinery | Isolated CMake builds; JVM toolchain inspection, locked JARs, compilation inputs and JAR creation | `native-build.ts`, `jvm-build.ts` |
| Build record | Exact source trees, recipe hashes, toolchain, and output hashes | `.build/<name>/build-info.json` |
| Package recipe | Bot-specific files, licenses, modifications, launch contract, source inventory | `package-<bot>.ts` |
| Archive assembly | Deterministic ZIPs, indexed source files, committed recipe files, dependency notices | `package-archive.ts` |
| Release assembly | Manifest validation, archive verification, catalog fragment, immutable local output | `release-package.ts` |
| Publication | Signed catalog, immutable uploads, activation order and bounded Spaces access | `publication.ts`, `publication-store.ts`, `publish.ts` |

`validate.ts` owns runtime metadata validation; `metadata.ts` is its generated compile-time
contract. `publication-archive.ts` independently verifies ZIP sizes, hashes, paths, CRCs,
and required package files at both packaging and publication boundaries.

Bot recipes depend on shared machinery, never another bot's recipe. The native builder
accepts a recipe describing CMake targets, source-variable bindings, and an optional verified
dependency preparation step. It does not select behavior by comparing bot names. The JVM
module shares dependency and compiler operations; Scala-specific compilation remains in
PurpleWave's recipe, and plain Java compilation remains in Marine Hell's recipe.

Keep configuration, legal notices, source subsets, and bot-specific build exceptions in the
owning recipe. Extract operations when their invariants agree; do not create a universal
configuration language to hide genuinely different compilation steps. A new bot should
reuse build and release operations without importing a sibling bot tool or adding a bot-name
branch to shared machinery.

Each builder exports its recipe input list for its packager. The recipe tests ensure that
local runtime imports are included in that list and reject dependencies on another bot's
build/package wrapper. The shared release tests exercise missing files, pending reviews,
identity mismatches, and overwrite refusal. Changes to recipe inputs still require a fresh
committed build and a build/package smoke check; passing type checks alone cannot establish
that the compiler output or offline source inventory is complete.

## Recipe and release compatibility

Build provenance includes committed recipe paths and bytes. Renaming or changing a recipe
requires a fresh build record; never relax provenance validation to reuse an incompatible
`.build` directory. To finish packaging an older build, use its recorded repository revision.
To use the current tooling, rebuild into a new directory and use a new release ID.

Published catalog entries, release evidence, source archive instructions, and hashes describe
immutable releases. They may correctly refer to `.mjs` files from their original recipe.
Do not rename those historical references or replace an existing release archive. When a
runtime helper is added to a recipe, include it in the recorded recipe dependency set and
source archive so the offline rebuild remains complete. Type-only imports need no runtime copy.

The formatter targets owned TypeScript only. Downloaded sources, build output, release output,
and hashed patch files are excluded from tooling edits.
