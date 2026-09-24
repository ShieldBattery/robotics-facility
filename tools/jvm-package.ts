import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import {
  type DependencyArtifact,
  type DependencyLock,
  type JavaFileRecord,
  validateDependencyLock,
  verifyDependencyBytes,
} from './jvm-build.ts'
import type { Candidate, Package, Source, SourceLock } from './metadata.ts'
import { type ArchiveEntry, indexedFiles, jarNotices } from './package-archive.ts'
import { sha256 } from './publication-archive.ts'
import { writeReleasePackage } from './release-package.ts'
import { validate } from './validate.ts'

export interface JvmPackageBuildInfo {
  schemaVersion: 1
  recipeRevision: string
  recipeSha256: string
  recipeInputs: JavaFileRecord[]
  recipeDirty: boolean
  toolchain: object
  sources: { id: string; directory: string; tree: string; source: Source }[]
  dependencies: DependencyArtifact[]
  files: JavaFileRecord[]
}
export interface JvmPackageRecipe {
  botId: string
  jarName: string
  version: string
  sourceIds: readonly string[]
  dependencyNames: readonly string[]
  dependencyLockPath: string
  recipePaths: readonly string[]
  sources: Readonly<
    Record<
      string,
      {
        prefixes: readonly string[]
        required: readonly string[]
        notices: readonly (readonly [name: string, file: string])[]
      }
    >
  >
  extraNotices: readonly (readonly [name: string, path: string])[]
  dependencyNotices?: Readonly<Record<string, string>>
  modifications: Package['modifications']
}
export interface JvmPackageOptions {
  root?: string
  buildDirectory: string
  releaseId: string
  review?: boolean
}

const json = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8')) as T
const git = (directory: string, ...args: string[]) =>
  execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim()

function safeRelative(parent: string, target: string): string {
  const relative = path.relative(parent, target)
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`)
  )
    throw new Error(`Path is outside the expected directory: ${target}`)
  return relative.split(path.sep).join('/')
}

async function checkedBuild(root: string, buildDirectory: string): Promise<string> {
  const buildRoot = await realpath(path.join(root, '.build'))
  const build = path.resolve(root, buildDirectory)
  safeRelative(buildRoot, build)
  const value = await lstat(build)
  if (!value.isDirectory() || value.isSymbolicLink() || (await realpath(build)) !== build)
    throw new Error('Build must be a non-link directory beneath .build')
  return build
}

async function verifyRecipe(
  root: string,
  info: JvmPackageBuildInfo,
  entries: ArchiveEntry[],
  requiredRecipePaths: readonly string[],
): Promise<void> {
  if (info.recipeDirty !== false) throw new Error('Only a clean committed build can be packaged')
  if (!/^[a-f0-9]{40}$/.test(info.recipeRevision ?? ''))
    throw new Error('Invalid build recipe revision')
  if (!/^[a-f0-9]{64}$/.test(info.recipeSha256 ?? ''))
    throw new Error('Invalid build recipe SHA-256')
  if (!Array.isArray(info.recipeInputs) || info.recipeInputs.length < requiredRecipePaths.length)
    throw new Error('Build record omits JVM packaging recipe inputs')
  const paths = info.recipeInputs.map(item => item.path)
  if (
    new Set(paths).size !== paths.length ||
    requiredRecipePaths.some(name => !paths.includes(name))
  )
    throw new Error('Build record omits a required JVM recipe input')
  const digest = createHash('sha256')
  for (const record of info.recipeInputs) {
    if (
      !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(record.path) ||
      !/^[a-f0-9]{64}$/.test(record.sha256) ||
      !Number.isSafeInteger(record.sizeBytes) ||
      record.sizeBytes < 1
    )
      throw new Error('Invalid build recipe input record')
    const bytes = await readFile(path.join(root, record.path))
    const committed = execFileSync('git', [
      '-C',
      root,
      'show',
      `${info.recipeRevision}:${record.path}`,
    ])
    if (
      bytes.toString('utf8').replaceAll('\r\n', '\n') !==
        committed.toString('utf8').replaceAll('\r\n', '\n') ||
      bytes.length !== record.sizeBytes ||
      sha256(bytes) !== record.sha256
    )
      throw new Error(`Build recipe input changed: ${record.path}`)
    digest.update(record.path).update('\0').update(bytes).update('\0')
    entries.push([`source/${record.path}`, bytes])
  }
  if (digest.digest('hex') !== info.recipeSha256)
    throw new Error('Build recipe aggregate hash changed')
}

async function verifySources(
  root: string,
  build: string,
  info: JvmPackageBuildInfo,
  lock: SourceLock,
  entries: ArchiveEntry[],
  addNotice: (name: string, noticePath: string, bytes: Buffer) => void,
  recipe: JvmPackageRecipe,
): Promise<Source[]> {
  const { sourceIds } = recipe
  if (
    !Array.isArray(info.sources) ||
    info.sources.length !== sourceIds.length ||
    info.sources.some((source, index) => source.id !== sourceIds[index])
  )
    throw new Error('Build source list differs from JVM recipe')
  const sources: Source[] = []
  for (const id of sourceIds) {
    const source = lock.sources.find(item => item.id === id)
    const input = info.sources.find(item => item.id === id)
    if (!source || !input || JSON.stringify(input.source) !== JSON.stringify(source))
      throw new Error(`Build source lock changed: ${id}`)
    const directory = path.resolve(build, input.directory)
    safeRelative(build, directory)
    if ((await realpath(directory)) !== directory)
      throw new Error(`Prepared source path is a link: ${id}`)
    const provenance = await json<{ source: Source; tree: string }>(
      path.join(directory, '.git/robotics-source.json'),
    )
    if (
      JSON.stringify(provenance.source) !== JSON.stringify(source) ||
      provenance.tree !== input.tree ||
      git(directory, 'rev-parse', 'HEAD') !== source.revision ||
      git(directory, 'write-tree') !== input.tree
    )
      throw new Error(`Prepared source provenance changed: ${id}`)
    const files = await indexedFiles(directory, recipe.sources[id].prefixes)
    if (recipe.sources[id].required.some(required => !files.some(([name]) => name === required)))
      throw new Error(`Required Java source missing from archive inventory: ${id}`)
    for (const [name, bytes] of files) entries.push([`source/${id}/${name}`, bytes])
    for (const [name, file] of recipe.sources[id].notices)
      addNotice(
        name,
        `notices/${id}-${file.replaceAll('/', '-')}`,
        await readFile(path.join(directory, file)),
      )
    sources.push(source)
  }
  entries.push([
    'source/patch-order.json',
    Buffer.from(
      JSON.stringify(
        sources.map(({ id, patches }) => ({ id, patches })),
        null,
        2,
      ) + '\n',
    ),
  ])
  return sources
}

async function verifyBuiltFiles(
  build: string,
  info: JvmPackageBuildInfo,
  dependencies: DependencyArtifact[],
  entries: ArchiveEntry[],
  jarName: string,
): Promise<Map<string, Buffer>> {
  const expected = [`bin/${jarName}`, ...dependencies.map(item => `bin/lib/${item.name}`)]
  if (
    !Array.isArray(info.files) ||
    info.files.length !== expected.length ||
    info.files.some((item, index) => item.path !== expected[index])
  )
    throw new Error('Unexpected JVM build file list')
  const contents = new Map<string, Buffer>()
  for (const record of info.files) {
    const file = path.join(build, record.path)
    const value = await lstat(file)
    if (!value.isFile() || value.isSymbolicLink())
      throw new Error(`Unsafe build file: ${record.path}`)
    const bytes = await readFile(file)
    if (bytes.length !== record.sizeBytes || sha256(bytes) !== record.sha256)
      throw new Error(`Build file changed: ${record.path}`)
    entries.push([record.path, bytes])
    contents.set(record.path, bytes)
  }
  for (const artifact of dependencies) {
    const bytes = contents.get(`bin/lib/${artifact.name}`)
    if (!bytes || bytes.length !== artifact.sizeBytes || sha256(bytes) !== artifact.sha256)
      throw new Error(`Locked dependency changed: ${artifact.name}`)
  }
  return contents
}

export async function packageJvmBot(
  recipe: JvmPackageRecipe,
  { root = process.cwd(), buildDirectory, releaseId, review = false }: JvmPackageOptions,
) {
  const { botId, sourceIds, dependencyNames } = recipe
  if (!/^[a-z][a-z0-9-]*$/.test(botId)) throw new Error('Invalid bot recipe ID')
  const prefix = `${botId}-sb-`
  const revision = releaseId.startsWith(prefix) ? releaseId.slice(prefix.length) : ''
  if (!/^[1-9][0-9]*$/.test(revision)) throw new Error(`Release ID must be ${prefix}N`)
  const repository = await realpath(root)
  const build = await checkedBuild(repository, buildDirectory)
  const [info, candidate, lock, dependencyLock] = await Promise.all([
    json<JvmPackageBuildInfo>(path.join(build, 'build-info.json')),
    json<Candidate>(path.join(repository, `bots/${botId}/bot.json`)),
    json<SourceLock>(path.join(repository, 'source-lock.json')),
    json<DependencyLock>(path.join(repository, recipe.dependencyLockPath)),
  ])
  validate('candidate', candidate)
  if (
    candidate.bot.id !== botId ||
    JSON.stringify(candidate.sourceIds) !== JSON.stringify(sourceIds)
  )
    throw new Error('Candidate identity or source list differs from JVM package')
  if (
    !review &&
    (candidate.sourceReview.status !== 'approved' ||
      candidate.permissions.localDistribution.status !== 'approved')
  )
    throw new Error('Source and local-distribution review must be approved before packaging')
  const dependencyArtifacts: DependencyArtifact[] = validateDependencyLock(dependencyLock).artifacts
  const dependencies = dependencyNames.map(name => {
    const artifact = dependencyArtifacts.find(item => item.name === name)
    if (!artifact) throw new Error(`Missing locked dependency: ${name}`)
    return artifact
  })
  if (JSON.stringify(info.dependencies) !== JSON.stringify(dependencies))
    throw new Error('Build dependencies differ from the current lock')
  const entries: ArchiveEntry[] = []
  await verifyRecipe(repository, info, entries, recipe.recipePaths)
  const runtimeDependencies = dependencies.filter(artifact => artifact.runtime)
  const built = await verifyBuiltFiles(build, info, runtimeDependencies, entries, recipe.jarName)
  const licenses: Package['licenses'] = []
  const addNotice = (name: string, noticePath: string, bytes: Buffer) => {
    entries.push([noticePath, bytes])
    licenses.push({ name, noticePath })
  }
  const sources = await verifySources(repository, build, info, lock, entries, addNotice, recipe)
  for (const artifact of dependencies) {
    let bytes = built.get(`bin/lib/${artifact.name}`)
    if (!artifact.runtime) {
      bytes = verifyDependencyBytes(
        artifact,
        await readFile(path.join(repository, '.build/java-dependencies', artifact.name)),
      )
      entries.push([`source/build-dependencies/${artifact.name}`, bytes])
    }
    if (!bytes) throw new Error(`Missing dependency bytes: ${artifact.name}`)
    const notices = await jarNotices(bytes)
    const separateNotice = recipe.dependencyNotices?.[artifact.name]
    if (separateNotice)
      notices.push(['LICENSE.txt', await readFile(path.join(repository, separateNotice))])
    if (!notices.some(([name]) => /LICENSE/i.test(name)))
      throw new Error(`Dependency license notice missing: ${artifact.name}`)
    for (const [name, bytes] of notices)
      addNotice(`${artifact.name}: ${name}`, `notices/${artifact.name}-${name}`, bytes)
  }
  for (const [name, file] of recipe.extraNotices)
    addNotice(name, `notices/${path.basename(file)}`, await readFile(path.join(repository, file)))
  entries.push(['source/BUILD.md', await readFile(path.join(repository, `bots/${botId}/BUILD.md`))])
  entries.push(['source/build-info.json', Buffer.from(JSON.stringify(info, null, 2) + '\n')])
  for (const directory of [
    'work/',
    'work/tmp/',
    'work/bwapi-data/',
    'work/bwapi-data/AI/',
    'work/bwapi-data/read/',
    'work/bwapi-data/write/',
  ])
    entries.push([directory, Buffer.alloc(0)])
  const permissions: Package['permissions'] = review
    ? {
        ...candidate.permissions,
        localDistribution: {
          status: 'unreviewed',
          evidence: 'Review-only archive; local distribution is not approved.',
        },
      }
    : candidate.permissions
  const pkg: Package = {
    schemaVersion: 1,
    botId,
    releaseId,
    version: `${recipe.version}-sb.${revision}`,
    platform: { os: 'windows', architecture: 'x86_64' },
    runtime: {
      kind: 'java',
      major: 21,
      architecture: 'x86_64',
      jvmArguments: ['-Xms32m', '-Xmx512m', '-Djava.io.tmpdir=tmp', '-Djna.tmpdir=tmp'],
    },
    launch: { entrypoint: `bin/${recipe.jarName}`, arguments: [], workingDirectory: 'work' },
    profile: candidate.profile,
    bwapi: { version: '4.4.0', protocol: 10003, minimumBridgeVersion: '1' },
    sources,
    licenses,
    modifications: recipe.modifications,
    permissions,
    sourceReview: review
      ? { status: 'pending', evidence: 'Review-only archive; source review is not approved.' }
      : candidate.sourceReview,
    writableDirectories: ['work/tmp', 'work/bwapi-data/read', 'work/bwapi-data/write'],
    build: {
      recipeSource: {
        id: 'robotics-facility',
        repository: 'https://github.com/ShieldBattery/robotics-facility.git',
        revision: info.recipeRevision,
        patches: [],
      },
      recipePath: `tools/build-${botId}.ts`,
      toolchain: JSON.stringify(info.toolchain),
    },
  }
  return writeReleasePackage({ root: repository, candidate, pkg, entries, review })
}
