import assert from 'node:assert/strict'
import test from 'node:test'
import {
  makeBuildInfo,
  parseBuildArguments,
  validateOutputName,
  validateProvenanceRecord,
} from './build-zzzkbot.mjs'

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

test('accepts a new safe output directory name', () => {
  assert.equal(validateOutputName('zzzkbot-release-1'), 'zzzkbot-release-1')
  assert.equal(parseBuildArguments(['zzzkbot-release-1']), 'zzzkbot-release-1')
})

test('rejects existing-tree escape and Windows device names in output names', () => {
  for (const name of ['', '../escape', 'nested/path', 'CON', 'zzzkbot release']) {
    assert.throws(() => validateOutputName(name), /safe directory name/)
  }
  assert.throws(() => parseBuildArguments([]), /Usage/)
  assert.throws(() => parseBuildArguments(['one', 'two']), /Usage/)
})

test('requires the prepared index tree and working tree to match provenance', () => {
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

test('records a package-relative executable and exact prepared trees', () => {
  const info = makeBuildInfo({
    recipeRevision: 'b'.repeat(40),
    recipeSha256: 'd'.repeat(64),
    executable: 'bin/ZZZKBotClient.exe',
    executableSha256: 'c'.repeat(64),
    toolchain: { generator: 'Visual Studio 17 2022' },
    sources: [{ directory: 'sources/bwapi', tree: validProvenance.tree, source }],
  })
  assert.deepEqual(info, {
    schemaVersion: 1,
    recipeRevision: 'b'.repeat(40),
    recipeSha256: 'd'.repeat(64),
    executable: 'bin/ZZZKBotClient.exe',
    executableSha256: 'c'.repeat(64),
    toolchain: { generator: 'Visual Studio 17 2022' },
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
