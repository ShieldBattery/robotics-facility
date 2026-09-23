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

## Module boundaries

- `fetch-sources.ts` validates source locks and maintains independent pinned source checkouts.
- `prepare-source.ts` applies reviewed patches to isolated copies and records provenance.
- `build-*.ts` creates a fresh build, verifies dependencies, and records compilation inputs/outputs.
- `package-*.ts` verifies those records and assembles reviewed binaries with corresponding source.
- `validate.ts` owns metadata validation; `metadata.ts` is its generated compile-time contract.
- `publication-archive.ts` verifies ZIP sizes, hashes, paths, CRCs, and required package files.
- `publication.ts` signs/verifies catalogs and controls upload/activation order.
- `publication-store.ts` provides bounded Spaces reads and writes; `publish.ts` owns CLI/configuration.

Keep bot-specific compilation details in the bot recipe. Extract a shared operation when it
has the same invariants across recipes; avoid routing unrelated recipes through a growing
set of bot-name conditionals. Tests should exercise failures and trust boundaries, not just
repeat the implementation's steps.

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
