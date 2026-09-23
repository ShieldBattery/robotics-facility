import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import yauzl from 'yauzl'
import { type NativeBuildInfo, opprimoRecipePaths } from './build-zzzkbot.ts'
import type { Artifact, Candidate, Catalog, Package, Source, SourceLock } from './metadata.ts'
import { type ArchiveEntry, indexedFiles, makeArchive } from './package-zzzkbot.ts'
import { archivePath, sha256, verifyArchive } from './publication-archive.ts'
import { validate } from './validate.ts'

export interface BoostFile {
  path: string
  sha256: string
  sizeBytes: number
}
export interface BoostArtifact {
  name: string
  url: string
  sha256: string
  sizeBytes: number
}
export interface BoostBuildRecord {
  directory: string
  archive: BoostArtifact
  files: BoostFile[]
  inventory: string
  inventorySha256: string
  headerCount: number
  extractedBytes: number
}
export interface BoostDependencyLock {
  schemaVersion: 1
  artifacts: BoostArtifact[]
}

const git = (directory: string, ...args: string[]) =>
  execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim()
const json = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8')) as T
const sourceIds = ['bwapi', 'opprimobot', 'bwta2'] as const
const boostDirectory = 'deps/boost_1_56_0'
const boostInventory = 'deps/boost-header-inventory.json'
const boostArchive = 'deps/boost_1_56_0.zip'
const boostFileLimit = 4 * 1024 * 1024
const boostExpandedLimit = 120 * 1024 * 1024
const boostArchiveRoot = 'boost_1_56_0'

function samePath(a: string, b: string): boolean {
  return path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase()
}

async function assertRealDirectory(directory: string): Promise<void> {
  const stat = await lstat(directory)
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    !samePath(await realpath(directory), directory)
  ) {
    throw new Error(`Expected a real build directory: ${directory}`)
  }
}

async function assertRealFile(file: string): Promise<void> {
  const stat = await lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink() || !samePath(await realpath(file), file)) {
    throw new Error(`Expected a regular build file: ${file}`)
  }
}

const sourcePrefixes = {
  bwapi: [
    'bwapi/include',
    'bwapi/BWAPILIB',
    'bwapi/BWAPIClient/Source',
    'bwapi/Shared',
    'bwapi/Util/Source',
    'bwapi/Storm',
    'LICENSE',
    'LICENSE.md',
    'bwapi/COPYING',
  ],
  opprimobot: ['SCProjects/OpprimoBot/Source', 'README.md'],
  bwta2: ['BWTA/Source', 'include', 'OfflineExtractor/MapFileParser.h', 'COPYING', 'README.md'],
}

async function sourceDirectory(
  buildDirectory: string,
  input: NativeBuildInfo['sources'][number] | undefined,
  id: string,
): Promise<string> {
  if (input?.directory !== `sources/${id}`) {
    throw new Error(`Build has an unexpected ${id} source directory`)
  }
  const directory = path.join(buildDirectory, 'sources', id)
  await assertRealDirectory(directory)
  return directory
}

async function addSources({
  buildDirectory,
  entries,
  info,
  lock,
  root,
}: {
  buildDirectory: string
  entries: ArchiveEntry[]
  info: NativeBuildInfo
  lock: SourceLock
  root: string
}): Promise<Source[]> {
  if (
    !Array.isArray(info.sources) ||
    info.sources.length !== sourceIds.length ||
    !isDeepStrictEqual(new Set(info.sources.map(source => source.id)), new Set(sourceIds))
  ) {
    throw new Error('Build source set does not match the Opprimo recipe')
  }
  const sources: Source[] = []
  for (const id of sourceIds) {
    const source = lock.sources.find(entry => entry.id === id)
    const input = info.sources.find(entry => entry.id === id)
    if (!source || !input) throw new Error(`Build is missing source provenance for ${id}`)
    const directory = await sourceDirectory(buildDirectory, input, id)
    const provenance = await json<{ schemaVersion: number; source: Source; tree: string }>(
      path.join(directory, '.git/robotics-source.json'),
    )
    if (
      provenance.schemaVersion !== 1 ||
      JSON.stringify(input.source) !== JSON.stringify(source) ||
      JSON.stringify(provenance.source) !== JSON.stringify(source) ||
      provenance.tree !== input.tree ||
      git(directory, 'rev-parse', 'HEAD') !== source.revision ||
      git(directory, 'write-tree') !== input.tree ||
      git(directory, 'diff', '--name-only') ||
      git(directory, 'ls-files', '--others', '--exclude-standard')
    ) {
      throw new Error(`Build source provenance changed: ${id}`)
    }
    sources.push(source)
    for (const [name, bytes] of await indexedFiles(directory, sourcePrefixes[id])) {
      if (
        id === 'opprimobot' &&
        (name === 'SCProjects/OpprimoBot/Source/Utils/cthread.cpp' ||
          name === 'SCProjects/OpprimoBot/Source/Utils/cthread.h')
      ) {
        continue
      }
      entries.push([`source/${id}/${name}`, bytes])
    }
    for (const patch of source.patches ?? []) {
      const bytes = await readFile(path.join(root, patch.path))
      if (sha256(bytes) !== patch.sha256)
        throw new Error(`Source patch hash changed: ${patch.path}`)
      entries.push([`source/${patch.path}`, bytes])
    }
  }
  return sources
}

async function addRecipe({
  entries,
  info,
  root,
}: {
  entries: ArchiveEntry[]
  info: NativeBuildInfo
  root: string
}): Promise<void> {
  if (!/^[a-f0-9]{40}$/.test(info.recipeRevision)) throw new Error('Invalid recipe revision')
  const hash = createHash('sha256')
  for (const name of opprimoRecipePaths) {
    const expected = execFileSync('git', ['-C', root, 'show', `${info.recipeRevision}:${name}`])
    const actual = await readFile(path.join(root, name))
    if (
      actual.toString('utf8').replaceAll('\r\n', '\n') !==
      expected.toString('utf8').replaceAll('\r\n', '\n')
    ) {
      throw new Error(`Recipe changed: ${name}`)
    }
    hash.update(name).update('\0').update(actual).update('\0')
    entries.push([`source/${name}`, actual])
  }
  if (hash.digest('hex') !== info.recipeSha256) {
    throw new Error('Recipe bytes changed since build')
  }
}

function boostArchivePath(name: string): string {
  if (name.includes('\\') || name.includes(':') || name.includes('\0')) {
    throw new Error('Unsafe Boost archive path: ' + name)
  }
  const parts = name.replace(/\/$/, '').split('/')
  if (parts[0] !== boostArchiveRoot || parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error('Unsafe Boost archive path: ' + name)
  }
  return parts.slice(1).join('/')
}

async function verifyBoostArchiveEntries(bytes: Buffer, expectedFiles: BoostFile[]): Promise<void> {
  const expected = new Map(expectedFiles.map(file => [file.path, file]))
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(
      bytes,
      {
        lazyEntries: true,
        strictFileNames: true,
        validateEntrySizes: true,
      },
      (openError, zip) => {
        if (openError) return reject(openError)
        let finished = false
        const seen = new Set<string>()
        const fail = (error: Error) => {
          if (finished) return
          finished = true
          zip.close()
          reject(error)
        }
        zip.on('error', fail)
        zip.on('end', () => {
          if (finished) return
          if (seen.size !== expected.size) {
            fail(new Error('Pinned Boost archive and header inventory differ'))
            return
          }
          finished = true
          resolve()
        })
        zip.on('entry', entry => {
          try {
            const relative = boostArchivePath(entry.fileName)
            const directory = entry.fileName.endsWith('/')
            const fileType = (entry.externalFileAttributes >>> 16) & 0o170000
            if (
              entry.generalPurposeBitFlag & 1 ||
              (fileType && fileType !== (directory ? 0o040000 : 0o100000))
            ) {
              throw new Error('Unsafe Boost archive entry: ' + entry.fileName)
            }
            if (directory) {
              if (entry.uncompressedSize !== 0) {
                throw new Error('Boost archive directory has data: ' + entry.fileName)
              }
              zip.readEntry()
              return
            }
            if (relative !== 'LICENSE_1_0.txt' && !relative.startsWith('boost/')) {
              zip.readEntry()
              return
            }
            archivePath(relative)
            const item = expected.get(relative)
            if (
              !item ||
              seen.has(relative) ||
              entry.uncompressedSize !== item.sizeBytes ||
              item.sizeBytes > boostFileLimit
            ) {
              throw new Error('Pinned Boost archive and header inventory differ: ' + relative)
            }
            seen.add(relative)
            zip.openReadStream(entry, (streamError, stream) => {
              if (streamError) return fail(streamError)
              const hash = createHash('sha256')
              let size = 0
              stream.on('error', fail)
              stream.on('data', (chunk: Buffer) => {
                size += chunk.length
                if (size > item.sizeBytes) {
                  stream.destroy(
                    new Error('Boost archive entry exceeds inventory size: ' + relative),
                  )
                } else {
                  hash.update(chunk)
                }
              })
              stream.on('end', () => {
                if (finished) return
                if (size !== item.sizeBytes || hash.digest('hex') !== item.sha256) {
                  fail(new Error('Pinned Boost archive header differs: ' + relative))
                  return
                }
                zip.readEntry()
              })
            })
          } catch (error) {
            fail(error as Error)
          }
        })
        zip.readEntry()
      },
    )
  })
}

export async function verifiedBoostFiles(
  buildDirectory: string,
  boost: BoostBuildRecord | undefined,
  dependencyLock: BoostDependencyLock,
): Promise<ArchiveEntry[]> {
  const artifact = dependencyLock?.artifacts?.[0]
  if (
    dependencyLock.schemaVersion !== 1 ||
    dependencyLock.artifacts.length !== 1 ||
    boost?.directory !== boostDirectory ||
    boost.inventory !== boostInventory ||
    !isDeepStrictEqual(boost.archive, {
      name: artifact?.name,
      url: artifact?.url,
      sha256: artifact?.sha256,
      sizeBytes: artifact?.sizeBytes,
    }) ||
    !/^[a-f0-9]{64}$/.test(boost.inventorySha256) ||
    !Array.isArray(boost.files) ||
    boost.files.length < 2 ||
    boost.files.length > 12000
  ) {
    throw new Error('Invalid Boost build record')
  }
  await assertRealFile(path.join(buildDirectory, boostArchive))
  await assertRealFile(path.join(buildDirectory, boostInventory))
  await assertRealDirectory(path.join(buildDirectory, boostDirectory))
  const archiveBytes = await readFile(path.join(buildDirectory, boostArchive))
  if (archiveBytes.length !== artifact.sizeBytes || sha256(archiveBytes) !== artifact.sha256) {
    throw new Error('Pinned Boost archive changed')
  }
  const inventoryBytes = await readFile(path.join(buildDirectory, boostInventory))
  const inventory = JSON.parse(inventoryBytes.toString('utf8'))
  if (
    sha256(inventoryBytes) !== boost.inventorySha256 ||
    inventory.schemaVersion !== 1 ||
    !isDeepStrictEqual(inventory.files, boost.files)
  ) {
    throw new Error('Boost header inventory changed')
  }
  const files: ArchiveEntry[] = []
  const seen = new Set<string>()
  let totalBytes = 0
  for (const item of boost.files) {
    if (
      typeof item.path !== 'string' ||
      (item.path !== 'LICENSE_1_0.txt' && !item.path.startsWith('boost/')) ||
      !/^[a-f0-9]{64}$/.test(item.sha256) ||
      !Number.isSafeInteger(item.sizeBytes) ||
      item.sizeBytes < 0 ||
      item.sizeBytes > boostFileLimit
    ) {
      throw new Error('Invalid Boost inventory entry')
    }
    const normalized = archivePath(item.path)
    if (seen.has(normalized)) throw new Error(`Duplicate Boost header path: ${item.path}`)
    seen.add(normalized)
    totalBytes += item.sizeBytes
    if (totalBytes > boostExpandedLimit)
      throw new Error('Boost header inventory exceeds size limit')
    const file = path.join(buildDirectory, boostDirectory, ...item.path.split('/'))
    const stat = await lstat(file)
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size !== item.sizeBytes ||
      !samePath(await realpath(file), file)
    ) {
      throw new Error(`Boost header changed: ${item.path}`)
    }
    const bytes = await readFile(file)
    if (sha256(bytes) !== item.sha256) throw new Error(`Boost header changed: ${item.path}`)
    files.push([item.path, bytes])
  }
  if (
    !seen.has('boost/geometry.hpp') ||
    !seen.has('license_1_0.txt') ||
    boost.headerCount !== boost.files.length - 1 ||
    boost.extractedBytes !== totalBytes
  ) {
    throw new Error('Boost header inventory is incomplete')
  }
  await verifyBoostArchiveEntries(archiveBytes, boost.files)
  return files
}

export async function packageOpprimobot({
  root = process.cwd(),
  buildDirectory,
  releaseId,
  review = false,
}: {
  root?: string
  buildDirectory: string
  releaseId: string
  review?: boolean
}) {
  const match = /^opprimobot-sb-([1-9][0-9]*)$/.exec(releaseId)
  if (!match) throw new Error('Release ID must be opprimobot-sb-N')
  const repository = await realpath(root)
  const directory = path.resolve(repository, buildDirectory)
  const relative = path.relative(path.join(repository, '.build'), directory)
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('Build directory must be a named directory inside .build')
  }
  await assertRealDirectory(directory)
  await assertRealFile(path.join(directory, 'build-info.json'))
  const info = await json<NativeBuildInfo>(path.join(directory, 'build-info.json'))
  if (info.schemaVersion !== 1) throw new Error('Invalid build-info schema version')
  const candidatePath = 'bots/opprimobot/bot.json'
  const candidateBytes = await readFile(path.join(repository, candidatePath))
  const candidate = JSON.parse(candidateBytes.toString('utf8')) as Candidate
  validate('candidate', candidate)
  if (
    candidate.bot.id !== 'opprimobot' ||
    candidate.sourceIds.length !== sourceIds.length ||
    !isDeepStrictEqual(new Set(candidate.sourceIds), new Set(sourceIds))
  ) {
    throw new Error('Opprimo candidate identity or source set changed')
  }
  if (!review) {
    const committed = execFileSync('git', ['-C', repository, 'show', 'HEAD:' + candidatePath])
    if (
      candidateBytes.toString('utf8').replaceAll('\r\n', '\n') !==
        committed.toString('utf8').replaceAll('\r\n', '\n') ||
      candidate.build.revision !== info.recipeRevision
    ) {
      throw new Error('Approved candidate must be committed and match the build recipe revision')
    }
    if (
      candidate.sourceReview.status !== 'approved' ||
      candidate.permissions.localDistribution.status !== 'approved'
    ) {
      throw new Error('Source and distribution review must be approved before packaging')
    }
  }
  if (info.executable !== 'bin/OpprimoBot.exe') {
    throw new Error('Build has an unexpected executable path')
  }
  await assertRealFile(path.join(directory, info.executable))
  const executable = await readFile(path.join(directory, info.executable))
  if (sha256(executable) !== info.executableSha256) throw new Error('Build executable changed')
  const entries: ArchiveEntry[] = [['bin/OpprimoBot.exe', executable]]
  const lock = await json<SourceLock>(path.join(repository, 'source-lock.json'))
  validate('sourceLock', lock)
  const sources = await addSources({
    buildDirectory: directory,
    entries,
    info,
    lock,
    root: repository,
  })
  await addRecipe({ entries, info, root: repository })

  const boostFiles = await verifiedBoostFiles(
    directory,
    info.dependencies?.boost,
    await json<BoostDependencyLock>(path.join(repository, 'native/dependencies.json')),
  )
  entries.push(['source/boost-headers.zip', await makeArchive(boostFiles)])
  const notices: [name: string, noticePath: string, source: string][] = [
    ['MIT (OpprimoBot)', 'notices/OpprimoBot-MIT.txt', 'bots/opprimobot/OPPRIMOBOT-MIT.txt'],
    [
      'OpprimoBot README and citation',
      'notices/OpprimoBot-README.md',
      'source/opprimobot/README.md',
    ],
    ['LGPL-3.0 (BWAPI)', 'notices/BWAPI-LGPL-3.0.txt', 'source/bwapi/LICENSE'],
    ['GPL-3.0 license text', 'notices/GPL-3.0.txt', 'source/bwapi/bwapi/COPYING'],
    [
      'BSD-3-Clause (smallsha1)',
      'notices/SMALLSHA1-LICENSE.txt',
      'bots/ualbertabot/SMALLSHA1-LICENSE.txt',
    ],
    ['LGPL-3.0 (BWTA2)', 'notices/BWTA2-LGPL-3.0.txt', 'source/bwta2/COPYING'],
    [
      'BSD-style (BWTA2 filesystem)',
      'notices/BWTA2-FILESYSTEM-LICENSE.txt',
      'bots/opprimobot/BWTA2-FILESYSTEM-LICENSE.txt',
    ],
    ['Boost Software License 1.0', 'notices/Boost-LICENSE_1_0.txt', 'boost/LICENSE_1_0.txt'],
    ['MIT (ShieldBattery native recipe)', 'notices/ShieldBattery-MIT.txt', 'native/LICENSE'],
    [
      'Attribution, modifications, and source',
      'notices/RELEASE.txt',
      'bots/opprimobot/RELEASE.txt',
    ],
  ]
  for (const [, target, source] of notices) {
    let bytes: Buffer | undefined
    if (source.startsWith('source/')) {
      bytes = entries.find(([name]) => name === source)?.[1]
    } else if (source.startsWith('boost/')) {
      bytes = boostFiles.find(([name]) => name === source.slice('boost/'.length))?.[1]
    } else {
      bytes = await readFile(path.join(repository, source))
    }
    if (!bytes) throw new Error(`Notice source is missing: ${source}`)
    entries.push([target, bytes])
  }
  entries.push([
    'source/BUILD.md',
    await readFile(path.join(repository, 'bots/opprimobot/BUILD.md')),
  ])
  entries.push(['source/build-info.json', Buffer.from(JSON.stringify(info, null, 2) + '\n')])
  for (const dir of [
    'work/',
    'work/bwapi-data/',
    'work/bwapi-data/AI/',
    'work/bwapi-data/read/',
    'work/bwapi-data/write/',
  ])
    entries.push([dir, Buffer.alloc(0)])

  const pkg: Package = {
    schemaVersion: 1,
    botId: 'opprimobot',
    releaseId,
    version: 'snapshot-65eeb7e-sb.' + match[1],
    platform: { os: 'windows', architecture: 'x86' },
    runtime: { kind: 'native' },
    launch: { entrypoint: 'bin/OpprimoBot.exe', arguments: [], workingDirectory: 'work' },
    profile: candidate.profile,
    bwapi: { version: '4.4.0', protocol: 10003, minimumBridgeVersion: '1' },
    sources,
    licenses: notices.map(([name, noticePath]) => ({ name, noticePath })),
    permissions: review
      ? {
          ...candidate.permissions,
          localDistribution: {
            status: 'unreviewed',
            evidence: 'Review-only archive; publication is not approved.',
          },
        }
      : candidate.permissions,
    modifications: [
      {
        modifier: 'ShieldBattery',
        date: '2026-09-23',
        scope: 'bot',
        summary:
          'Disabled game speed, user input, debug display, chat controls, and the bot timer; the external client exits after one match.',
      },
      {
        modifier: 'ShieldBattery',
        date: '2026-09-23',
        scope: 'bot',
        summary:
          'Disabled strategy history, result and profiler persistence, and replaced the Pathfinder worker with at most one synchronous path calculation per callback.',
      },
      {
        modifier: 'ShieldBattery',
        date: '2026-09-23',
        scope: 'dependency',
        summary: 'BWTA2 is source-built for BWAPI 4.4 with terrain cache and log writes disabled.',
      },
      {
        modifier: 'ShieldBattery',
        date: '2026-09-23',
        scope: 'dependency',
        summary:
          'BWAPI selects the match discovery table through SB_BWAPI_INSTANCE and rejects malformed instance identifiers.',
      },
      {
        modifier: 'ShieldBattery',
        date: '2026-09-23',
        scope: 'bot',
        summary: 'The native Win32 recipe links the static MSVC runtime.',
      },
    ],
    writableDirectories: ['work/bwapi-data/read', 'work/bwapi-data/write'],
    build: {
      recipeSource: {
        id: 'robotics-facility',
        repository: 'https://github.com/ShieldBattery/robotics-facility.git',
        revision: info.recipeRevision,
        patches: [],
      },
      recipePath: 'native/CMakeLists.txt',
      toolchain: JSON.stringify(info.toolchain),
    },
    sourceReview: review
      ? { status: 'pending', evidence: 'Review-only archive; publication is not approved.' }
      : candidate.sourceReview,
  }
  validate('package', pkg)
  const manifest = Buffer.from(JSON.stringify(pkg, null, 2) + '\n')
  entries.push(['package.json', manifest])
  const bytes = await makeArchive(entries)
  const file = `${releaseId}.zip`
  const artifact: Artifact = {
    url: `https://github.com/ShieldBattery/robotics-facility/releases/download/${releaseId}/${file}`,
    sha256: sha256(bytes),
    sizeBytes: bytes.length,
    manifestSha256: sha256(manifest),
    format: 'zip',
  }
  const release = { package: pkg, artifact }
  await verifyArchive(bytes, release)
  const catalog: Catalog = {
    schemaVersion: 1,
    revision: 0,
    bots: [{ bot: candidate.bot, releases: [release] }],
  }
  if (!review) validate('catalog', catalog)
  const destination = path.join(repository, 'dist', review ? `${releaseId}-review` : releaseId)
  await mkdir(destination, { recursive: true })
  await writeFile(path.join(destination, file), bytes, { flag: 'wx' })
  await writeFile(path.join(destination, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n', {
    flag: 'wx',
  })
  return {
    destination,
    sha256: release.artifact.sha256,
    sizeBytes: bytes.length,
    entries: entries.length,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [buildDirectory, releaseId, ...rest] = process.argv.slice(2)
  if (!buildDirectory || !releaseId || rest.length > 1 || (rest.length && rest[0] !== '--review')) {
    throw new Error(
      'Usage: node tools/package-opprimobot.ts <build-directory> opprimobot-sb-N [--review]',
    )
  }
  packageOpprimobot({ buildDirectory, releaseId, review: rest[0] === '--review' })
    .then(console.log)
    .catch(error => {
      console.error(error)
      process.exitCode = 1
    })
}
