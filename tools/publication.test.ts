import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { glob, readFile } from 'node:fs/promises'
import test from 'node:test'
import yazl from 'yazl'
import type { Catalog, Package } from './metadata.ts'
import type { CatalogRelease } from './publication-archive.ts'
import { archivePath, sha256, verifyArchive } from './publication-archive.ts'
import type { ObjectMetadata, PublicationStore } from './publication-store.ts'
import { objectKey } from './publication-store.ts'
import {
  baseUrl,
  canonical,
  preparePublication,
  publishPrepared,
  revision,
  signCatalog,
  verifyCatalog,
} from './publication.ts'
import { parsePublishArgs } from './publish.ts'
import { validate } from './validate.ts'

const stagingBase = 'https://staging.example.test/robotics-facility/'
const productionBase = 'https://prod.example.test/robotics-facility/'
function keys(keyId = 'test-key') {
  const pair = generateKeyPairSync('ed25519')
  return {
    keyId,
    privateKey: pair.privateKey.export({ format: 'pem', type: 'pkcs8' }),
    publicKey: pair.publicKey.export({ format: 'pem', type: 'spki' }),
  }
}
type ZipEntry = [string, string | Buffer, number?]
async function zip(entries: ZipEntry[]): Promise<Buffer> {
  const archive = new yazl.ZipFile()
  const chunks: Buffer[] = []
  const result = new Promise<Buffer>((resolve, reject) => {
    archive.outputStream.on('data', c => chunks.push(c))
    archive.outputStream.on('end', () => resolve(Buffer.concat(chunks)))
    archive.outputStream.on('error', reject)
  })
  for (const [name, content, mode] of entries)
    archive.addBuffer(Buffer.from(content), name, mode ? { mode } : {})
  archive.end()
  return result
}
async function fixture() {
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
  const manifest = Buffer.from(JSON.stringify(pkg))
  const entries: ZipEntry[] = [
    ['package.json', manifest],
    ['bin/bot.exe', 'not executable fixture'],
    ['LICENSE.txt', 'fixture notice'],
  ]
  const bytes = await zip(entries)
  const release: CatalogRelease = {
    package: pkg,
    artifact: {
      url: 'https://input.example.test/bot.zip',
      sha256: sha256(bytes),
      sizeBytes: bytes.length,
      manifestSha256: sha256(manifest),
      format: 'zip',
    },
  }
  return {
    pkg,
    release,
    bytes,
    entries,
    catalog: {
      schemaVersion: 1,
      revision: 0,
      bots: [{ bot: candidate.bot, releases: [release] }],
    } satisfies Catalog,
  }
}
function storeFixture(): PublicationStore & {
  objects: Map<string, Buffer>
  writes: string[]
  metadata: Map<string, ObjectMetadata>
  fail?: (name: string) => boolean
} {
  const objects = new Map<string, Buffer>(),
    writes: string[] = [],
    metadata = new Map<string, ObjectMetadata>()
  return {
    objects,
    writes,
    metadata,
    fail: undefined,
    async get(name, limit) {
      const data = objects.get(name)
      if (data && data.length > limit) throw new Error('Object too large')
      return data ?? null
    },
    async put(name, bytes, options) {
      if (this.fail?.(name)) throw new Error('Simulated upload failure')
      writes.push(name)
      metadata.set(name, { ...options })
      objects.set(name, Buffer.from(bytes))
    },
  }
}
async function stage(f: Awaited<ReturnType<typeof fixture>>) {
  return preparePublication({
    channel: 'staging',
    nextRevision: 1,
    inputCatalog: f.catalog,
    publicBaseUrl: stagingBase,
    download: async () => f.bytes,
  })
}
const signing = (k: ReturnType<typeof keys>) => ({
  trust: { keyId: k.keyId, publicKey: k.publicKey },
  privateKey: k.privateKey,
})

await test('archive verifies exact bytes, embedded manifest, files and notices', async () => {
  const f = await fixture()
  await verifyArchive(f.bytes, f.release)
  await assert.rejects(
    verifyArchive(Buffer.concat([f.bytes, Buffer.from('x')]), f.release),
    /size or SHA/,
  )
  await assert.rejects(
    verifyArchive(f.bytes, {
      ...f.release,
      artifact: { ...f.release.artifact, manifestSha256: '0'.repeat(64) },
    }),
    /descriptor/,
  )
  await assert.rejects(
    verifyArchive(f.bytes, { ...f.release, package: { ...f.pkg, version: 'different' } }),
    /descriptor/,
  )
  for (const omitted of ['package.json', 'bin/bot.exe', 'LICENSE.txt']) {
    const bytes = await zip(f.entries.filter(([name]) => name !== omitted))
    await assert.rejects(
      verifyArchive(bytes, {
        ...f.release,
        artifact: { ...f.release.artifact, sizeBytes: bytes.length, sha256: sha256(bytes) },
      }),
    )
  }
})

await test('archive rejects Windows escapes, symlinks, path and case collisions', async () => {
  for (const p of [
    '../x',
    '/x',
    'a/../x',
    'C:/x',
    'a\\x',
    'CON.txt',
    'x/nul',
    'x:stream',
    'a.',
    'a ',
  ])
    assert.throws(() => archivePath(p))
  const f = await fixture()
  for (const extra of [
    [['bin/BOT.exe', 'collision']],
    [['bin', 'not a directory']],
    [['link', 'target', 0o120777]],
  ] satisfies ZipEntry[][]) {
    const bytes = await zip([...f.entries, ...extra])
    await assert.rejects(
      verifyArchive(bytes, {
        ...f.release,
        artifact: { ...f.release.artifact, sizeBytes: bytes.length, sha256: sha256(bytes) },
      }),
    )
  }
})

await test('signed catalogs bind channel, trusted key, and exact payload bytes', async () => {
  const f = await fixture(),
    k = keys(),
    prepared = await stage(f)
  const signed = signCatalog(prepared.catalog, {
    channel: 'staging',
    keyId: k.keyId,
    privateKey: k.privateKey,
  })
  const trust = { channel: 'staging', keyId: k.keyId, publicKey: k.publicKey }
  assert.deepEqual(verifyCatalog(signed, trust), prepared.catalog)
  assert.throws(() => verifyCatalog(signed, { ...trust, channel: 'production' }), /context/)
  assert.throws(() => verifyCatalog(signed, { ...trust, publicKey: keys().publicKey }), /signature/)
  const tampered = JSON.parse(signed.toString('utf8')) as {
    payload: string
    signature: string
    envelopeVersion: number
  }
  const payload = JSON.parse(Buffer.from(tampered.payload, 'base64').toString('utf8')) as {
    catalog: Catalog
  }
  payload.catalog.revision++
  tampered.payload = Buffer.from(canonical(payload)).toString('base64')
  assert.throws(() => verifyCatalog(Buffer.from(JSON.stringify(tampered)), trust), /signature/)
})

await test('prepare refuses empty/unapproved catalogs and corrupt archives before publication', async () => {
  const f = await fixture()
  await assert.rejects(
    preparePublication({
      channel: 'staging',
      nextRevision: 1,
      inputCatalog: { schemaVersion: 1, revision: 0, bots: [] },
      publicBaseUrl: stagingBase,
    }),
    /No approved/,
  )
  const original = f.pkg.sourceReview.status
  f.pkg.sourceReview.status = 'pending'
  await assert.rejects(stage(f), /source review/)
  f.pkg.sourceReview.status = original
  f.bytes = Buffer.from('broken')
  await assert.rejects(stage(f), /size or SHA/)
})

await test('publication orders verified artifacts before activation and creates receipt last; retry is idempotent', async () => {
  const f = await fixture(),
    k = keys(),
    store = storeFixture(),
    prepared = await stage(f)
  const args = { prepared, store, publicBaseUrl: stagingBase, ...signing(k) }
  await publishPrepared(args)
  assert.equal(store.writes.at(-2), 'catalog.json')
  assert.equal(store.writes.at(-1), 'published/1.json')
  assert.equal(
    store.metadata.get('catalog.json')?.cacheControl,
    'public, no-cache, max-age=0, must-revalidate',
  )
  for (const [name, metadata] of store.metadata) {
    if (name !== 'catalog.json') {
      assert.equal(metadata.cacheControl, 'public, max-age=31536000, immutable')
    }
  }
  assert.ok(
    store.writes.indexOf(`packages/${f.release.artifact.sha256}.zip`) <
      store.writes.indexOf('catalog.json'),
  )
  const receipt = store.objects.get('published/1.json')
  assert.ok(receipt)
  assert.deepEqual(verifyCatalog(receipt, { channel: 'staging', ...k }), prepared.catalog)
  const before = [...store.writes]
  await publishPrepared(args)
  assert.deepEqual(store.writes, before)
})

await test('failed package upload cannot activate a catalog or authorize promotion', async () => {
  const f = await fixture(),
    k = keys(),
    store = storeFixture(),
    prepared = await stage(f)
  store.fail = name => name.startsWith('packages/')
  await assert.rejects(
    publishPrepared({ prepared, store, publicBaseUrl: stagingBase, ...signing(k) }),
    /upload failure/,
  )
  assert.equal(store.objects.has('catalog.json'), false)
  assert.equal(store.objects.has('published/1.json'), false)
})

await test('failed activation leaves no promotion receipt and can be retried', async () => {
  const f = await fixture(),
    k = keys(),
    store = storeFixture(),
    prepared = await stage(f)
  store.fail = name => name === 'catalog.json'
  const args = { prepared, store, publicBaseUrl: stagingBase, ...signing(k) }
  await assert.rejects(publishPrepared(args), /upload failure/)
  assert.equal(store.objects.has('catalogs/1.json'), true)
  assert.equal(store.objects.has('published/1.json'), false)
  store.fail = undefined
  await publishPrepared(args)
  assert.equal(store.objects.has('published/1.json'), true)
})

await test('revisions and release identities cannot be silently reused with different content', async () => {
  const f = await fixture(),
    k = keys(),
    store = storeFixture(),
    prepared = await stage(f)
  const args = { prepared, store, publicBaseUrl: stagingBase, ...signing(k) }
  await publishPrepared(args)
  const modified = structuredClone(prepared)
  modified.catalog.bots[0].bot.description = 'updated description'
  await assert.rejects(publishPrepared({ ...args, prepared: modified }), /revision already used/)
  const changedRelease = structuredClone(prepared)
  changedRelease.catalog.revision = 2
  changedRelease.catalog.bots[0].releases[0].package.version = 'changed'
  await assert.rejects(
    publishPrepared({ ...args, prepared: changedRelease }),
    /Immutable object differs/,
  )
  const next = structuredClone(prepared)
  next.catalog.revision = 2
  await publishPrepared({ ...args, prepared: next })
  await assert.rejects(publishPrepared(args), /roll back/)
})

await test('production copies exact staged ZIP bytes and requires staged content-addressed URLs', async () => {
  const f = await fixture()
  f.release.releaseStatus = 'production-approved'
  const staged = await stage(f)
  const promoted = await preparePublication({
    channel: 'production',
    nextRevision: 7,
    inputCatalog: staged.catalog,
    publicBaseUrl: productionBase,
    stagingBaseUrl: stagingBase,
    download: async url => {
      assert.equal(url, `${stagingBase}packages/${f.release.artifact.sha256}.zip`)
      return f.bytes
    },
  })
  assert.ok(promoted.artifacts.get(f.release.artifact.sha256)?.equals(f.bytes))
  assert.equal(
    promoted.catalog.bots[0].releases[0].artifact.url,
    `${productionBase}packages/${f.release.artifact.sha256}.zip`,
  )
  staged.catalog.bots[0].releases[0].artifact.url = 'https://elsewhere.test/bot.zip'
  await assert.rejects(
    preparePublication({
      channel: 'production',
      nextRevision: 8,
      inputCatalog: staged.catalog,
      publicBaseUrl: productionBase,
      stagingBaseUrl: stagingBase,
    }),
    /Staging package URL/,
  )
})

await test('production selects only approved releases from mixed staging catalog', async () => {
  const f = await fixture()
  f.release.releaseStatus = 'production-approved'
  const staged = await stage(f)
  const approved = staged.catalog.bots[0].releases[0]
  const candidate = structuredClone(approved)
  candidate.package.releaseId = 'candidate-2'
  candidate.releaseStatus = 'candidate'
  staged.catalog.bots[0].releases.push(candidate)
  staged.catalog.bots.push({
    bot: { ...staged.catalog.bots[0].bot, id: 'staging-only' },
    releases: [{ ...candidate, package: { ...candidate.package, botId: 'staging-only' } }],
  })
  let downloads = 0
  const promoted = await preparePublication({
    channel: 'production',
    nextRevision: 2,
    inputCatalog: staged.catalog,
    publicBaseUrl: productionBase,
    stagingBaseUrl: stagingBase,
    download: async () => {
      downloads++
      return f.bytes
    },
  })
  assert.equal(downloads, 1)
  assert.equal(promoted.catalog.bots.length, 1)
  assert.equal(promoted.catalog.bots[0].releases.length, 1)
  assert.equal(promoted.catalog.bots[0].releases[0].package.releaseId, 'test-1')
  assert.equal(staged.catalog.bots.length, 2)
  assert.ok(promoted.artifacts.get(approved.artifact.sha256)?.equals(f.bytes))
})

await test('staging is a publication channel, not a release approval status', async () => {
  const f = await fixture()
  Object.assign(f.release, { releaseStatus: 'staging' })
  assert.throws(() => validate('catalog', f.catalog), /releaseStatus/)
})

await test('missing and candidate statuses never authorize production', async () => {
  for (const releaseStatus of [undefined, 'candidate'] as const) {
    const f = await fixture()
    f.release.releaseStatus = releaseStatus
    const staged = await stage(f)
    await assert.rejects(
      preparePublication({
        channel: 'production',
        nextRevision: 2,
        inputCatalog: staged.catalog,
        publicBaseUrl: productionBase,
        stagingBaseUrl: stagingBase,
        download: async () => {
          throw new Error('Must not download excluded releases')
        },
      }),
      /No approved releases/,
    )
    const k = keys()
    assert.throws(
      () =>
        signCatalog(staged.catalog, {
          channel: 'production',
          keyId: k.keyId,
          privateKey: k.privateKey,
        }),
      /production-approved/,
    )
    const store = storeFixture()
    await assert.rejects(
      publishPrepared({
        prepared: { ...staged, channel: 'production' },
        store,
        publicBaseUrl: productionBase,
        ...signing(k),
      }),
      /production-approved/,
    )
    assert.deepEqual(store.writes, [])
  }
})

await test('object keys, URLs, and workflow input parsing constrain publication targets', () => {
  assert.equal(objectKey('catalog.json'), 'robotics-facility/catalog.json')
  for (const key of [
    '../catalog.json',
    '/catalog.json',
    'app/a.zip',
    'packages/../../x',
    'catalogs/0.json',
  ])
    assert.throws(() => objectKey(key))
  for (const value of ['0', '-1', '1e3', '9007199254740992', '1;echo hi'])
    assert.throws(() => revision(value))
  assert.throws(() => baseUrl('http://example.test/robotics-facility/'))
  assert.throws(() => baseUrl('https://example.test/'))
  assert.throws(() => baseUrl('https://example.test/public/robotics-facility/'))
  assert.equal(baseUrl(stagingBase), stagingBase)
  assert.equal(
    parsePublishArgs(['prepare', 'production', '--revision', '2', '--staging-revision', '1'])
      .prepare,
    true,
  )
  assert.throws(() => parsePublishArgs(['production', '--revision', '2']))
  assert.throws(() => parsePublishArgs(['staging', '--revision', '2', '--staging-revision', '1']))
})

type ProductionApproval = {
  botId: string
  releaseId: string
  archiveSha256: string
  sizeBytes: number
  manifestSha256: string
  packageSha256: string
  scope: {
    selectableRaces: Package['profile']['selectableRaces']
    existingFormatSupport: Package['profile']['formats'][number]['support']
  }
}

await test('catalog production approvals match release review records', async () => {
  const catalog: unknown = JSON.parse(
    await readFile(new URL('../catalog/catalog.json', import.meta.url), 'utf8'),
  )
  validate('catalog', catalog)
  const reviewDir = new URL('../docs/releases/', import.meta.url)
  const records: ProductionApproval[] = []
  for await (const file of glob('*-production-approvals.json', { cwd: reviewDir })) {
    const review: { approvals: ProductionApproval[] } = JSON.parse(
      await readFile(new URL(file, reviewDir), 'utf8'),
    )
    records.push(...review.approvals)
  }
  const approved = catalog.bots
    .flatMap(bot => bot.releases)
    .filter(release => release.releaseStatus === 'production-approved')
  for (const release of approved) {
    const { botId, releaseId } = release.package
    const matches = records.filter(entry => entry.botId === botId && entry.releaseId === releaseId)
    assert.equal(
      matches.length,
      1,
      `Expected one production approval record for ${botId}/${releaseId}`,
    )
    const [record] = matches
    assert.equal(release.artifact.sha256, record.archiveSha256)
    assert.equal(release.artifact.sizeBytes, record.sizeBytes)
    assert.equal(release.artifact.manifestSha256, record.manifestSha256)
    assert.equal(sha256(canonical(release.package)), record.packageSha256)
    assert.deepEqual(release.package.profile.selectableRaces, record.scope.selectableRaces)
    assert.equal(
      release.package.profile.formats.find(format => format.id === 'one-v-one')?.support,
      record.scope.existingFormatSupport,
    )
    assert.equal(release.package.permissions.localDistribution.status, 'approved')
    assert.equal(release.package.sourceReview.status, 'approved')
    if (botId === 'steamhammer' && releaseId === 'steamhammer-sb-1') {
      assert.equal(
        release.package.profile.formats.find(format => format.id === 'free-for-all')?.support,
        'incompatible',
      )
    }
  }
})
