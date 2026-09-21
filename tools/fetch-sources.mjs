import { spawn } from 'node:child_process'
import { lstat, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const sourceIdPattern = /^[a-z][a-z0-9-]*$/
const revisionPattern = /^[0-9a-f]{40}$/
const reservedWindowsDeviceNames = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/

export class SourceFetchError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'SourceFetchError'
  }
}

function formatGitCommand(args) {
  return ['git', ...args].map((arg) => JSON.stringify(arg)).join(' ')
}

export async function runGit(args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''

    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') reject(error)
    })
    child.stdin.end(options.input)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (data) => {
      stdout += data
    })
    child.stderr.on('data', (data) => {
      stderr += data
    })
    child.on('error', (error) => {
      reject(
        new SourceFetchError(`Could not start ${formatGitCommand(args)}: ${error.message}`, {
          cause: error,
        }),
      )
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trimEnd())
      } else {
        const detail = stderr.trim() || stdout.trim() || `exit code ${code}`
        reject(new SourceFetchError(`${formatGitCommand(args)} failed: ${detail}`))
      }
    })
  })
}

async function lstatIfExists(target) {
  try {
    return await lstat(target)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

export async function assertSafeDirectory(target, description) {
  const stats = await lstatIfExists(target)
  if (!stats) {
    return false
  }
  if (stats.isSymbolicLink()) {
    throw new SourceFetchError(`${description} must not be a symbolic link or junction: ${target}`)
  }
  if (!stats.isDirectory()) {
    throw new SourceFetchError(`${description} must be a directory: ${target}`)
  }
  return true
}

function validateRepository(repository, sourceId) {
  let url
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

export function validateSourceLock(lock) {
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) {
    throw new SourceFetchError('source-lock.json must contain an object')
  }
  const lockKeys = Object.keys(lock).sort()
  if (lockKeys.length !== 2 || lockKeys[0] !== 'schemaVersion' || lockKeys[1] !== 'sources') {
    throw new SourceFetchError(
      'source-lock.json must have exactly schemaVersion and sources fields',
    )
  }
  if (lock.schemaVersion !== 1 || !Array.isArray(lock.sources) || !lock.sources.length) {
    throw new SourceFetchError('source-lock.json must use schemaVersion 1 and a sources array')
  }

  const sourceIds = new Set()
  for (const source of lock.sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new SourceFetchError('Every source must be an object')
    }
    const sourceKeys = Object.keys(source)
    if (
      !['id', 'repository', 'revision'].every((key) => sourceKeys.includes(key)) ||
      sourceKeys.some((key) => !['id', 'repository', 'revision', 'patches'].includes(key))
    ) {
      throw new SourceFetchError(
        'Every source requires id, repository, revision and optional patches',
      )
    }
    if (
      typeof source.id !== 'string' ||
      !sourceIdPattern.test(source.id) ||
      reservedWindowsDeviceNames.test(source.id)
    ) {
      throw new SourceFetchError(`Invalid source id: ${JSON.stringify(source.id)}`)
    }
    if (sourceIds.has(source.id)) {
      throw new SourceFetchError(`Duplicate source id: ${source.id}`)
    }
    sourceIds.add(source.id)
    if (source.patches !== undefined) {
      if (!Array.isArray(source.patches)) throw new SourceFetchError('patches must be an array')
      const paths = new Set()
      for (const patch of source.patches) {
        if (
          !patch ||
          typeof patch !== 'object' ||
          Array.isArray(patch) ||
          Object.keys(patch).sort().join(',') !== 'path,sha256' ||
          typeof patch.path !== 'string' ||
          typeof patch.sha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(patch.sha256)
        ) {
          throw new SourceFetchError('Each patch requires a relative path and SHA-256')
        }
        const prefix = `patches/${source.id}/`
        const name = patch.path.slice(prefix.length)
        if (
          !patch.path.startsWith(prefix) ||
          !/^[a-z0-9][a-z0-9-]*\.patch$/.test(name) ||
          reservedWindowsDeviceNames.test(name.slice(0, -6))
        ) {
          throw new SourceFetchError(`Patch path must be patches/${source.id}/<name>.patch`)
        }
        if (paths.has(patch.path)) throw new SourceFetchError('Duplicate patch path')
        paths.add(patch.path)
      }
    }

    if (typeof source.repository !== 'string') {
      throw new SourceFetchError(`Source '${source.id}' repository must be a string`)
    }
    validateRepository(source.repository, source.id)
    if (typeof source.revision !== 'string' || !revisionPattern.test(source.revision)) {
      throw new SourceFetchError(
        `Source '${source.id}' revision must be a 40-character lowercase hexadecimal commit ID`,
      )
    }
  }

  return lock
}

export async function readSourceLock(rootDir) {
  const lockPath = path.join(rootDir, 'source-lock.json')
  let contents
  try {
    contents = await readFile(lockPath, 'utf8')
  } catch (error) {
    throw new SourceFetchError(`Could not read ${lockPath}: ${error.message}`, { cause: error })
  }
  try {
    return validateSourceLock(JSON.parse(contents))
  } catch (error) {
    if (error instanceof SourceFetchError) {
      throw error
    }
    throw new SourceFetchError(`Could not parse ${lockPath}: ${error.message}`, { cause: error })
  }
}

export function parseArguments(args) {
  const from = new Map()
  for (let index = 0; index < args.length; index += 1) {
    let value
    if (args[index] === '--from') {
      value = args[index + 1]
      index += 1
    } else if (args[index].startsWith('--from=')) {
      value = args[index].slice('--from='.length)
    } else {
      throw new SourceFetchError(`Unknown or malformed argument: ${args[index]}`)
    }

    if (!value) {
      throw new SourceFetchError('--from requires id=absolute-local-repo-path')
    }
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
    if (from.has(id)) {
      throw new SourceFetchError(`Duplicate --from override for source '${id}'`)
    }
    from.set(id, localPath)
  }
  return from
}

async function validateLocalCloneSource(sourceId, localPath) {
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

export async function inspectExistingDestination(destination, source) {
  const exists = await assertSafeDirectory(destination, `Source destination for '${source.id}'`)
  if (!exists) {
    return false
  }

  let status
  let head
  let origin
  try {
    status = await runGit(['-C', destination, 'status', '--porcelain=v1', '--untracked-files=all'])
    head = await runGit(['-C', destination, 'rev-parse', 'HEAD'])
    origin = await runGit(['-C', destination, 'remote', 'get-url', 'origin'])
  } catch (error) {
    throw new SourceFetchError(
      `Existing source '${source.id}' is not an acceptable pinned checkout at ${destination}: ${error.message}`,
      {
        cause: error,
      },
    )
  }

  if (status) {
    throw new SourceFetchError(
      `Existing source '${source.id}' is dirty; clean it before fetching: ${destination}`,
    )
  }
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

async function validateInputs(rootDir, lock, from) {
  const sourceById = new Map(lock.sources.map((source) => [source.id, source]))
  for (const [id, localPath] of from) {
    if (!sourceById.has(id)) {
      throw new SourceFetchError(`--from references unknown source '${id}'`)
    }
    await validateLocalCloneSource(id, localPath)
  }

  const sourcesRoot = path.join(rootDir, '.sources')
  const sourcesRootExists = await assertSafeDirectory(sourcesRoot, '.sources root')
  const existing = new Set()
  if (sourcesRootExists) {
    for (const source of lock.sources) {
      const destination = path.join(sourcesRoot, source.id)
      if (await inspectExistingDestination(destination, source)) {
        existing.add(source.id)
      }
    }
  }
  return { existing, sourcesRoot }
}

async function cloneSource(source, destination, cloneInput) {
  try {
    await runGit(['clone', '--no-checkout', '--no-hardlinks', cloneInput, destination])
    await runGit(['-C', destination, 'remote', 'set-url', 'origin', source.repository])
    await runGit(['-C', destination, 'checkout', '--detach', source.revision])
    const [head, origin] = await Promise.all([
      runGit(['-C', destination, 'rev-parse', 'HEAD']),
      runGit(['-C', destination, 'remote', 'get-url', 'origin']),
    ])
    if (head !== source.revision || origin !== source.repository) {
      throw new SourceFetchError(
        `New source '${source.id}' did not reach its required pinned state`,
      )
    }
  } catch (error) {
    throw new SourceFetchError(
      `Failed to fetch source '${source.id}' into ${destination}. The directory was left in place for inspection; remove it manually only after reviewing it. ${error.message}`,
      { cause: error },
    )
  }
}

export async function fetchSources({ rootDir = process.cwd(), from = new Map() } = {}) {
  const absoluteRoot = path.resolve(rootDir)
  const lock = await readSourceLock(absoluteRoot)
  const { existing, sourcesRoot } = await validateInputs(absoluteRoot, lock, from)

  if (!existing.size && !(await lstatIfExists(sourcesRoot))) {
    await mkdir(sourcesRoot)
  }

  const fetched = []
  const reused = []
  for (const source of lock.sources) {
    if (existing.has(source.id)) {
      reused.push(source.id)
      continue
    }
    const destination = path.join(sourcesRoot, source.id)
    const cloneInput = from.get(source.id) ?? source.repository
    await cloneSource(source, destination, cloneInput)
    fetched.push(source.id)
  }
  return { fetched, reused }
}

async function main() {
  const from = parseArguments(process.argv.slice(2))
  const result = await fetchSources({ from })
  for (const id of result.fetched) {
    console.log(`Fetched ${id}`)
  }
  for (const id of result.reused) {
    console.log(`Verified ${id}`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
