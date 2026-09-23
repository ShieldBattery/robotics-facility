import { spawn } from 'node:child_process'
import type { Stats } from 'node:fs'
import { lstat, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import type { Source, SourceLock } from './metadata.ts'

const sourceIdPattern = /^[a-z][a-z0-9-]*$/
const revisionPattern = /^[0-9a-f]{40}$/
const reservedWindowsDeviceNames = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/

type Patch = NonNullable<Source['patches']>[number]

export interface RunGitOptions {
  cwd?: string
  input?: string | Uint8Array
}

export interface FetchSourcesOptions {
  rootDir?: string
  from?: ReadonlyMap<string, string>
}

export interface FetchSourcesResult {
  fetched: string[]
  reused: string[]
}

export class SourceFetchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SourceFetchError'
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatGitCommand(args: readonly string[]): string {
  return ['git', ...args].map(arg => JSON.stringify(arg)).join(' ')
}

export async function runGit(
  args: readonly string[],
  options: RunGitOptions = {},
): Promise<string> {
  return await new Promise((resolve, reject) => {
    let settled = false
    const fail = (error: Error): void => {
      if (!settled) {
        settled = true
        reject(error)
      }
    }
    const child = spawn('git', args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
    })
    const { stdin, stdout, stderr } = child
    if (!stdin || !stdout || !stderr) {
      child.kill()
      fail(new SourceFetchError(`Could not create stdio for ${formatGitCommand(args)}`))
      return
    }

    let output = ''
    let errors = ''
    stdin.on('error', (error: Error) => {
      if (!hasCode(error, 'EPIPE')) fail(error)
    })
    stdin.end(options.input)
    stdout.setEncoding('utf8')
    stderr.setEncoding('utf8')
    stdout.on('data', (data: string) => {
      output += data
    })
    stderr.on('data', (data: string) => {
      errors += data
    })
    child.once('error', (error: Error) => {
      fail(
        new SourceFetchError(`Could not start ${formatGitCommand(args)}: ${error.message}`, {
          cause: error,
        }),
      )
    })
    child.once('close', (code: number | null) => {
      if (settled) return
      if (code === 0) {
        settled = true
        resolve(output.trimEnd())
      } else {
        const detail = errors.trim() || output.trim() || `exit code ${code ?? 'unknown'}`
        fail(new SourceFetchError(`${formatGitCommand(args)} failed: ${detail}`))
      }
    })
  })
}

async function lstatIfExists(target: string): Promise<Stats | undefined> {
  try {
    return await lstat(target)
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined
    throw error
  }
}

export async function assertSafeDirectory(target: string, description: string): Promise<boolean> {
  const stats = await lstatIfExists(target)
  if (!stats) return false
  if (stats.isSymbolicLink()) {
    throw new SourceFetchError(`${description} must not be a symbolic link or junction: ${target}`)
  }
  if (!stats.isDirectory()) {
    throw new SourceFetchError(`${description} must be a directory: ${target}`)
  }
  return true
}

function validateRepository(repository: string, sourceId: string): void {
  let url: URL
  try {
    url = new URL(repository)
  } catch {
    throw new SourceFetchError(`Source '${sourceId}' has an invalid repository URL`)
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.hostname ||
    !url.pathname.endsWith('.git')
  ) {
    throw new SourceFetchError(
      `Source '${sourceId}' repository must be a canonical HTTPS Git URL ending in .git`,
    )
  }
}

function parsePatch(value: unknown, sourceId: string, paths: Set<string>): Patch {
  if (!isObject(value) || Object.keys(value).sort().join(',') !== 'path,sha256') {
    throw new SourceFetchError('Each patch requires a relative path and SHA-256')
  }
  const { path: patchPath, sha256 } = value
  if (
    typeof patchPath !== 'string' ||
    typeof sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(sha256)
  ) {
    throw new SourceFetchError('Each patch requires a relative path and SHA-256')
  }
  const prefix = `patches/${sourceId}/`
  const name = patchPath.slice(prefix.length)
  if (
    !patchPath.startsWith(prefix) ||
    !/^[a-z0-9][a-z0-9-]*\.patch$/.test(name) ||
    reservedWindowsDeviceNames.test(name.slice(0, -6))
  ) {
    throw new SourceFetchError(`Patch path must be patches/${sourceId}/<name>.patch`)
  }
  if (paths.has(patchPath)) throw new SourceFetchError('Duplicate patch path')
  paths.add(patchPath)
  return { path: patchPath, sha256 }
}

function parseSource(value: unknown, sourceIds: Set<string>): Source {
  if (!isObject(value)) throw new SourceFetchError('Every source must be an object')
  const keys = Object.keys(value)
  if (
    !['id', 'repository', 'revision'].every(key => keys.includes(key)) ||
    keys.some(key => !['id', 'repository', 'revision', 'patches'].includes(key))
  ) {
    throw new SourceFetchError(
      'Every source requires id, repository, revision and optional patches',
    )
  }
  const { id, repository, revision, patches } = value
  if (typeof id !== 'string' || !sourceIdPattern.test(id) || reservedWindowsDeviceNames.test(id)) {
    throw new SourceFetchError(`Invalid source id: ${JSON.stringify(id)}`)
  }
  if (sourceIds.has(id)) throw new SourceFetchError(`Duplicate source id: ${id}`)
  sourceIds.add(id)
  if (typeof repository !== 'string') {
    throw new SourceFetchError(`Source '${id}' repository must be a string`)
  }
  validateRepository(repository, id)
  if (typeof revision !== 'string' || !revisionPattern.test(revision)) {
    throw new SourceFetchError(
      `Source '${id}' revision must be a 40-character lowercase hexadecimal commit ID`,
    )
  }
  if (patches === undefined) return { id, repository, revision }
  if (!Array.isArray(patches)) throw new SourceFetchError('patches must be an array')
  const paths = new Set<string>()
  return { id, repository, revision, patches: patches.map(patch => parsePatch(patch, id, paths)) }
}

function parseSourceLock(value: unknown): SourceLock {
  if (!isObject(value)) throw new SourceFetchError('source-lock.json must contain an object')
  const keys = Object.keys(value).sort()
  if (keys.length !== 2 || keys[0] !== 'schemaVersion' || keys[1] !== 'sources') {
    throw new SourceFetchError(
      'source-lock.json must have exactly schemaVersion and sources fields',
    )
  }
  if (value.schemaVersion !== 1 || !Array.isArray(value.sources) || value.sources.length === 0) {
    throw new SourceFetchError('source-lock.json must use schemaVersion 1 and a sources array')
  }
  const sourceIds = new Set<string>()
  return { schemaVersion: 1, sources: value.sources.map(source => parseSource(source, sourceIds)) }
}

export function validateSourceLock(value: unknown): asserts value is SourceLock {
  parseSourceLock(value)
}

export async function readSourceLock(rootDir: string): Promise<SourceLock> {
  const lockPath = path.join(rootDir, 'source-lock.json')
  let contents: string
  try {
    contents = await readFile(lockPath, 'utf8')
  } catch (error) {
    throw new SourceFetchError(`Could not read ${lockPath}: ${errorMessage(error)}`, {
      cause: error,
    })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch (error) {
    throw new SourceFetchError(`Could not parse ${lockPath}: ${errorMessage(error)}`, {
      cause: error,
    })
  }
  validateSourceLock(parsed)
  return parsed
}

export function parseArguments(args: readonly string[]): Map<string, string> {
  const from = new Map<string, string>()
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    let value: string | undefined
    if (argument === '--from') {
      value = args[index + 1]
      index += 1
    } else if (argument.startsWith('--from=')) {
      value = argument.slice('--from='.length)
    } else {
      throw new SourceFetchError(`Unknown or malformed argument: ${argument}`)
    }
    if (!value) throw new SourceFetchError('--from requires id=absolute-local-repo-path')
    const separator = value.indexOf('=')
    if (separator <= 0 || separator === value.length - 1) {
      throw new SourceFetchError('--from requires id=absolute-local-repo-path')
    }
    const id = value.slice(0, separator)
    const localPath = value.slice(separator + 1)
    if (
      !sourceIdPattern.test(id) ||
      reservedWindowsDeviceNames.test(id) ||
      !path.isAbsolute(localPath)
    ) {
      throw new SourceFetchError(
        '--from requires a valid source id and an absolute local repository path',
      )
    }
    if (from.has(id)) throw new SourceFetchError(`Duplicate --from override for source '${id}'`)
    from.set(id, localPath)
  }
  return from
}

async function validateLocalCloneSource(sourceId: string, localPath: string): Promise<void> {
  const stats = await lstatIfExists(localPath)
  if (!stats?.isDirectory()) {
    throw new SourceFetchError(`--from source '${sourceId}' is not a directory: ${localPath}`)
  }
  const isWorkTree = await runGit(['-C', localPath, 'rev-parse', '--is-inside-work-tree'])
  if (isWorkTree !== 'true') {
    throw new SourceFetchError(
      `--from source '${sourceId}' is not a Git working tree: ${localPath}`,
    )
  }
}

export async function inspectExistingDestination(
  destination: string,
  source: Source,
): Promise<boolean> {
  const exists = await assertSafeDirectory(destination, `Source destination for '${source.id}'`)
  if (!exists) return false
  let status: string
  let head: string
  let origin: string
  try {
    status = await runGit(['-C', destination, 'status', '--porcelain=v1', '--untracked-files=all'])
    head = await runGit(['-C', destination, 'rev-parse', 'HEAD'])
    origin = await runGit(['-C', destination, 'config', '--get', 'remote.origin.url'])
  } catch (error) {
    throw new SourceFetchError(
      `Existing source '${source.id}' is not an acceptable pinned checkout at ${destination}: ${errorMessage(error)}`,
      { cause: error },
    )
  }
  if (status)
    throw new SourceFetchError(
      `Existing source '${source.id}' is dirty; clean it before fetching: ${destination}`,
    )
  if (head !== source.revision) {
    throw new SourceFetchError(
      `Existing source '${source.id}' is checked out at ${head}, not locked revision ${source.revision}; refusing to change it`,
    )
  }
  if (origin !== source.repository) {
    throw new SourceFetchError(
      `Existing source '${source.id}' origin is ${JSON.stringify(origin)}, not canonical repository ${JSON.stringify(source.repository)}; refusing to change it`,
    )
  }
  return true
}

async function validateInputs(
  rootDir: string,
  lock: SourceLock,
  from: ReadonlyMap<string, string>,
): Promise<{ existing: Set<string>; sourcesRoot: string }> {
  const sourceById = new Map(lock.sources.map(source => [source.id, source]))
  for (const [id, localPath] of from) {
    if (!sourceById.has(id)) throw new SourceFetchError(`--from references unknown source '${id}'`)
    await validateLocalCloneSource(id, localPath)
  }
  const sourcesRoot = path.join(rootDir, '.sources')
  const sourcesRootExists = await assertSafeDirectory(sourcesRoot, '.sources root')
  const existing = new Set<string>()
  if (sourcesRootExists) {
    for (const source of lock.sources) {
      const destination = path.join(sourcesRoot, source.id)
      if (await inspectExistingDestination(destination, source)) existing.add(source.id)
    }
  }
  return { existing, sourcesRoot }
}

async function cloneSource(source: Source, destination: string, cloneInput: string): Promise<void> {
  try {
    await runGit(['clone', '--no-checkout', '--no-hardlinks', cloneInput, destination])
    await runGit(['-C', destination, 'remote', 'set-url', 'origin', source.repository])
    try {
      await runGit(['-C', destination, 'cat-file', '--exists', `${source.revision}^{commit}`])
    } catch {
      await runGit(['-C', destination, 'fetch', '--no-tags', 'origin', source.revision])
    }
    await runGit(['-C', destination, 'checkout', '--detach', source.revision])
    const [head, origin] = await Promise.all([
      runGit(['-C', destination, 'rev-parse', 'HEAD']),
      runGit(['-C', destination, 'config', '--get', 'remote.origin.url']),
    ])
    if (head !== source.revision || origin !== source.repository) {
      throw new SourceFetchError(
        `New source '${source.id}' did not reach its required pinned state`,
      )
    }
  } catch (error) {
    throw new SourceFetchError(
      `Failed to fetch source '${source.id}' into ${destination}. The directory was left in place for inspection; remove it manually only after reviewing it. ${errorMessage(error)}`,
      { cause: error },
    )
  }
}

export async function fetchSources(options: FetchSourcesOptions = {}): Promise<FetchSourcesResult> {
  const rootDir = options.rootDir ?? process.cwd()
  const from = options.from ?? new Map<string, string>()
  const absoluteRoot = path.resolve(rootDir)
  const lock = await readSourceLock(absoluteRoot)
  const { existing, sourcesRoot } = await validateInputs(absoluteRoot, lock, from)
  if (existing.size === 0 && !(await lstatIfExists(sourcesRoot))) await mkdir(sourcesRoot)

  const fetched: string[] = []
  const reused: string[] = []
  for (const source of lock.sources) {
    if (existing.has(source.id)) {
      reused.push(source.id)
      continue
    }
    const destination = path.join(sourcesRoot, source.id)
    await cloneSource(source, destination, from.get(source.id) ?? source.repository)
    fetched.push(source.id)
  }
  return { fetched, reused }
}

async function main(): Promise<void> {
  const result = await fetchSources({ from: parseArguments(process.argv.slice(2)) })
  for (const id of result.fetched) console.log(`Fetched ${id}`)
  for (const id of result.reused) console.log(`Verified ${id}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error))
    process.exitCode = 1
  })
}
