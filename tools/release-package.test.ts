import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import type { Catalog, Package } from './metadata.ts'
import type { ArchiveEntry } from './package-archive.ts'
import { verifyArchive } from './publication-archive.ts'
import { writeReleasePackage } from './release-package.ts'
import { validate } from './validate.ts'

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'release-package-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const candidate: unknown = JSON.parse(
    await readFile(new URL('../bots/zzzkbot/bot.json', import.meta.url), 'utf8'),
  )
  validate('candidate', candidate)
  const pkg: Package = {
    schemaVersion: 1,
    botId: 'zzzkbot',
    releaseId: 'test-1',
    version: 'fixture',
    platform: { os: 'windows', architecture: 'x86' },
    runtime: { kind: 'native' },
    launch: { entrypoint: 'bin/bot.exe', arguments: [], workingDirectory: '.' },
    profile: candidate.profile,
    bwapi: { version: '4.4.0', protocol: 10003, minimumBridgeVersion: 'fixture' },
    sources: [
      {
        id: 'bot',
        repository: 'https://example.test/bot.git',
        revision: 'a'.repeat(40),
        patches: [],
      },
    ],
    licenses: [{ name: 'Fixture', noticePath: 'LICENSE.txt' }],
    permissions: {
      localDistribution: { status: 'approved', evidence: 'TEST ONLY' },
      publicCompetition: { status: 'unreviewed', evidence: 'TEST ONLY' },
    },
    sourceReview: { status: 'approved', evidence: 'TEST ONLY' },
    writableDirectories: ['bwapi-data/write'],
    build: {
      recipeSource: {
        id: 'recipe',
        repository: 'https://example.test/build.git',
        revision: 'b'.repeat(40),
      },
      recipePath: 'build.cmake',
      toolchain: 'Fixture',
    },
  }
  return {
    root,
    candidate,
    pkg,
    entries: [
      ['bin/bot.exe', Buffer.from('fixture')],
      ['LICENSE.txt', Buffer.from('notice')],
    ] satisfies ArchiveEntry[],
  }
}

await test('release assembly verifies the catalog and archive and refuses to overwrite a release', async t => {
  const input = await fixture(t)
  const output = await writeReleasePackage({ ...input, review: false })
  const catalog: Catalog = JSON.parse(
    await readFile(path.join(output.destination, 'catalog.json'), 'utf8'),
  )
  validate('catalog', catalog)
  await verifyArchive(
    await readFile(path.join(output.destination, 'test-1.zip')),
    catalog.bots[0].releases[0],
  )
  assert.equal(input.entries.length, 2)
  await assert.rejects(writeReleasePackage({ ...input, review: false }), /EEXIST/)
})

await test('release assembly refuses incomplete or mismatched packages before writing output', async t => {
  const input = await fixture(t)
  await assert.rejects(writeReleasePackage({ ...input, entries: [], review: false }))
  await assert.rejects(
    writeReleasePackage({ ...input, pkg: { ...input.pkg, botId: 'another-bot' }, review: false }),
    /identities differ/,
  )
  assert.deepEqual(await readdir(input.root), [])
})

await test('pending review packages cannot enter a publishable catalog', async t => {
  const input = await fixture(t)
  input.pkg.sourceReview = { status: 'pending', evidence: 'Review fixture' }
  await assert.rejects(writeReleasePackage({ ...input, review: false }))
  assert.deepEqual(await readdir(input.root), [])
  const output = await writeReleasePackage({ ...input, review: true })
  assert.equal(path.basename(output.destination), 'test-1-review')
  const catalog: unknown = JSON.parse(
    await readFile(path.join(output.destination, 'catalog.json'), 'utf8'),
  )
  assert.throws(() => validate('catalog', catalog))
})
