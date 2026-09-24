import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import { recipePaths as marineHell } from './build-marine-hell.ts'
import { opprimoRecipePaths as opprimo } from './build-opprimobot.ts'
import { recipePaths as purpleWave } from './build-purplewave.ts'
import { ualbertaRecipePaths as ualberta } from './build-ualbertabot.ts'
import { zzzkbotRecipePaths as zzzkbot } from './build-zzzkbot.ts'

// Node strips type-only declarations; only value imports need files in an offline recipe.
function runtimeImports(file: string, contents: string): string[] {
  const source = ts.createSourceFile(file, contents, ts.ScriptTarget.Latest, true)
  const imports: string[] = []
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause
      if (clause?.isTypeOnly) continue
      const bindings = clause?.namedBindings
      if (
        clause &&
        !clause.name &&
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.every(item => item.isTypeOnly)
      )
        continue
    } else {
      if (statement.isTypeOnly) continue
      if (
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.every(item => item.isTypeOnly)
      )
        continue
    }
    const target = statement.moduleSpecifier.text
    if (target.startsWith('.')) imports.push(path.posix.join(path.posix.dirname(file), target))
  }
  return imports
}

for (const [bot, paths] of Object.entries({
  zzzkbot,
  ualbertabot: ualberta,
  opprimobot: opprimo,
  purplewave: purpleWave,
  'marine-hell': marineHell,
})) {
  await test(`${bot} recipe includes its complete local runtime import closure`, async () => {
    const included = new Set(paths)
    assert.equal(included.size, paths.length, 'recipe paths must be unique')
    for (const file of paths) {
      const contents = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
      if (!file.endsWith('.ts')) continue
      for (const dependency of runtimeImports(file, contents)) {
        assert.ok(
          included.has(dependency),
          `${file} needs ${dependency} in the recipe and source archive`,
        )
        const otherBot = /^tools\/(?:build|package)-(.+)\.ts$/.exec(dependency)?.[1]
        if (
          otherBot &&
          ['zzzkbot', 'ualbertabot', 'opprimobot', 'purplewave', 'marine-hell'].includes(otherBot)
        ) {
          assert.equal(
            otherBot,
            bot,
            `${file} must use shared machinery instead of another bot recipe`,
          )
        }
      }
    }
  })
}
