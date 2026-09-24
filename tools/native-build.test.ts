import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { opprimoRecipe, opprimoRecipePaths } from './build-opprimobot.ts'
import { ualbertaRecipe, ualbertaRecipePaths } from './build-ualbertabot.ts'
import { parseBuildArguments, zzzkbotRecipe, zzzkbotRecipePaths } from './build-zzzkbot.ts'
import {
  makeBuildInfo,
  nativeCmakeArguments,
  nativeRecipePaths,
  validateOutputName,
} from './native-build.ts'
import { validateProvenanceRecord } from './source-provenance.ts'

const source = {
  id: 'bwapi',
  repository: 'https://example.test/bwapi.git',
  revision: '0123456789abcdef0123456789abcdef01234567',
  patches: [{ path: 'patches/bwapi/instance-discovery.patch', sha256: 'a'.repeat(64) }],
}

const validProvenance = {
  schemaVersion: 1,
  source,
  tree: '89abcdef0123456789abcdef0123456789abcdef',
}

const validState = {
  source,
  provenance: validProvenance,
  head: source.revision,
  indexTree: validProvenance.tree,
  unstaged: '',
  untracked: '',
}

await test('accepts a new safe output directory name', () => {
  assert.equal(validateOutputName('zzzkbot-release-1'), 'zzzkbot-release-1')
  assert.equal(parseBuildArguments(['zzzkbot-release-1']), 'zzzkbot-release-1')
})

await test('rejects existing-tree escape and Windows device names in output names', () => {
  for (const name of ['', '../escape', 'nested/path', 'CON', 'zzzkbot release']) {
    assert.throws(() => validateOutputName(name), /safe directory name/)
  }
  assert.throws(() => parseBuildArguments([]), /Usage/)
  assert.throws(() => parseBuildArguments(['one', 'two']), /Usage/)
})

await test('requires the prepared index tree and working tree to match provenance', () => {
  assert.doesNotThrow(() => validateProvenanceRecord(validState))
  assert.throws(
    () => validateProvenanceRecord({ ...validState, indexTree: 'f'.repeat(40) }),
    /index tree/,
  )
  assert.throws(
    () => validateProvenanceRecord({ ...validState, unstaged: 'Client.cpp' }),
    /unstaged/,
  )
  assert.throws(
    () => validateProvenanceRecord({ ...validState, untracked: 'build.log' }),
    /untracked/,
  )
})

await test('records a package-relative executable and exact prepared trees', () => {
  const info = makeBuildInfo({
    recipeRevision: 'b'.repeat(40),
    recipeSha256: 'd'.repeat(64),
    executable: 'bin/ZZZKBotClient.exe',
    executableSha256: 'c'.repeat(64),
    toolchain: {
      cmake: 'cmake version 3',
      generator: 'Visual Studio 17 2022',
      architecture: 'Win32',
      configuration: 'Release',
      msvcRuntime: 'static',
      compiler: 'cl',
      compilerId: 'MSVC',
      compilerVersion: '19',
      windowsSdkVersion: '10',
    },
    sources: [{ directory: 'sources/bwapi', tree: validProvenance.tree, source }],
  })
  assert.deepEqual(info, {
    schemaVersion: 1,
    recipeRevision: 'b'.repeat(40),
    recipeSha256: 'd'.repeat(64),
    executable: 'bin/ZZZKBotClient.exe',
    executableSha256: 'c'.repeat(64),
    toolchain: {
      cmake: 'cmake version 3',
      generator: 'Visual Studio 17 2022',
      architecture: 'Win32',
      configuration: 'Release',
      msvcRuntime: 'static',
      compiler: 'cl',
      compilerId: 'MSVC',
      compilerVersion: '19',
      windowsSdkVersion: '10',
    },
    sources: [
      {
        id: 'bwapi',
        directory: 'sources/bwapi',
        tree: validProvenance.tree,
        source,
      },
    ],
  })
})

await test('native recipes map every prepared source into CMake and own their inputs', () => {
  const root = path.join('fixture', 'root')
  const output = path.join(root, '.build', 'release')
  for (const [recipe, recipePaths, target] of [
    [zzzkbotRecipe, zzzkbotRecipePaths, 'ZZZKBotClient'],
    [ualbertaRecipe, ualbertaRecipePaths, 'UAlbertaBot'],
    [opprimoRecipe(), opprimoRecipePaths, 'OpprimoBot'],
  ] as const) {
    assert.equal(recipe.target, target)
    assert.equal(recipe.recipePaths, recipePaths)
    assert.equal(new Set(recipePaths).size, recipePaths.length)
    for (const shared of nativeRecipePaths) assert.ok(recipePaths.includes(shared))
    const args = nativeCmakeArguments(recipe, output, root)
    assert.ok(args.includes('-DSB_NATIVE_BOT=' + recipe.botId))
    assert.ok(args.includes('-D' + recipe.outputVariable + '=' + path.join(output, 'bin')))
    for (const [variable, id] of Object.entries(recipe.sourceVariables)) {
      assert.ok(recipe.sourceIds.includes(id))
      assert.ok(args.includes('-D' + variable + '=' + path.join(output, 'sources', id)))
    }
  }
  assert.equal(typeof opprimoRecipe().prepareDependencies, 'function')
  assert.equal(zzzkbotRecipe.prepareDependencies, undefined)
  assert.equal(ualbertaRecipe.prepareDependencies, undefined)
})

await test('native recipes reject unmapped sources and dependency overrides', () => {
  const root = path.join('fixture', 'root')
  const output = path.join(root, '.build', 'release')
  assert.throws(
    () =>
      nativeCmakeArguments(
        { ...zzzkbotRecipe, sourceIds: ['bwapi', 'zzzkbot', 'extra'] },
        output,
        root,
      ),
    /source variables/,
  )
  assert.throws(
    () =>
      nativeCmakeArguments(
        {
          ...zzzkbotRecipe,
          sourceVariables: { BWAPI_SOURCE_DIR: 'bwapi', ZZZKBOT_SOURCE_DIR: 'bwapi' },
        },
        output,
        root,
      ),
    /source variables/,
  )
  assert.throws(
    () => nativeCmakeArguments(zzzkbotRecipe, output, root, { SB_NATIVE_BOT: 'other' }),
    /conflicting CMake variables/,
  )
  assert.throws(
    () => nativeCmakeArguments(zzzkbotRecipe, output, root, { BWAPI_SOURCE_DIR: 'elsewhere' }),
    /conflicting CMake variables/,
  )
  assert.throws(
    () => nativeCmakeArguments(zzzkbotRecipe, output, root, { 'INVALID-NAME': 'elsewhere' }),
    /invalid or conflicting CMake variables/,
  )
  const boostArgs = nativeCmakeArguments(opprimoRecipe(), output, root, {
    OPPRIMOBOT_BOOST_DIR: path.join(output, 'deps', 'boost_1_56_0'),
  })
  assert.ok(
    boostArgs.includes('-DOPPRIMOBOT_BOOST_DIR=' + path.join(output, 'deps', 'boost_1_56_0')),
  )
})
