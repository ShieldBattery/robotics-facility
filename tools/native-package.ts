import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { readSourceLock } from './fetch-sources.ts'
import type { Candidate, Package, Source } from './metadata.ts'
import type { NativeBuildInfo } from './native-build.ts'
import { type ArchiveEntry, indexedFiles, recipeFiles } from './package-archive.ts'
import { sha256 } from './publication-archive.ts'
import { writeReleasePackage } from './release-package.ts'
import { verifyPreparedSource } from './source-provenance.ts'
import { validate } from './validate.ts'

export const bwapiSourcePrefixes = [
  'bwapi/include',
  'bwapi/BWAPILIB',
  'bwapi/BWAPIClient/Source',
  'bwapi/Shared',
  'bwapi/Util/Source',
  'bwapi/Storm',
  'LICENSE',
  'LICENSE.md',
  'bwapi/COPYING',
] as const

export interface NativePackageRecipe {
  botId: string
  executable: string
  version: string
  recipePaths: readonly string[]
  sources: Readonly<
    Record<
      string,
      {
        prefixes: readonly string[]
        excluded?: readonly string[]
        required: readonly string[]
      }
    >
  >
  notices: readonly (readonly [name: string, noticePath: string, source: string])[]
  files: readonly (readonly [archivePath: string, repositoryPath: string])[]
  modifications: Package['modifications']
}
export interface NativePackageOptions {
  root?: string
  buildDirectory: string
  releaseId: string
  review?: boolean
}
const json = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8')) as T

function requireChild(parent: string, file: string) {
  const relative = path.relative(parent, file)
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`)
  )
    throw new Error(`Path must remain beneath ${parent}: ${file}`)
}

/** Package a recorded native build with its patched source, relinking recipe, and notices. */
export async function packageNativeBot(
  recipe: NativePackageRecipe,
  { root = process.cwd(), buildDirectory, releaseId, review = false }: NativePackageOptions,
) {
  const prefix = `${recipe.botId}-sb-`
  const revision = releaseId.startsWith(prefix) ? releaseId.slice(prefix.length) : ''
  if (!/^[1-9][0-9]*$/.test(revision)) throw new Error(`Release ID must be ${prefix}N`)
  const repository = await realpath(root)
  const buildRoot = await realpath(path.join(repository, '.build'))
  const directory = path.resolve(repository, buildDirectory)
  requireChild(buildRoot, directory)
  if ((await realpath(directory)) !== directory || (await lstat(directory)).isSymbolicLink())
    throw new Error('Build directory must not be a link')
  const info = await json<NativeBuildInfo>(path.join(directory, 'build-info.json'))
  const candidate = await json<Candidate>(path.join(repository, `bots/${recipe.botId}/bot.json`))
  validate('candidate', candidate)
  const ids = Object.keys(recipe.sources)
  if (
    candidate.bot.id !== recipe.botId ||
    JSON.stringify(candidate.sourceIds) !== JSON.stringify(ids)
  )
    throw new Error('Candidate identity or sources differ from the native recipe')
  if (
    !review &&
    (candidate.sourceReview.status !== 'approved' ||
      candidate.permissions.localDistribution.status !== 'approved')
  )
    throw new Error('Source and distribution review must be approved before packaging')
  if (
    !Array.isArray(info.sources) ||
    JSON.stringify(info.sources.map(s => s.id)) !== JSON.stringify(ids)
  )
    throw new Error('Build source list differs from the native recipe')
  if (info.executable !== `bin/${recipe.executable}`)
    throw new Error('Unexpected native executable path')
  const executablePath = path.join(directory, info.executable)
  const executableStat = await lstat(executablePath)
  if (
    !executableStat.isFile() ||
    executableStat.isSymbolicLink() ||
    (await realpath(executablePath)) !== executablePath
  )
    throw new Error('Native executable must be a regular file inside the build')
  const executable = await readFile(executablePath)
  if (sha256(executable) !== info.executableSha256) throw new Error('Build executable changed')
  const entries: ArchiveEntry[] = [[`bin/${recipe.executable}`, executable]]
  entries.push(
    ...(await recipeFiles({
      root: repository,
      revision: info.recipeRevision,
      sha256: info.recipeSha256,
      paths: recipe.recipePaths,
    })),
  )
  const lock = await readSourceLock(repository)
  const sources: Source[] = []
  for (const id of ids) {
    const source = lock.sources.find(item => item.id === id)
    const input = info.sources.find(item => item.id === id)
    if (!source || !input || JSON.stringify(source) !== JSON.stringify(input.source))
      throw new Error(`Source lock differs from build: ${id}`)
    const sourceDirectory = path.resolve(directory, input.directory)
    requireChild(directory, sourceDirectory)
    if ((await realpath(sourceDirectory)) !== sourceDirectory)
      throw new Error(`Prepared source is a link: ${id}`)
    const verified = await verifyPreparedSource(source, sourceDirectory)
    if (verified.tree !== input.tree) throw new Error(`Prepared source tree changed: ${id}`)
    const inventory = recipe.sources[id]
    const files = (await indexedFiles(sourceDirectory, inventory.prefixes)).filter(
      ([name]) =>
        !inventory.excluded?.some(excluded => name === excluded || name.startsWith(excluded)),
    )
    if (inventory.required.some(name => !files.some(([file]) => file === name)))
      throw new Error(`Required source file is absent: ${id}`)
    for (const [name, bytes] of files) entries.push([`source/${id}/${name}`, bytes])
    for (const patch of source.patches ?? []) {
      const bytes = await readFile(path.join(repository, patch.path))
      if (sha256(bytes) !== patch.sha256) throw new Error(`Source patch changed: ${patch.path}`)
      const archivePath = `source/${patch.path}`
      if (!entries.some(([name]) => name === archivePath)) entries.push([archivePath, bytes])
    }
    sources.push(source)
  }
  for (const [, target, source] of recipe.notices) {
    const bytes = source.startsWith('source/')
      ? entries.find(([name]) => name === source)?.[1]
      : await readFile(path.join(repository, source))
    if (!bytes) throw new Error(`Notice source is missing: ${source}`)
    entries.push([target, bytes])
  }
  for (const [target, source] of recipe.files)
    entries.push([target, await readFile(path.join(repository, source))])
  entries.push([
    'source/BUILD.md',
    await readFile(path.join(repository, `bots/${recipe.botId}/BUILD.md`)),
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
    botId: recipe.botId,
    releaseId,
    version: `${recipe.version}-sb.${revision}`,
    platform: { os: 'windows', architecture: 'x86' },
    runtime: { kind: 'native' },
    launch: { entrypoint: `bin/${recipe.executable}`, arguments: [], workingDirectory: 'work' },
    profile: candidate.profile,
    bwapi: { version: '4.4.0', protocol: 10003, minimumBridgeVersion: '1' },
    sources,
    licenses: recipe.notices.map(([name, noticePath]) => ({ name, noticePath })),
    permissions: review
      ? {
          ...candidate.permissions,
          localDistribution: {
            status: 'unreviewed',
            evidence: 'Review-only archive; local distribution is not approved.',
          },
        }
      : candidate.permissions,
    modifications: recipe.modifications,
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
  return writeReleasePackage({ root: repository, candidate, pkg, entries, review })
}
