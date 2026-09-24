import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import https from 'node:https'
import path from 'node:path'
import yazl from 'yazl'

const jarName = /^[a-z0-9][a-z0-9.-]*\.jar$/
const devices = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

export interface DependencyArtifact {
  name: string
  url: string
  sha256: string
  sizeBytes: number
  runtime: boolean
}
export interface DependencyLock {
  schemaVersion: 1
  artifacts: DependencyArtifact[]
}
export interface JavaProperties {
  javaVersion?: string
  javaVendor?: string
  javaVmName?: string
  javaVmVersion?: string
  osArchitecture?: string
  dataModel?: string
}
export interface JavaFileRecord {
  path: string
  sha256: string
  sizeBytes: number
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

const lockError = (value: string) => new Error(`Invalid jvm/dependencies.json: ${value}`)

export function validateDependencyLock(lock: unknown): DependencyLock {
  if (
    !isRecord(lock) ||
    Object.keys(lock).sort().join(',') !== 'artifacts,schemaVersion' ||
    lock.schemaVersion !== 1 ||
    !Array.isArray(lock.artifacts) ||
    !lock.artifacts.length
  ) {
    throw lockError('must contain schemaVersion 1 and a non-empty artifacts array')
  }
  const names = new Set<string>()
  for (const artifact of lock.artifacts as unknown[]) {
    if (
      !isRecord(artifact) ||
      Object.keys(artifact).sort().join(',') !== 'name,runtime,sha256,sizeBytes,url'
    ) {
      throw lockError('each artifact needs name, url, sha256, sizeBytes, and runtime')
    }
    if (
      typeof artifact.name !== 'string' ||
      !jarName.test(artifact.name) ||
      devices.test(artifact.name.slice(0, -4)) ||
      names.has(artifact.name)
    ) {
      throw lockError(`invalid artifact name: ${JSON.stringify(artifact.name)}`)
    }
    names.add(artifact.name)
    if (typeof artifact.url !== 'string') throw lockError('invalid artifact URL')
    let url: URL
    try {
      url = new URL(artifact.url)
    } catch {
      throw lockError(`invalid URL for ${artifact.name}`)
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.hostname !== 'repo.maven.apache.org' ||
      !url.pathname.startsWith('/maven2/') ||
      url.search ||
      url.hash ||
      path.posix.basename(url.pathname) !== artifact.name
    ) {
      throw lockError(`${artifact.name} must use its canonical Maven Central HTTPS URL`)
    }
    if (typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(artifact.sha256))
      throw lockError(`invalid SHA-256 for ${artifact.name}`)
    if (
      typeof artifact.sizeBytes !== 'number' ||
      !Number.isSafeInteger(artifact.sizeBytes) ||
      artifact.sizeBytes <= 0
    )
      throw lockError(`invalid size for ${artifact.name}`)
    if (typeof artifact.runtime !== 'boolean')
      throw lockError(`runtime must be boolean for ${artifact.name}`)
  }
  return lock as unknown as DependencyLock
}

export function verifyDependencyBytes(
  artifact: Pick<DependencyArtifact, 'name' | 'sha256' | 'sizeBytes'>,
  bytes: unknown,
): Buffer {
  if (!Buffer.isBuffer(bytes)) throw new Error(`Dependency ${artifact.name} is not bytes`)
  if (bytes.length !== artifact.sizeBytes || sha256(bytes) !== artifact.sha256)
    throw new Error(`Dependency ${artifact.name} has a size or SHA-256 mismatch`)
  return bytes
}

export function verifyRecordedFile(record: unknown, bytes: Buffer) {
  if (
    !isRecord(record) ||
    typeof record.path !== 'string' ||
    !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(record.path) ||
    typeof record.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.sha256) ||
    typeof record.sizeBytes !== 'number' ||
    !Number.isSafeInteger(record.sizeBytes) ||
    bytes.length !== record.sizeBytes ||
    sha256(bytes) !== record.sha256
  ) {
    throw new Error(
      `Built file changed: ${isRecord(record) && typeof record.path === 'string' ? record.path : 'invalid record'}`,
    )
  }
  return true
}

export async function stat(file: string) {
  try {
    return await lstat(file)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
}

export async function safeDirectory(directory: string, label: string, create = false) {
  const value = await stat(directory)
  if (!value) {
    if (!create) return false
    await mkdir(directory, { recursive: true })
    return await safeDirectory(directory, label)
  }
  if (!value.isDirectory() || value.isSymbolicLink())
    throw new Error(`${label} must be a non-link directory: ${directory}`)
  return true
}

export async function run(command: string, args: string[], captured = false): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: captured ? 'pipe' : 'inherit',
    })
    let output = ''
    if (captured) {
      child.stdout!.setEncoding('utf8')
      child.stderr!.setEncoding('utf8')
      child.stdout!.on('data', value => (output += value))
      child.stderr!.on('data', value => (output += value))
    }
    child.once('error', error =>
      reject(new Error(`Could not start ${command}: ${errorMessage(error)}`)),
    )
    child.once('close', code =>
      code === 0
        ? resolve(output.trim())
        : reject(new Error(`${command} exited with code ${code}: ${output.trim()}`)),
    )
  })
}

export function relativeTo(parent: string, target: string) {
  const result = path.relative(parent, target)
  if (!result || path.isAbsolute(result) || result === '..' || result.startsWith(`..${path.sep}`))
    throw new Error(`Path is outside the build output: ${target}`)
  return result.split(path.sep).join('/')
}

export async function files(directory: string, extension?: string): Promise<string[]> {
  const result: string[] = []
  async function visit(current: string) {
    const entries = await readdir(current, { withFileTypes: true })
    entries.sort((a, b) => {
      if (a.name < b.name) return -1
      if (a.name > b.name) return 1
      return 0
    })
    for (const entry of entries) {
      const file = path.join(current, entry.name)
      const value = await lstat(file)
      if (value.isSymbolicLink()) throw new Error(`Input must not be a link: ${file}`)
      if (value.isDirectory()) await visit(file)
      else if (value.isFile() && (!extension || file.endsWith(extension))) result.push(file)
      else if (!value.isFile()) throw new Error(`Input must be a regular file: ${file}`)
    }
  }
  await visit(directory)
  if (!result.length) throw new Error(`No ${extension ?? ''} files found in ${directory}`)
  return result
}

export async function argumentFile(file: string, sourceFiles: string[]) {
  const quote = (value: string) => `"${value.replaceAll('\\', '/').replaceAll('"', '\\"')}"`
  await writeFile(file, sourceFiles.map(quote).join('\r\n') + '\r\n', { flag: 'wx' })
  return `@${file}`
}

export function classPath(jars: string[]) {
  return jars.join(path.delimiter)
}

function manifestLine(name: string, value: string) {
  const lines = []
  let line = `${name}: `
  let length = Buffer.byteLength(line)
  for (const character of value) {
    const size = Buffer.byteLength(character)
    if (length + size > 72) {
      lines.push(line)
      line = ` ${character}`
      length = 1 + size
    } else {
      line += character
      length += size
    }
  }
  lines.push(line)
  return lines.join('\r\n') + '\r\n'
}

export function makeManifest(
  mainClass: string,
  runtimeArtifacts: Pick<DependencyArtifact, 'name'>[],
) {
  return Buffer.from(
    manifestLine('Manifest-Version', '1.0') +
      manifestLine('Main-Class', mainClass) +
      manifestLine('Add-Opens', 'java.base/java.nio') +
      manifestLine(
        'Class-Path',
        runtimeArtifacts.map(artifact => `lib/${artifact.name}`).join(' '),
      ) +
      '\r\n',
    'utf8',
  )
}

export async function makeJar(entries: Iterable<[string, Buffer]>): Promise<Buffer> {
  const zip = new yazl.ZipFile()
  const chunks: Buffer[] = []
  const complete = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on('data', chunk => chunks.push(chunk))
    zip.outputStream.once('end', () => resolve(Buffer.concat(chunks)))
    zip.outputStream.once('error', reject)
  })
  const seen = new Set()
  for (const [name, bytes] of [...entries].sort(([a], [b]) => {
    if (a < b) return -1
    if (a > b) return 1
    return 0
  })) {
    if (
      !/^[A-Za-z0-9_.$/-]+$/.test(name) ||
      name.startsWith('/') ||
      name.split('/').some(part => !part || part === '.' || part === '..') ||
      seen.has(name)
    ) {
      throw new Error(`Unsafe or duplicate JAR entry: ${name}`)
    }
    seen.add(name)
    zip.addBuffer(bytes, name, {
      mtime: new Date('2026-01-01T00:00:00Z'),
      forceDosTimestamp: true,
      mode: 0o100644,
    })
  }
  zip.end()
  return await complete
}

export async function cachedDependency(directory: string, artifact: DependencyArtifact) {
  const file = path.join(directory, artifact.name)
  const value = await stat(file)
  if (value) {
    if (!value.isFile() || value.isSymbolicLink())
      throw new Error(`Dependency cache entry is unsafe: ${file}`)
    return { artifact, file, bytes: verifyDependencyBytes(artifact, await readFile(file)) }
  }
  const bytes = await new Promise<Buffer>((resolve, reject) => {
    const request = https.get(artifact.url, {
      headers: { 'User-Agent': 'robotics-facility-build' },
    })
    request.setTimeout(60_000, () =>
      request.destroy(new Error(`Download timed out: ${artifact.name}`)),
    )
    request.once('error', reject)
    request.once('response', response => {
      if (response.statusCode !== 200 || response.headers.location) {
        response.resume()
        reject(new Error(`Could not download ${artifact.name}: HTTP ${response.statusCode}`))
        return
      }
      if (
        response.headers['content-length'] &&
        Number(response.headers['content-length']) !== artifact.sizeBytes
      ) {
        response.destroy()
        reject(new Error(`Could not download ${artifact.name}: unexpected Content-Length`))
        return
      }
      let length = 0
      const chunks: Buffer[] = []
      response.on('data', chunk => {
        length += chunk.length
        if (length > artifact.sizeBytes)
          response.destroy(new Error(`Download exceeds locked size: ${artifact.name}`))
        else chunks.push(chunk)
      })
      response.once('error', reject)
      response.once('end', () => {
        try {
          resolve(verifyDependencyBytes(artifact, Buffer.concat(chunks)))
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    })
  })
  try {
    await writeFile(file, bytes, { flag: 'wx' })
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
    return await cachedDependency(directory, artifact)
  }
  return { artifact, file, bytes }
}

export function sanitizeJavaProperties(output: string): JavaProperties {
  const properties: JavaProperties = {}
  const fields = {
    'java.version': 'javaVersion',
    'java.vendor': 'javaVendor',
    'java.vm.name': 'javaVmName',
    'java.vm.version': 'javaVmVersion',
    'os.arch': 'osArchitecture',
    'sun.arch.data.model': 'dataModel',
  }
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*([^=]+?)\s*=\s*(.*?)\s*$/.exec(line)
    if (match && Object.hasOwn(fields, match[1])) {
      const key = match[1] as keyof typeof fields
      properties[fields[key] as keyof JavaProperties] = match[2]
    }
  }
  return properties
}

export async function inspectJavaToolchain(javaHome: string) {
  const javac = path.join(javaHome, 'bin', 'javac.exe')
  const java = path.join(javaHome, 'bin', 'java.exe')
  for (const file of [javac, java]) {
    const value = await stat(file)
    if (!value?.isFile() || value.isSymbolicLink())
      throw new Error(`Java executable is unsafe: ${file}`)
  }
  const [javacVersion, javaVersion] = await Promise.all([
    run(javac, ['-version'], true),
    run(java, ['-XshowSettings:properties', '-version'], true),
  ])
  const javaProperties = sanitizeJavaProperties(javaVersion)
  return { javac, java, javacVersion, javaProperties }
}
