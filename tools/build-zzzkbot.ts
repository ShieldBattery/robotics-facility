import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { readSourceLock, runGit } from './fetch-sources.ts'
import type { Source } from './metadata.ts'
import { prepareSource, provenanceName } from './prepare-source.ts'

const outputNamePattern = /^[a-z0-9][a-z0-9-]*$/
const reservedWindowsDeviceNames = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/
const recipePaths = [
  'native/CMakeLists.txt',
  'native/host.cpp',
  'native/LICENSE',
  'source-lock.json',
]
const generator = 'Visual Studio 17 2022'
export interface NativeToolchain {
  cmake: string
  generator: string
  architecture: string
  configuration: string
  msvcRuntime: string
  compiler: string
  compilerId: string
  compilerVersion: string
  windowsSdkVersion: string
}
export interface BoostBuildRecord {
  directory: string
  archive: { name: string; url: string; sha256: string; sizeBytes: number }
  files: { path: string; sha256: string; sizeBytes: number }[]
  inventory: string
  inventorySha256: string
  headerCount: number
  extractedBytes: number
}
export interface NativeBuildInfo {
  schemaVersion: 1
  recipeRevision: string
  recipeSha256: string
  executable: string
  executableSha256: string
  toolchain: NativeToolchain
  sources: { id: string; directory: string; tree: string; source: Source }[]
  dependencies?: { boost: BoostBuildRecord }
}
export interface NativeBuildOptions {
  rootDir?: string
  outputName: string
  botId: 'zzzkbot' | 'ualbertabot' | 'opprimobot'
  prepareDependencies?: (locations: { root: string; output: string }) => Promise<{
    includeDir: string
    verify(): Promise<{ boost: BoostBuildRecord }>
  }>
}
type PreparedSource = { source: Source; directory: string; tree: string }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function validateOutputName(name: unknown) {
  if (
    typeof name !== 'string' ||
    !outputNamePattern.test(name) ||
    reservedWindowsDeviceNames.test(name)
  ) {
    throw new Error('Output name must be a new safe directory name under .build')
  }
  return name
}

export function parseBuildArguments(args: string[]) {
  if (args.length !== 1) throw new Error('Usage: node tools/build-zzzkbot.ts <new-output-name>')
  return validateOutputName(args[0])
}

export function validateProvenanceRecord({
  source,
  provenance,
  head,
  indexTree,
  unstaged,
  untracked,
}: {
  source: Source
  provenance: unknown
  head: string
  indexTree: string
  unstaged: string
  untracked: string
}) {
  if (
    !isRecord(provenance) ||
    provenance.schemaVersion !== 1 ||
    !provenance.source ||
    typeof provenance.tree !== 'string' ||
    !provenance.tree
  ) {
    throw new Error(`Missing or invalid source provenance for ${source.id}`)
  }
  if (JSON.stringify(provenance.source) !== JSON.stringify(source)) {
    throw new Error(`Source provenance does not match source-lock.json for ${source.id}`)
  }
  if (head !== source.revision) {
    throw new Error(`Prepared ${source.id} HEAD does not match its pinned revision`)
  }
  if (indexTree !== provenance.tree) {
    throw new Error(`Prepared ${source.id} index tree does not match its provenance record`)
  }
  if (unstaged) throw new Error(`Prepared ${source.id} has unstaged changes`)
  if (untracked) throw new Error(`Prepared ${source.id} has untracked files`)
}

async function assertMissingDirectory(directory: string) {
  try {
    await lstat(directory)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
  throw new Error(`Build output already exists: ${directory}`)
}

async function sourceProvenance(source: Source, directory: string): Promise<PreparedSource> {
  const provenancePath = path.join(directory, provenanceName)
  let provenance: unknown
  try {
    provenance = JSON.parse(await readFile(provenancePath, 'utf8'))
  } catch (error) {
    throw new Error(
      `Could not read source provenance at ${provenancePath}: ${errorMessage(error)}`,
      {
        cause: error,
      },
    )
  }
  const [head, indexTree, unstaged, untracked] = await Promise.all([
    runGit(['-C', directory, 'rev-parse', 'HEAD']),
    runGit(['-C', directory, 'write-tree']),
    runGit(['-C', directory, 'diff', '--name-only']),
    runGit(['-C', directory, 'ls-files', '--others', '--exclude-standard']),
  ])
  validateProvenanceRecord({ source, provenance, head, indexTree, unstaged, untracked })
  return { directory, tree: indexTree, source }
}

async function run(command: string, args: string[], options: { cwd?: string } = {}) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.on('error', error =>
      reject(new Error(`Could not start ${command}: ${errorMessage(error)}`, { cause: error })),
    )
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code}`))
    })
  })
}

async function commandOutput(command: string, args: string[], options: { cwd?: string } = {}) {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', data => (stdout += data))
    child.stderr.on('data', data => (stderr += data))
    child.on('error', error =>
      reject(new Error(`Could not start ${command}: ${errorMessage(error)}`, { cause: error })),
    )
    child.on('close', code => {
      if (code === 0) resolve(stdout.trim())
      else
        reject(new Error(`${command} exited with code ${code}: ${stderr.trim() || stdout.trim()}`))
    })
  })
}

async function sha256(file: string) {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex')
}

async function recipeProvenance(root: string, recipePaths: readonly string[]) {
  const [revision, tracked, changed] = await Promise.all([
    runGit(['-C', root, 'rev-parse', 'HEAD']),
    runGit(['-C', root, 'ls-files', '--', ...recipePaths]),
    runGit(['-C', root, 'diff', '--name-only', 'HEAD', '--', ...recipePaths]),
  ])
  const trackedPaths = tracked ? tracked.split(/\r?\n/) : []
  if (
    trackedPaths.length !== recipePaths.length ||
    recipePaths.some(file => !trackedPaths.includes(file))
  ) {
    throw new Error('The build recipe and source-lock.json must be tracked before building')
  }
  if (changed) throw new Error('The build recipe or source-lock.json differs from HEAD')

  const hash = createHash('sha256')
  for (const file of recipePaths) {
    hash.update(file)
    hash.update('\0')
    hash.update(await readFile(path.join(root, file)))
    hash.update('\0')
  }
  return { revision, sha256: hash.digest('hex') }
}

async function readToolchain(cmakeDirectory: string): Promise<NativeToolchain> {
  const fields = new Map<string, string>()
  for (const line of (
    await readFile(path.join(cmakeDirectory, 'toolchain-info.txt'), 'utf8')
  ).split(/\r?\n/)) {
    const separator = line.indexOf('=')
    if (separator > 0) fields.set(line.slice(0, separator), line.slice(separator + 1))
  }
  const required = ['compiler', 'compilerId', 'compilerVersion', 'windowsSdkVersion']
  for (const field of required) {
    if (!fields.get(field)) throw new Error(`CMake did not record ${field} in toolchain-info.txt`)
  }
  return {
    cmake: await commandOutput('cmake', ['--version']),
    generator,
    architecture: 'Win32',
    configuration: 'Release',
    msvcRuntime: 'static',
    compiler: fields.get('compiler')!,
    compilerId: fields.get('compilerId')!,
    compilerVersion: fields.get('compilerVersion')!,
    windowsSdkVersion: fields.get('windowsSdkVersion')!,
  }
}

function relativeToRoot(root: string, target: string) {
  const relative = path.relative(root, target)
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.startsWith(`..${path.sep}`) ||
    relative === '..'
  ) {
    throw new Error(`Path is outside the repository: ${target}`)
  }
  return relative.split(path.sep).join('/')
}

export function makeBuildInfo({
  recipeRevision,
  recipeSha256,
  executable,
  executableSha256,
  toolchain,
  sources,
}: {
  recipeRevision: string
  recipeSha256: string
  executable: string
  executableSha256: string
  toolchain: NativeToolchain
  sources: PreparedSource[]
}): NativeBuildInfo {
  return {
    schemaVersion: 1,
    recipeRevision,
    recipeSha256,
    executable,
    executableSha256,
    toolchain,
    sources: sources.map(({ directory, tree, source }) => ({
      id: source.id,
      directory,
      tree,
      source,
    })),
  }
}

export const opprimoRecipePaths = Object.freeze([
  ...recipePaths,
  'native/opprimobot.cmake',
  'native/opprimobot-compat.hpp',
  'native/opprimobot-tests.cpp',
  'native/dependencies.json',
  'tools/build-zzzkbot.ts',
  'tools/build-opprimobot.ts',
  'tools/package-opprimobot.ts',
  'bots/opprimobot/BUILD.md',
  'bots/opprimobot/RELEASE.txt',
  'bots/opprimobot/OPPRIMOBOT-MIT.txt',
  'bots/opprimobot/BWTA2-FILESYSTEM-LICENSE.txt',
  'bots/ualbertabot/SMALLSHA1-LICENSE.txt',
])

export const ualbertaRecipePaths = Object.freeze([
  ...recipePaths,
  'native/ualbertabot.cmake',
  'native/ualberta-timer.hpp',
  'tools/build-zzzkbot.ts',
  'tools/build-ualbertabot.ts',
  'bots/ualbertabot/UAlbertaBot_Config.txt',
  'tools/package-ualbertabot.ts',
  'bots/ualbertabot/BUILD.md',
  'bots/ualbertabot/RELEASE.txt',
  'bots/ualbertabot/UALBERTABOT-MIT.txt',
  'bots/ualbertabot/RAPIDJSON-MIT.txt',
  'bots/ualbertabot/MSINTTYPES-BSD-3-Clause.txt',
  'bots/ualbertabot/SMALLSHA1-LICENSE.txt',
])

export function buildZzzkbot(options: Omit<NativeBuildOptions, 'botId' | 'prepareDependencies'>) {
  return buildNativeBot({ ...options, botId: 'zzzkbot' })
}

export async function buildNativeBot({
  rootDir = process.cwd(),
  outputName,
  botId,
  prepareDependencies,
}: NativeBuildOptions) {
  if (!['zzzkbot', 'ualbertabot', 'opprimobot'].includes(botId)) {
    throw new Error('Unsupported native bot')
  }
  if ((botId === 'opprimobot') !== (typeof prepareDependencies === 'function')) {
    throw new Error('OpprimoBot requires its verified Boost preparation step')
  }
  const sourceIds = botId === 'opprimobot' ? ['bwapi', 'bwta2', 'opprimobot'] : ['bwapi', botId]
  let inputs: readonly string[] = recipePaths
  if (botId === 'opprimobot') inputs = opprimoRecipePaths
  else if (botId === 'ualbertabot') inputs = ualbertaRecipePaths
  let target = 'ZZZKBotClient'
  if (botId === 'opprimobot') target = 'OpprimoBot'
  else if (botId === 'ualbertabot') target = 'UAlbertaBot'
  let sourceVariable = 'ZZZKBOT'
  if (botId === 'ualbertabot') sourceVariable = 'UALBERTABOT'
  else if (botId === 'opprimobot') sourceVariable = 'OPPRIMOBOT'

  const root = await realpath(rootDir)
  const name = validateOutputName(outputName)
  const output = path.join(root, '.build', name)
  await assertMissingDirectory(output)

  const recipe = await recipeProvenance(root, inputs)
  const lock = await readSourceLock(root)
  const selectedSources = sourceIds.map(id => {
    const source = lock.sources.find(candidate => candidate.id === id)
    if (!source) throw new Error(`source-lock.json is missing ${id}`)
    return source
  })

  const dependencies = prepareDependencies ? await prepareDependencies({ root, output }) : undefined

  const prepared: PreparedSource[] = []
  for (const source of selectedSources) {
    const directory = path.join(output, 'sources', source.id)
    await prepareSource({
      rootDir: root,
      sourceId: source.id,
      outputDir: path.relative(root, directory).split(path.sep).join('/'),
    })
    prepared.push(await sourceProvenance(source, directory))
  }

  const cmakeDirectory = path.join(output, 'cmake')
  const executablePath = path.join(output, 'bin', `${target}.exe`)
  await run('cmake', [
    '-S',
    path.join(root, 'native'),
    '-B',
    cmakeDirectory,
    '-G',
    generator,
    '-A',
    'Win32',
    `-DBWAPI_SOURCE_DIR=${path.join(output, 'sources', 'bwapi')}`,
    `-DSB_NATIVE_BOT=${botId}`,
    `-D${sourceVariable}_SOURCE_DIR=${path.join(output, 'sources', botId)}`,
    `-D${sourceVariable}_OUTPUT_DIR=${path.join(output, 'bin')}`,
    ...(botId === 'opprimobot'
      ? [
          `-DBWTA2_SOURCE_DIR=${path.join(output, 'sources', 'bwta2')}`,
          `-DOPPRIMOBOT_BOOST_DIR=${dependencies!.includeDir}`,
        ]
      : []),
  ])
  await run('cmake', [
    '--build',
    cmakeDirectory,
    '--config',
    'Release',
    '--target',
    target,
    '--parallel',
  ])

  try {
    const info = await lstat(executablePath)
    if (!info.isFile()) throw new Error('not a regular file')
  } catch (error) {
    throw new Error(`CMake did not produce ${executablePath}: ${errorMessage(error)}`, {
      cause: error,
    })
  }

  // CMake must not write into a source input. Re-read every invariant after compilation, not only
  // before it, so publication can trust the recorded index trees.
  const verified: PreparedSource[] = []
  for (const preparedSource of prepared) {
    verified.push(await sourceProvenance(preparedSource.source, preparedSource.directory))
  }
  const recipeAfterBuild = await recipeProvenance(root, inputs)
  if (recipeAfterBuild.revision !== recipe.revision || recipeAfterBuild.sha256 !== recipe.sha256) {
    throw new Error('The build recipe or source-lock.json changed during compilation')
  }
  const buildInfo = makeBuildInfo({
    recipeRevision: recipe.revision,
    recipeSha256: recipe.sha256,
    executable: relativeToRoot(output, executablePath),
    executableSha256: await sha256(executablePath),
    toolchain: await readToolchain(cmakeDirectory),
    sources: verified.map(source => ({
      ...source,
      directory: relativeToRoot(output, source.directory),
    })),
  })
  if (dependencies) {
    buildInfo.dependencies = await dependencies.verify()
  }
  await writeFile(path.join(output, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n', {
    flag: 'wx',
  })
  return { output, buildInfo }
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) {
  let outputName
  try {
    outputName = parseBuildArguments(process.argv.slice(2))
  } catch (error) {
    console.error(errorMessage(error))
    process.exitCode = 1
  }
  if (!process.exitCode) {
    buildZzzkbot({ outputName: outputName! })
      .then(({ output }) => console.log(`Built ZZZKBotClient in ${output}`))
      .catch(error => {
        console.error(errorMessage(error))
        process.exitCode = 1
      })
  }
}
