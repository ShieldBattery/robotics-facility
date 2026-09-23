import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import https from 'node:https'
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import yazl from 'yazl'
import { readSourceLock, runGit } from './fetch-sources.mjs'
import { prepareSource, provenanceName } from './prepare-source.mjs'

const sourceIds = ['purplewave', 'jbwapi', 'jbweb', 'javajps', 'mjson']
const outputName = /^[a-z0-9][a-z0-9-]*$/
const jarName = /^[a-z0-9][a-z0-9.-]*\.jar$/
const devices = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const defaultJavaHome = process.env.JAVA_HOME

export const recipePaths = Object.freeze([
  'source-lock.json',
  'jvm/dependencies.json',
  'tools/build-purplewave.mjs',
  'tools/prepare-source.mjs',
  'tools/fetch-sources.mjs',
  'bots/purplewave/PurpleWaveShieldBattery.config.json',
  'bots/purplewave/BUILD.md',
  'bots/purplewave/RELEASE.txt',
  'bots/purplewave/JNA-THIRD-PARTY-NOTICES.txt',
  'tools/package-purplewave.mjs',
  'tools/package-zzzkbot.mjs',
  'tools/publication-archive.mjs',
  'tools/validate.mjs',
  'schemas/metadata.schema.json',
  'package.json',
  'pnpm-lock.yaml',
])

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function validateOutputDirectory(value) {
  if (typeof value !== 'string' || !outputName.test(value) || devices.test(value))
    throw new Error('Output directory must be a new safe directory name under .build')
  return value
}

export function parseBuildArguments(args) {
  if (args.length < 1 || args.length > 2)
    throw new Error('Usage: node tools/build-purplewave.mjs <new-output-directory> [java-home]')
  return { outputDir: validateOutputDirectory(args[0]), javaHome: args[1] }
}

const lockError = (value) => new Error(`Invalid jvm/dependencies.json: ${value}`)

export function validateDependencyLock(lock) {
  if (
    !lock ||
    typeof lock !== 'object' ||
    Array.isArray(lock) ||
    Object.keys(lock).sort().join(',') !== 'artifacts,schemaVersion' ||
    lock.schemaVersion !== 1 ||
    !Array.isArray(lock.artifacts) ||
    !lock.artifacts.length
  ) {
    throw lockError('must contain schemaVersion 1 and a non-empty artifacts array')
  }
  const names = new Set()
  for (const artifact of lock.artifacts) {
    if (
      !artifact ||
      typeof artifact !== 'object' ||
      Array.isArray(artifact) ||
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
    let url
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
    if (!Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0)
      throw lockError(`invalid size for ${artifact.name}`)
    if (typeof artifact.runtime !== 'boolean')
      throw lockError(`runtime must be boolean for ${artifact.name}`)
  }
  return lock
}

export function verifyDependencyBytes(artifact, bytes) {
  if (!Buffer.isBuffer(bytes)) throw new Error(`Dependency ${artifact.name} is not bytes`)
  if (bytes.length !== artifact.sizeBytes || sha256(bytes) !== artifact.sha256)
    throw new Error(`Dependency ${artifact.name} has a size or SHA-256 mismatch`)
  return bytes
}

export function verifyRecordedFile(record, bytes) {
  if (
    !record ||
    !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(record.path) ||
    !/^[a-f0-9]{64}$/.test(record.sha256) ||
    !Number.isSafeInteger(record.sizeBytes) ||
    bytes.length !== record.sizeBytes ||
    sha256(bytes) !== record.sha256
  ) {
    throw new Error(`Built file changed: ${record?.path ?? 'invalid record'}`)
  }
  return true
}

async function stat(file) {
  try {
    return await lstat(file)
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

async function safeDirectory(directory, label, create = false) {
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

async function run(command, args, captured = false) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: captured ? 'pipe' : 'inherit',
    })
    let output = ''
    if (captured) {
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (value) => (output += value))
      child.stderr.on('data', (value) => (output += value))
    }
    child.once('error', (error) =>
      reject(new Error(`Could not start ${command}: ${error.message}`)),
    )
    child.once('close', (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(new Error(`${command} exited with code ${code}: ${output.trim()}`)),
    )
  })
}

async function recipeProvenance(root) {
  const [revision, tracked, changed] = await Promise.all([
    runGit(['-C', root, 'rev-parse', 'HEAD']),
    runGit(['-C', root, 'ls-files', '--', ...recipePaths]),
    runGit(['-C', root, 'diff', '--name-only', 'HEAD', '--', ...recipePaths]),
  ])
  const paths = tracked ? tracked.split(/\r?\n/) : []
  if (paths.length !== recipePaths.length || recipePaths.some((file) => !paths.includes(file)))
    throw new Error('The PurpleWave recipe inputs must be tracked before building')
  if (changed) throw new Error('The PurpleWave recipe inputs differ from HEAD')
  const digest = createHash('sha256')
  for (const file of recipePaths)
    digest
      .update(file)
      .update('\0')
      .update(await readFile(path.join(root, file)))
      .update('\0')
  return { revision, sha256: digest.digest('hex') }
}

export function validateProvenanceRecord({
  source,
  provenance,
  head,
  indexTree,
  unstaged,
  untracked,
}) {
  if (!provenance || provenance.schemaVersion !== 1 || !provenance.source || !provenance.tree)
    throw new Error(`Missing source provenance for ${source.id}`)
  if (JSON.stringify(provenance.source) !== JSON.stringify(source))
    throw new Error(`Source provenance does not match source-lock.json for ${source.id}`)
  if (head !== source.revision) throw new Error(`Prepared ${source.id} HEAD does not match its pin`)
  if (indexTree !== provenance.tree)
    throw new Error(`Prepared ${source.id} index tree differs from provenance`)
  if (unstaged) throw new Error(`Prepared ${source.id} has unstaged changes`)
  if (untracked) throw new Error(`Prepared ${source.id} has untracked files`)
}

async function sourceProvenance(source, directory) {
  const provenance = JSON.parse(await readFile(path.join(directory, provenanceName), 'utf8'))
  const [head, indexTree, unstaged, untracked] = await Promise.all([
    runGit(['-C', directory, 'rev-parse', 'HEAD']),
    runGit(['-C', directory, 'write-tree']),
    runGit(['-C', directory, 'diff', '--name-only']),
    runGit(['-C', directory, 'ls-files', '--others', '--exclude-standard']),
  ])
  validateProvenanceRecord({ source, provenance, head, indexTree, unstaged, untracked })
  return { source, directory, tree: indexTree }
}

function relativeTo(parent, target) {
  const result = path.relative(parent, target)
  if (!result || path.isAbsolute(result) || result === '..' || result.startsWith(`..${path.sep}`))
    throw new Error(`Path is outside the build output: ${target}`)
  return result.split(path.sep).join('/')
}

async function files(directory, extension) {
  const result = []
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true })
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
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

async function argumentFile(file, sourceFiles) {
  const quote = (value) => `"${value.replaceAll('\\', '/').replaceAll('"', '\\"')}"`
  await writeFile(file, sourceFiles.map(quote).join('\r\n') + '\r\n', { flag: 'wx' })
  return `@${file}`
}

function classPath(jars) {
  return jars.join(path.delimiter)
}

function manifestLine(name, value) {
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

export function makeManifest(runtimeArtifacts) {
  return Buffer.from(
    manifestLine('Manifest-Version', '1.0') +
      manifestLine('Main-Class', 'Lifecycle.Main') +
      manifestLine('Add-Opens', 'java.base/java.nio') +
      manifestLine(
        'Class-Path',
        runtimeArtifacts.map((artifact) => `lib/${artifact.name}`).join(' '),
      ) +
      '\r\n',
    'utf8',
  )
}

export async function makeJar(entries) {
  const zip = new yazl.ZipFile()
  const chunks = []
  const complete = new Promise((resolve, reject) => {
    zip.outputStream.on('data', (chunk) => chunks.push(chunk))
    zip.outputStream.once('end', () => resolve(Buffer.concat(chunks)))
    zip.outputStream.once('error', reject)
  })
  const seen = new Set()
  for (const [name, bytes] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (
      !/^[A-Za-z0-9_.$/-]+$/.test(name) ||
      name.startsWith('/') ||
      name.split('/').some((part) => !part || part === '.' || part === '..') ||
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

async function cachedDependency(directory, artifact) {
  const file = path.join(directory, artifact.name)
  const value = await stat(file)
  if (value) {
    if (!value.isFile() || value.isSymbolicLink())
      throw new Error(`Dependency cache entry is unsafe: ${file}`)
    return { artifact, file, bytes: verifyDependencyBytes(artifact, await readFile(file)) }
  }
  const bytes = await new Promise((resolve, reject) => {
    const request = https.get(artifact.url, {
      headers: { 'User-Agent': 'robotics-facility-build' },
    })
    request.setTimeout(60_000, () =>
      request.destroy(new Error(`Download timed out: ${artifact.name}`)),
    )
    request.once('error', reject)
    request.once('response', (response) => {
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
      const chunks = []
      response.on('data', (chunk) => {
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
          reject(error)
        }
      })
    })
  })
  try {
    await writeFile(file, bytes, { flag: 'wx' })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    return await cachedDependency(directory, artifact)
  }
  return { artifact, file, bytes }
}

export function sanitizeJavaProperties(output) {
  const properties = {}
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
    if (match && Object.hasOwn(fields, match[1])) properties[fields[match[1]]] = match[2]
  }
  return properties
}

async function javaToolchain(javaHome) {
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
  if (
    !/(?:^|\s)javac 21(?:[.\s]|$)/m.test(javacVersion) ||
    !/^21(?:[.]|$)/.test(javaProperties.javaVersion ?? '') ||
    javaProperties.dataModel !== '64' ||
    !/^(?:amd64|x86_64)$/i.test(javaProperties.osArchitecture ?? '') ||
    !javaProperties.javaVendor ||
    !javaProperties.javaVmName ||
    !javaProperties.javaVmVersion
  ) {
    throw new Error('PurpleWave requires JDK 21 x64')
  }
  return { javac, java, javacVersion, javaProperties }
}

export function makeBuildInfo({ recipeRevision, recipeSha256, toolchain, sources, files }) {
  return {
    schemaVersion: 1,
    recipeRevision,
    recipeSha256,
    toolchain,
    sources: sources.map(({ source, directory, tree }) => ({
      id: source.id,
      directory,
      tree,
      source,
    })),
    files,
  }
}

export async function buildPurpleWave({
  root = process.cwd(),
  outputDir,
  javaHome = defaultJavaHome,
  dependencyDirectory,
} = {}) {
  const repository = await realpath(root)
  const buildRoot = path.join(repository, '.build')
  const output = path.join(buildRoot, validateOutputDirectory(outputDir))
  await safeDirectory(buildRoot, '.build', true)
  if (await stat(output)) throw new Error(`Build output already exists: ${output}`)

  const recipe = await recipeProvenance(repository)
  const sourceLock = await readSourceLock(repository)
  const sources = sourceIds.map((id) => {
    const source = sourceLock.sources.find((candidate) => candidate.id === id)
    if (!source) throw new Error(`source-lock.json is missing ${id}`)
    return source
  })
  const dependencyLock = validateDependencyLock(
    JSON.parse(await readFile(path.join(repository, 'jvm', 'dependencies.json'), 'utf8')),
  )
  const cache = path.resolve(repository, dependencyDirectory ?? '.build/java-dependencies')
  const cacheRelative = path.relative(buildRoot, cache)
  if (
    !cacheRelative ||
    path.isAbsolute(cacheRelative) ||
    cacheRelative === '..' ||
    cacheRelative.startsWith(`..${path.sep}`)
  ) {
    throw new Error('Java dependency cache must be a directory beneath .build')
  }
  let cacheAncestor = buildRoot
  for (const part of cacheRelative.split(path.sep)) {
    cacheAncestor = path.join(cacheAncestor, part)
    await safeDirectory(cacheAncestor, 'Java dependency cache', true)
  }
  const dependencies = []
  for (const artifact of dependencyLock.artifacts)
    dependencies.push(await cachedDependency(cache, artifact))

  const prepared = []
  for (const source of sources) {
    const directory = path.join(output, 'sources', source.id)
    await prepareSource({
      rootDir: repository,
      sourceId: source.id,
      outputDir: relativeTo(repository, directory),
    })
    prepared.push(await sourceProvenance(source, directory))
  }

  const directories = new Map(prepared.map((item) => [item.source.id, item.directory]))
  const classes = path.join(output, 'classes')
  const macros = path.join(output, 'macroclasses')
  const compile = path.join(output, 'compile')
  await Promise.all([
    mkdir(classes, { recursive: true }),
    mkdir(macros, { recursive: true }),
    mkdir(compile, { recursive: true }),
  ])
  const javaSources = (
    await Promise.all([
      files(path.join(directories.get('jbwapi'), 'src/main/java'), '.java'),
      files(path.join(directories.get('jbweb'), 'src/main/java'), '.java'),
      files(path.join(directories.get('javajps'), 'src/main/java'), '.java'),
      files(path.join(directories.get('mjson'), 'src/java'), '.java'),
      files(path.join(directories.get('purplewave'), 'src'), '.java'),
    ])
  ).flat()
  const [macroSources, scalaSources] = await Promise.all([
    files(path.join(directories.get('purplewave'), 'src-macros'), '.scala'),
    files(path.join(directories.get('purplewave'), 'src'), '.scala'),
  ])
  const [javaArgs, macroArgs, scalaArgs] = await Promise.all([
    argumentFile(path.join(compile, 'java.args'), javaSources),
    argumentFile(path.join(compile, 'macros.args'), macroSources),
    argumentFile(path.join(compile, 'scala.args'), scalaSources),
  ])

  if (!javaHome) throw new Error('PurpleWave requires an explicit javaHome or JAVA_HOME')
  const tools = await javaToolchain(path.resolve(javaHome))
  const allJars = dependencies.map((dependency) => dependency.file)
  await run(tools.javac, [
    '-encoding',
    'UTF-8',
    '-source',
    '8',
    '-target',
    '8',
    '-cp',
    classPath(allJars),
    '-d',
    classes,
    javaArgs,
  ])
  const scala = [
    '-Xmx2g',
    '-cp',
    classPath(allJars),
    'scala.tools.nsc.Main',
    '-encoding',
    'UTF-8',
    '-unchecked',
    '-feature',
    '-deprecation',
    '-language:postfixOps',
    '-classpath',
    classPath([...allJars, classes, macros]),
  ]
  await run(tools.java, [...scala, '-d', macros, macroArgs])
  await run(tools.java, [
    ...scala,
    '-opt:l:default,inline',
    '-opt-inline-from:Micro.Targeting.**',
    '-opt-warnings',
    '-d',
    classes,
    scalaArgs,
  ])

  const bin = path.join(output, 'bin')
  const lib = path.join(bin, 'lib')
  await mkdir(lib, { recursive: true })
  const runtime = dependencies.filter((dependency) => dependency.artifact.runtime)
  const jar = path.join(bin, 'PurpleWave.jar')
  const entries = [['META-INF/MANIFEST.MF', makeManifest(runtime.map(({ artifact }) => artifact))]]
  for (const directory of [classes, macros])
    for (const file of await files(directory))
      entries.push([relativeTo(directory, file), await readFile(file)])
  await writeFile(jar, await makeJar(entries), { flag: 'wx' })
  const jarBytes = await readFile(jar)
  const buildFiles = [
    { path: relativeTo(output, jar), sha256: sha256(jarBytes), sizeBytes: jarBytes.length },
  ]
  for (const { artifact, bytes } of runtime) {
    const destination = path.join(lib, artifact.name)
    await writeFile(destination, bytes, { flag: 'wx' })
    buildFiles.push({
      path: relativeTo(output, destination),
      sha256: sha256(bytes),
      sizeBytes: bytes.length,
    })
  }

  const verified = []
  for (const item of prepared) verified.push(await sourceProvenance(item.source, item.directory))
  const after = await recipeProvenance(repository)
  if (after.revision !== recipe.revision || after.sha256 !== recipe.sha256)
    throw new Error('The PurpleWave recipe inputs changed during compilation')
  const buildInfo = makeBuildInfo({
    recipeRevision: recipe.revision,
    recipeSha256: recipe.sha256,
    toolchain: {
      javacVersion: tools.javacVersion,
      java: tools.javaProperties,
      scalaVersion: '2.12.20',
    },
    sources: verified.map((item) => ({ ...item, directory: relativeTo(output, item.directory) })),
    files: buildFiles,
  })
  await writeFile(path.join(output, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n', {
    flag: 'wx',
  })
  return { output, buildInfo }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let options
  try {
    options = parseBuildArguments(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
  if (!process.exitCode)
    buildPurpleWave(options)
      .then(({ output }) => console.log(`Built PurpleWave in ${output}`))
      .catch((error) => {
        console.error(error.message)
        process.exitCode = 1
      })
}
