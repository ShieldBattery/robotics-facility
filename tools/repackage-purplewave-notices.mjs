import { readFile, mkdir, lstat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import yauzl from 'yauzl'
import { makeArchive } from './package-zzzkbot.mjs'
import { archivePath, sha256, verifyArchive } from './publication-archive.mjs'
import { validate } from './validate.mjs'

const oldReleaseId = 'purplewave-sb-3'
const releaseId = 'purplewave-sb-4'
const oldArchiveSha256 = '748767387d6c1a633b8f9f6f2595e6e4af471b16eeff31a56bf39ce3c7c2dd55'
const oldArchiveSize = 19_382_241
const noticeSha256 = '097eee0a217d07a7b298a0e9e725313884582275a2ec95e01c7c7168d1b087de'
const buildRevision = 'bac6f6b1c26a9b99e06c22b08f311561ee35321b'
const reviewUrl = 'https://github.com/ShieldBattery/robotics-facility/blob/purplewave-sb-4/docs/releases/purplewave-sb-4.md'
const newPaths = Object.freeze([
  'notices/JNA-THIRD-PARTY-NOTICES.txt',
  'source/bots/purplewave/JNA-THIRD-PARTY-NOTICES.txt',
  'source/bots/purplewave/RELEASE-sb-4.txt',
  'source/tools/repackage-purplewave-notices.mjs',
  'source/repackage-info.json',
])
const modifiedPaths = Object.freeze([
  'notices/RELEASE.txt',
  'package.json',
  'work/bwapi-data/AI/revision.txt',
])
const allowed = new Set([...newPaths, ...modifiedPaths])
const json = async (file) => JSON.parse(await readFile(file, 'utf8'))

export async function readArchiveEntries(bytes) {
  return await new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(error)
      const entries = new Map()
      const normalized = new Set()
      zip.on('error', reject)
      zip.on('entry', (entry) => {
        try {
          const name = entry.fileName
          const key = archivePath(name)
          if (normalized.has(key)) throw new Error(`Duplicate archive path: ${name}`)
          normalized.add(key)
          if (name.endsWith('/')) {
            if (entry.uncompressedSize !== 0) throw new Error(`Directory has content: ${name}`)
            entries.set(name, Buffer.alloc(0))
            zip.readEntry()
            return
          }
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError) return reject(streamError)
            const chunks = []
            let size = 0
            stream.on('error', reject)
            stream.on('data', (chunk) => {
              size += chunk.length
              if (size > entry.uncompressedSize) stream.destroy(new Error(`Oversized archive entry: ${name}`))
              else chunks.push(chunk)
            })
            stream.on('end', () => {
              if (size !== entry.uncompressedSize) return reject(new Error(`Archive entry size mismatch: ${name}`))
              entries.set(name, Buffer.concat(chunks))
              zip.readEntry()
            })
          })
        } catch (entryError) {
          zip.close()
          reject(entryError)
        }
      })
      zip.on('end', () => resolve(entries))
      zip.readEntry()
    })
  })
}

export function changedArchivePaths(before, after) {
  const changed = []
  for (const [name, bytes] of before) {
    const replacement = after.get(name)
    if (!replacement) throw new Error(`Removed archive entry: ${name}`)
    if (!bytes.equals(replacement)) changed.push(name)
  }
  for (const name of after.keys()) if (!before.has(name)) changed.push(name)
  changed.sort()
  if (changed.length !== allowed.size ||
      changed.some((name) => !allowed.has(name)) ||
      [...allowed].some((name) => !changed.includes(name)))
    throw new Error(`Archive changed outside the explicit sb4 allowlist: ${changed.join(', ')}`)
  return changed
}

export async function repackagePurpleWaveNotices({ root = process.cwd() } = {}) {
  const sourceArchive = path.join(root, 'dist', oldReleaseId, `${oldReleaseId}.zip`)
  const sourceCatalog = path.join(root, 'dist', oldReleaseId, 'catalog.json')
  const [original, oldCatalog, notice, releaseNotice, script] = await Promise.all([
    readFile(sourceArchive),
    json(sourceCatalog),
    readFile(path.join(root, 'bots/purplewave/JNA-THIRD-PARTY-NOTICES.txt')),
    readFile(path.join(root, 'bots/purplewave/RELEASE.txt')),
    readFile(path.join(root, 'tools/repackage-purplewave-notices.mjs')),
  ])
  if (original.length !== oldArchiveSize || sha256(original) !== oldArchiveSha256)
    throw new Error('The sb3 input ZIP differs from the reviewed artifact')
  if (notice.length !== 1_153 || sha256(notice) !== noticeSha256)
    throw new Error('The pinned libffi notice changed')
  if (oldCatalog.schemaVersion !== 1 || oldCatalog.bots?.length !== 1 ||
      oldCatalog.bots[0].releases?.length !== 1)
    throw new Error('Expected a single sb3 catalog release')
  const oldRelease = oldCatalog.bots[0].releases[0]
  const oldPackage = oldRelease.package
  if (oldPackage.botId !== 'purplewave' || oldPackage.releaseId !== oldReleaseId ||
      oldPackage.build.recipeSource.revision !== buildRevision ||
      oldPackage.sourceReview.status !== 'approved' ||
      oldPackage.permissions.localDistribution.status !== 'approved')
    throw new Error('Unexpected sb3 package or review state')
  validate('catalog', oldCatalog)
  await verifyArchive(original, oldRelease)
  const before = await readArchiveEntries(original)
  if (!before.get('source/build-info.json') ||
      !before.get('source/bots/purplewave/RELEASE.txt') ||
      !before.get('notices/RELEASE.txt') ||
      !before.get('work/bwapi-data/AI/revision.txt'))
    throw new Error('Original sb3 recipe or attribution is incomplete')
  if (!before.get('source/bots/purplewave/RELEASE.txt').equals(before.get('notices/RELEASE.txt')))
    throw new Error('The sb3 build recipe release notice differs from its published notice')
  const buildInfo = JSON.parse(before.get('source/build-info.json'))
  if (buildInfo.recipeRevision !== buildRevision)
    throw new Error('sb3 build-info does not identify the reviewed recipe')
  for (const name of [...newPaths, ...modifiedPaths])
    if (newPaths.includes(name) && before.has(name))
      throw new Error(`sb4-only path already appears in sb3: ${name}`)

  const pkg = structuredClone(oldPackage)
  pkg.releaseId = releaseId
  pkg.version = '2026.09.22-sb.4'
  pkg.licenses.push({
    name: 'libffi - bundled in JNA jnidispatch native libraries',
    noticePath: 'notices/JNA-THIRD-PARTY-NOTICES.txt',
  })
  pkg.modifications.push({
    modifier: 'ShieldBattery',
    date: '2026-09-23',
    summary: 'Added the libffi copyright and permission notice for native code bundled in JNA; gameplay binaries and configuration are unchanged.',
    scope: 'dependency',
  })
  pkg.sourceReview.evidence = `Previously approved source and sb4 native notice correction: ${reviewUrl}`
  pkg.permissions.localDistribution.evidence = `Previously approved local distribution; sb4 includes the libffi native notice: ${reviewUrl}`
  validate('package', pkg)
  if (pkg.build.recipeSource.revision !== buildRevision ||
      JSON.stringify(pkg.sources) !== JSON.stringify(oldPackage.sources) ||
      JSON.stringify(pkg.profile) !== JSON.stringify(oldPackage.profile) ||
      JSON.stringify(pkg.runtime) !== JSON.stringify(oldPackage.runtime) ||
      JSON.stringify(pkg.launch) !== JSON.stringify(oldPackage.launch) ||
      JSON.stringify(pkg.bwapi) !== JSON.stringify(oldPackage.bwapi))
    throw new Error('sb4 would change gameplay, launch, source, or build provenance')

  const after = new Map(before)
  after.set('notices/JNA-THIRD-PARTY-NOTICES.txt', notice)
  after.set('source/bots/purplewave/JNA-THIRD-PARTY-NOTICES.txt', notice)
  after.set('notices/RELEASE.txt', releaseNotice)
  // The original source/bots/purplewave/RELEASE.txt is part of sb3's hashed build recipe.
  after.set('source/bots/purplewave/RELEASE-sb-4.txt', releaseNotice)
  after.set('source/tools/repackage-purplewave-notices.mjs', script)
  const repackInfo = {
    schemaVersion: 1,
    parentReleaseId: oldReleaseId,
    parentArchiveSha256: oldArchiveSha256,
    originalBuildRecipeRevision: buildRevision,
    repackScriptSha256: sha256(script),
    noticeSha256,
    changedPaths: [...allowed].sort(),
  }
  after.set('source/repackage-info.json', Buffer.from(JSON.stringify(repackInfo, null, 2) + '\n'))
  after.set('work/bwapi-data/AI/revision.txt',
    Buffer.from(`${pkg.sources[0].revision}-sb-4\n`))
  const manifest = Buffer.from(JSON.stringify(pkg, null, 2) + '\n')
  after.set('package.json', manifest)
  const changed = changedArchivePaths(before, after)
  const archive = await makeArchive([...after])
  const release = {
    package: pkg,
    artifact: {
      url: `https://github.com/ShieldBattery/robotics-facility/releases/download/${releaseId}/${releaseId}.zip`,
      sha256: sha256(archive),
      sizeBytes: archive.length,
      manifestSha256: sha256(manifest),
      format: 'zip',
    },
  }
  await verifyArchive(archive, release)
  const checked = await readArchiveEntries(archive)
  changedArchivePaths(before, checked)
  if (checked.size !== after.size ||
      [...after].some(([name, bytes]) => !checked.get(name)?.equals(bytes)))
    throw new Error('Repacked archive bytes differ from the compared entry map')
  const catalog = {
    schemaVersion: 1,
    revision: 0,
    bots: [{ bot: oldCatalog.bots[0].bot, releases: [release] }],
  }
  validate('catalog', catalog)
  const destination = path.join(root, 'dist', releaseId)
  try {
    await lstat(destination)
    throw new Error(`Release output already exists: ${destination}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  await mkdir(destination)
  await writeFile(path.join(destination, `${releaseId}.zip`), archive, { flag: 'wx' })
  await writeFile(path.join(destination, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n', { flag: 'wx' })
  return {
    destination,
    sha256: release.artifact.sha256,
    sizeBytes: archive.length,
    manifestSha256: release.artifact.manifestSha256,
    changedPaths: changed,
    unchangedEntries: before.size - modifiedPaths.length,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 2)
    throw new Error('Usage: node tools/repackage-purplewave-notices.mjs')
  repackagePurpleWaveNotices()
    .then(console.log)
    .catch((error) => { console.error(error); process.exitCode = 1 })
}
