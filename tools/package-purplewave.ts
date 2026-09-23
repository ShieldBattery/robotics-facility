import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import yauzl from 'yauzl'
import { type DependencyLock, type PurpleWaveBuildInfo, recipePaths } from './build-purplewave.ts'
import type { Artifact, Candidate, Catalog, Package, Source, SourceLock } from './metadata.ts'
import { type ArchiveEntry, indexedFiles, makeArchive } from './package-zzzkbot.ts'
import { sha256, verifyArchive } from './publication-archive.ts'
import { validate } from './validate.ts'

const json = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8')) as T
const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()

// Runtime jars are hash-verified before this reader extracts their original legal notices.
export function jarNotices(bytes: Buffer): Promise<ArchiveEntry[]> {
  return new Promise<ArchiveEntry[]>((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error)
      const notices: ArchiveEntry[] = []
      zip.on('error', reject)
      zip.on('end', () => resolve(notices))
      zip.on('entry', entry => {
        if (!/^(META-INF\/)?(LICENSE|NOTICE)(\.txt)?$/i.test(entry.fileName)) {
          zip.readEntry()
          return
        }
        if (entry.uncompressedSize > 1024 * 1024) {
          zip.close()
          reject(new Error('Oversized dependency notice'))
          return
        }
        zip.openReadStream(entry, (err, stream) => {
          if (err) {
            zip.close()
            reject(err)
            return
          }
          const chunks: Buffer[] = []
          stream.on('error', reject)
          stream.on('data', (chunk: Buffer) => chunks.push(chunk))
          stream.on('end', () => {
            notices.push([entry.fileName.replaceAll('/', '-'), Buffer.concat(chunks)])
            zip.readEntry()
          })
        })
      })
      zip.readEntry()
    })
  })
}

export async function packagePurpleWave({
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
  const revision = /^purplewave-sb-([1-9][0-9]*)$/.exec(releaseId)?.[1]
  if (!revision) throw new Error('Invalid PurpleWave release ID')
  const build = path.resolve(root, buildDirectory)
  const info = await json<PurpleWaveBuildInfo>(path.join(build, 'build-info.json'))
  const candidate = await json<Candidate>(path.join(root, 'bots/purplewave/bot.json'))
  if (
    !review &&
    (candidate.sourceReview.status !== 'approved' ||
      candidate.permissions.localDistribution.status !== 'approved')
  )
    throw new Error('Source and distribution review must be approved before packaging')
  const lock = await json<SourceLock>(path.join(root, 'source-lock.json'))
  const dependencies = await json<DependencyLock>(path.join(root, 'jvm/dependencies.json'))
  const entries: ArchiveEntry[] = []
  const licenses: Package['licenses'] = []
  const sources: Source[] = []
  const addNotice = (name: string, noticePath: string, bytes: Buffer) => {
    entries.push([noticePath, bytes])
    licenses.push({ name, noticePath })
  }
  for (const file of info.files) {
    if (!/^bin\/(?:PurpleWave\.jar|lib\/[A-Za-z0-9_.-]+\.jar)$/.test(file.path))
      throw new Error('Unexpected build file')
    const bytes = await readFile(path.join(build, file.path))
    if (bytes.length !== file.sizeBytes || sha256(bytes) !== file.sha256)
      throw new Error(`Build file changed: ${file.path}`)
    entries.push([file.path, bytes])
  }
  if (!info.files.some(file => file.path === 'bin/PurpleWave.jar'))
    throw new Error('Missing bot JAR')
  for (const dependency of dependencies.artifacts.filter(d => d.runtime)) {
    const bytes = entries.find(([name]) => name === `bin/lib/${dependency.name}`)?.[1]
    if (!bytes || bytes.length !== dependency.sizeBytes || sha256(bytes) !== dependency.sha256)
      throw new Error(`Runtime dependency changed: ${dependency.name}`)
    const notices = await jarNotices(bytes)
    if (!notices.some(([name]) => /LICENSE/i.test(name)))
      throw new Error(`Missing dependency license: ${dependency.name}`)
    for (const [name, content] of notices)
      addNotice(`${dependency.name}: ${name}`, `notices/${dependency.name}-${name}`, content)
  }
  addNotice(
    'libffi - bundled in JNA jnidispatch native libraries',
    'notices/JNA-THIRD-PARTY-NOTICES.txt',
    await readFile(path.join(root, 'bots/purplewave/JNA-THIRD-PARTY-NOTICES.txt')),
  )
  const inventories = {
    purplewave: ['src', 'src-macros', 'tests', 'license.md', 'readme.md', 'pom.xml'],
    jbwapi: ['src/main/java', 'LICENSE', 'README.md', 'pom.xml'],
    jbweb: ['src/main/java', 'LICENSE', 'README.md', 'pom.xml'],
    javajps: ['src/main/java', 'README.md', 'pom.xml'],
    mjson: ['src/java', 'LICENSE.txt', 'README.md', 'pom.xml'],
  }
  const noticeFiles = {
    purplewave: [['MIT - PurpleWave', 'license.md']],
    jbwapi: [
      ['MIT - JBWAPI', 'LICENSE'],
      ['MIT/X11 - Java BWEM', 'src/main/java/bwem/LICENSE.txt'],
    ],
    jbweb: [['MIT - JBWEB', 'LICENSE']],
    javajps: [['MIT - JavaJPS, including Kevin Sheehan attribution', 'README.md']],
    mjson: [['Apache-2.0 - mjson', 'LICENSE.txt']],
  }
  for (const [id, prefixes] of Object.entries(inventories) as [
    keyof typeof inventories,
    string[],
  ][]) {
    const source = lock.sources.find(s => s.id === id)
    const input = info.sources.find(s => s.id === id)
    if (!source || !input) throw new Error(`Missing source: ${id}`)
    const directory = path.resolve(build, input.directory)
    const provenance = await json<{ source: Source; tree: string }>(
      path.join(directory, '.git/robotics-source.json'),
    )
    if (
      JSON.stringify(provenance.source) !== JSON.stringify(source) ||
      provenance.tree !== input.tree ||
      git(directory, 'write-tree') !== input.tree ||
      git(directory, 'rev-parse', 'HEAD') !== source.revision
    )
      throw new Error(`Build source provenance changed: ${id}`)
    sources.push(source)
    for (const [name, bytes] of await indexedFiles(directory, prefixes))
      entries.push([`source/${id}/${name}`, bytes])
    for (const [name, file] of noticeFiles[id])
      addNotice(
        name,
        `notices/${id}-${file.replaceAll('/', '-')}`,
        await readFile(path.join(directory, file)),
      )
    for (const patch of source.patches ?? []) {
      const bytes = await readFile(path.join(root, patch.path))
      if (sha256(bytes) !== patch.sha256) throw new Error('Source patch hash changed')
      entries.push([`source/${patch.path}`, bytes])
    }
  }
  if (!/^[a-f0-9]{40}$/.test(info.recipeRevision)) throw new Error('Invalid recipe revision')
  const recipeHash = createHash('sha256')
  for (const name of recipePaths) {
    const committed = execFileSync('git', ['-C', root, 'show', `${info.recipeRevision}:${name}`])
    const bytes = await readFile(path.join(root, name))
    if (
      committed.toString('utf8').replaceAll('\r\n', '\n') !==
      bytes.toString('utf8').replaceAll('\r\n', '\n')
    )
      throw new Error(`Recipe changed: ${name}`)
    recipeHash.update(name).update('\0').update(bytes).update('\0')
    entries.push([`source/${name}`, bytes])
  }
  if (recipeHash.digest('hex') !== info.recipeSha256)
    throw new Error('Recipe bytes changed since build')
  addNotice(
    'Attribution, modifications, and source',
    'notices/RELEASE.txt',
    await readFile(path.join(root, 'bots/purplewave/RELEASE.txt')),
  )
  entries.push(['source/BUILD.md', await readFile(path.join(root, 'bots/purplewave/BUILD.md'))])
  entries.push(['source/build-info.json', Buffer.from(JSON.stringify(info, null, 2) + '\n')])
  for (const dir of [
    'work/',
    'work/bwapi-data/',
    'work/bwapi-data/AI/',
    'work/bwapi-data/read/',
    'work/bwapi-data/write/',
  ])
    entries.push([dir, Buffer.alloc(0)])
  entries.push([
    'work/bwapi-data/AI/PurpleWaveShieldBattery.config.json',
    await readFile(path.join(root, 'bots/purplewave/PurpleWaveShieldBattery.config.json')),
  ])
  entries.push([
    'work/bwapi-data/AI/revision.txt',
    Buffer.from(`${sources[0].revision}-sb-${revision}\n`),
  ])
  const pkg: Package = {
    schemaVersion: 1,
    botId: 'purplewave',
    releaseId,
    version: `2026.09.22-sb.${revision}`,
    platform: { os: 'windows', architecture: 'x86_64' },
    runtime: {
      kind: 'java',
      major: 21,
      architecture: 'x86_64',
      jvmArguments: ['-Xms128m', '-Xmx1024m'],
    },
    launch: { entrypoint: 'bin/PurpleWave.jar', arguments: [], workingDirectory: 'work' },
    profile: candidate.profile,
    bwapi: { version: '4.4.0', protocol: 10003, minimumBridgeVersion: '1' },
    sources,
    licenses,
    modifications: [
      {
        modifier: 'ShieldBattery',
        date: '2026-09-22',
        summary:
          'Isolated saved state, encoded opponent filenames and history, disabled visualizer auto-launch, and adapted the build for Java 21.',
        scope: 'bot',
      },
      {
        modifier: 'ShieldBattery',
        date: '2026-09-22',
        summary:
          'Patched JBWAPI instance discovery and updated the Scala/JNA runtime dependencies. Original dependency notices and patched source are included.',
        scope: 'dependency',
      },
    ],
    permissions: candidate.permissions,
    sourceReview: review
      ? { status: 'pending', evidence: 'Review-only archive; publication is not approved.' }
      : candidate.sourceReview,
    writableDirectories: ['work/bwapi-data/read', 'work/bwapi-data/write'],
    build: {
      recipeSource: {
        id: 'robotics-facility',
        repository: 'https://github.com/ShieldBattery/robotics-facility.git',
        revision: info.recipeRevision,
        patches: [],
      },
      recipePath: 'tools/build-purplewave.ts',
      toolchain: JSON.stringify(info.toolchain),
    },
  }
  validate('package', pkg)
  const manifest = Buffer.from(JSON.stringify(pkg, null, 2) + '\n')
  entries.push(['package.json', manifest])
  const bytes = await makeArchive(entries),
    file = `${releaseId}.zip`
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
  const destination = path.join(root, 'dist', review ? `${releaseId}-review` : releaseId)
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
  if (!buildDirectory || !releaseId || rest.length > 1 || (rest.length && rest[0] !== '--review'))
    throw new Error(
      'Usage: node tools/package-purplewave.ts <build-directory> <release-id> [--review]',
    )
  packagePurpleWave({ buildDirectory, releaseId, review: rest[0] === '--review' })
    .then(console.log)
    .catch(error => {
      console.error(error)
      process.exitCode = 1
    })
}
