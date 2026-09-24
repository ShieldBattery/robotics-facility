import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { readSourceLock, runGit } from './fetch-sources.ts'
import type { Source } from './metadata.ts'
import { prepareSource } from './prepare-source.ts'
import { type PreparedSource, verifyPreparedSource } from './source-provenance.ts'

const outputNamePattern = /^[a-z0-9][a-z0-9-]*$/
const reservedWindowsDeviceNames = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/
export const nativeRecipePaths = Object.freeze([
  'native/CMakeLists.txt',
  'native/host.cpp',
  'native/LICENSE',
  'source-lock.json',
  'package.json',
  'pnpm-lock.yaml',
  'schemas/metadata.schema.json',
  'tools/native-build.ts',
  'tools/fetch-sources.ts',
  'tools/prepare-source.ts',
  'tools/source-provenance.ts',
  'tools/package-archive.ts',
  'tools/release-package.ts',
  'tools/publication-archive.ts',
  'tools/validate.ts',
])
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
export interface NativeBuildInfo<TDependencies extends object = Record<string, unknown>> {
  schemaVersion: 1
  recipeRevision: string
  recipeSha256: string
  executable: string
  executableSha256: string
  toolchain: NativeToolchain
  sources: { id: string; directory: string; tree: string; source: Source }[]
  dependencies?: TDependencies
}
export interface NativeBuildOptions {
  rootDir?: string
  outputName: string
}

export interface PreparedNativeDependencies<TDependencies extends object> {
  cmakeVariables: Readonly<Record<string, string>>
  verify(): Promise<TDependencies>
}

export interface NativeBuildRecipe<TDependencies extends object = Record<string, unknown>> {
  botId: string
  target: string
  sourceIds: readonly string[]
  sourceVariables: Readonly<Record<string, string>>
  outputVariable: string
  recipePaths: readonly string[]
  prepareDependencies?: (locations: {
    root: string
    output: string
  }) => Promise<PreparedNativeDependencies<TDependencies>>
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

async function assertMissingDirectory(directory: string) {
  try {
    await lstat(directory)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
  throw new Error(`Build output already exists: ${directory}`)
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

export function makeBuildInfo<TDependencies extends object = Record<string, unknown>>({
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
}): NativeBuildInfo<TDependencies> {
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

const cmakeVariablePattern = /^[A-Z][A-Z0-9_]*$/

export function nativeCmakeArguments<TDependencies extends object>(
  recipe: NativeBuildRecipe<TDependencies>,
  output: string,
  root: string,
  dependencyVariables: Readonly<Record<string, string>> = {},
): string[] {
  const sourceIds = new Set(recipe.sourceIds)
  const mappedIds = Object.values(recipe.sourceVariables)
  if (
    !sourceIds.size ||
    sourceIds.size !== recipe.sourceIds.length ||
    mappedIds.length !== sourceIds.size ||
    new Set(mappedIds).size !== sourceIds.size ||
    mappedIds.some(id => !sourceIds.has(id)) ||
    !mappedIds.includes(recipe.botId)
  ) {
    throw new Error('Native recipe source variables must map each prepared source exactly once')
  }
  const variables = {
    ...Object.fromEntries(
      Object.entries(recipe.sourceVariables).map(([variable, id]) => [
        variable,
        path.join(output, 'sources', id),
      ]),
    ),
    [recipe.outputVariable]: path.join(output, 'bin'),
    ...dependencyVariables,
  }
  if (
    Object.keys(variables).some(variable => !cmakeVariablePattern.test(variable)) ||
    recipe.outputVariable in recipe.sourceVariables ||
    recipe.outputVariable === 'SB_NATIVE_BOT' ||
    'SB_NATIVE_BOT' in recipe.sourceVariables ||
    Object.keys(dependencyVariables).some(
      variable =>
        variable in recipe.sourceVariables ||
        variable === recipe.outputVariable ||
        variable === 'SB_NATIVE_BOT',
    )
  ) {
    throw new Error('Native recipe has invalid or conflicting CMake variables')
  }
  return [
    '-S',
    path.join(root, 'native'),
    '-B',
    path.join(output, 'cmake'),
    '-G',
    generator,
    '-A',
    'Win32',
    `-DSB_NATIVE_BOT=${recipe.botId}`,
    ...Object.entries(variables).map(([variable, value]) => `-D${variable}=${value}`),
  ]
}

export async function buildNativeBot<TDependencies extends object>(
  recipe: NativeBuildRecipe<TDependencies>,
  { rootDir = process.cwd(), outputName }: NativeBuildOptions,
) {
  const inputs = recipe.recipePaths
  const root = await realpath(rootDir)
  const name = validateOutputName(outputName)
  const output = path.join(root, '.build', name)
  await assertMissingDirectory(output)

  const recipeRecord = await recipeProvenance(root, inputs)
  const lock = await readSourceLock(root)
  const selectedSources = recipe.sourceIds.map(id => {
    const source = lock.sources.find(candidate => candidate.id === id)
    if (!source) throw new Error(`source-lock.json is missing ${id}`)
    return source
  })

  const dependencies = recipe.prepareDependencies
    ? await recipe.prepareDependencies({ root, output })
    : undefined

  const prepared: PreparedSource[] = []
  for (const source of selectedSources) {
    const directory = path.join(output, 'sources', source.id)
    await prepareSource({
      rootDir: root,
      sourceId: source.id,
      outputDir: path.relative(root, directory).split(path.sep).join('/'),
    })
    prepared.push(await verifyPreparedSource(source, directory))
  }

  const cmakeDirectory = path.join(output, 'cmake')
  const executablePath = path.join(output, 'bin', `${recipe.target}.exe`)
  await run('cmake', nativeCmakeArguments(recipe, output, root, dependencies?.cmakeVariables))
  await run('cmake', [
    '--build',
    cmakeDirectory,
    '--config',
    'Release',
    '--target',
    recipe.target,
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
    verified.push(await verifyPreparedSource(preparedSource.source, preparedSource.directory))
  }
  const recipeAfterBuild = await recipeProvenance(root, inputs)
  if (
    recipeAfterBuild.revision !== recipeRecord.revision ||
    recipeAfterBuild.sha256 !== recipeRecord.sha256
  ) {
    throw new Error('The build recipe or source-lock.json changed during compilation')
  }
  const buildInfo = makeBuildInfo<TDependencies>({
    recipeRevision: recipeRecord.revision,
    recipeSha256: recipeRecord.sha256,
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
