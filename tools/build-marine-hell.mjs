import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import https from 'node:https'
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { readSourceLock, runGit, assertSafeDirectory } from './fetch-sources.mjs'
import { prepareSource, provenanceName } from './prepare-source.mjs'
import { makeJar, sanitizeJavaProperties, validateDependencyLock, verifyDependencyBytes } from './build-purplewave.mjs'

const sourceIds = ['marine-hell', 'jbwapi']
const dependencyNames = ['jna-5.18.1.jar', 'jna-platform-5.18.1.jar']
const recipePaths = [
  'source-lock.json',
  'jvm/dependencies.json',
  'patches/marine-hell/0001-use-isolated-jbwapi.patch',
  'patches/marine-hell/0002-load-bunker-with-right-click.patch',
  'patches/jbwapi/instance-discovery.patch',
  'tools/build-marine-hell.mjs',
  'tools/build-purplewave.mjs',
  'tools/prepare-source.mjs',
  'tools/fetch-sources.mjs',
  'bots/marine-hell/BUILD.md',
  'tools/package-marine-hell.mjs',
  'tools/package-purplewave.mjs',
  'tools/package-zzzkbot.mjs',
  'tools/publication-archive.mjs',
  'tools/validate.mjs',
  'schemas/metadata.schema.json',
  'bots/marine-hell/RELEASE.txt',
  'bots/marine-hell/APACHE-2.0-LICENSE.txt',
  'bots/marine-hell/JNA-THIRD-PARTY-NOTICES.txt',
  'package.json',
  'pnpm-lock.yaml',
]
const outputName = /^[a-z0-9][a-z0-9-]*$/
const devices = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function stat(file) {
  try {
    return await lstat(file)
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

function validateOutputName(name) {
  if (!outputName.test(name ?? '') || devices.test(name))
    throw new Error('Output must be a new safe directory name under .build')
  return name
}

function relativeTo(parent, file) {
  const result = path.relative(parent, file)
  if (!result || path.isAbsolute(result) || result === '..' || result.startsWith(`..${path.sep}`))
    throw new Error(`Path is outside the expected directory: ${file}`)
  return result.split(path.sep).join('/')
}

async function run(command, args, capture = false) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: capture ? 'pipe' : 'inherit',
    })
    let output = ''
    if (capture) {
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (value) => (output += value))
      child.stderr.on('data', (value) => (output += value))
    }
    child.once('error', (error) => reject(new Error(`Could not start ${command}: ${error.message}`)))
    child.once('close', (code) =>
      code === 0 ? resolve(output.trim()) : reject(new Error(`${command} exited with code ${code}: ${output.trim()}`)),
    )
  })
}

async function toolchain(javaHome) {
  if (!javaHome) throw new Error('Pass an x64 JDK home or set JAVA_HOME')
  const home = path.resolve(javaHome)
  const javac = path.join(home, 'bin', 'javac.exe')
  const java = path.join(home, 'bin', 'java.exe')
  for (const executable of [javac, java]) {
    const value = await stat(executable)
    if (!value?.isFile() || value.isSymbolicLink())
      throw new Error(`Java executable is unsafe: ${executable}`)
  }
  const [javacVersion, javaOutput] = await Promise.all([
    run(javac, ['-version'], true),
    run(java, ['-XshowSettings:properties', '-version'], true),
  ])
  const javacMajor = Number(/^javac (?:1\.)?(\d+)/.exec(javacVersion)?.[1])
  const properties = sanitizeJavaProperties(javaOutput)
  const javaMajor = Number(/^(?:1\.)?(\d+)/.exec(properties.javaVersion ?? '')?.[1])
  if (
    !Number.isInteger(javacMajor) || javacMajor < 9 ||
    !Number.isInteger(javaMajor) || javaMajor < 8 ||
    properties.dataModel !== '64' || !/^(?:amd64|x86_64)$/i.test(properties.osArchitecture ?? '')
  ) throw new Error('Marine Hell needs an x64 JDK 9 or newer to compile with --release 8')
  return { javac, javacVersion, java: properties }
}

async function cachedDependency(cache, artifact) {
  const file = path.join(cache, artifact.name)
  const existing = await stat(file)
  if (existing) {
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error(`Unsafe dependency cache entry: ${file}`)
    return { artifact, bytes: verifyDependencyBytes(artifact, await readFile(file)) }
  }
  const bytes = await new Promise((resolve, reject) => {
    const request = https.get(artifact.url, { headers: { 'User-Agent': 'robotics-facility-build' } })
    request.setTimeout(60_000, () => request.destroy(new Error(`Download timed out: ${artifact.name}`)))
    request.once('error', reject)
    request.once('response', (response) => {
      if (response.statusCode !== 200 || response.headers.location) {
        response.resume()
        reject(new Error(`Could not download ${artifact.name}: HTTP ${response.statusCode}`))
        return
      }
      const chunks = []
      let length = 0
      response.on('data', (chunk) => {
        length += chunk.length
        if (length > artifact.sizeBytes) response.destroy(new Error(`Download exceeds locked size: ${artifact.name}`))
        else chunks.push(chunk)
      })
      response.once('error', reject)
      response.once('end', () => {
        try { resolve(verifyDependencyBytes(artifact, Buffer.concat(chunks))) }
        catch (error) { reject(error) }
      })
    })
  })
  try { await writeFile(file, bytes, { flag: 'wx' }) }
  catch (error) {
    if (error.code !== 'EEXIST') throw error
    return await cachedDependency(cache, artifact)
  }
  return { artifact, bytes }
}

async function recipeProvenance(root) {
  const inputs = []
  const digest = createHash('sha256')
  for (const name of recipePaths) {
    const file = path.join(root, name)
    const value = await stat(file)
    if (!value?.isFile() || value.isSymbolicLink()) throw new Error(`Unsafe recipe input: ${name}`)
    const bytes = await readFile(file)
    digest.update(name).update('\0').update(bytes).update('\0')
    inputs.push({ path: name, sha256: sha256(bytes), sizeBytes: bytes.length })
  }
  const [revision, status] = await Promise.all([
    runGit(['-C', root, 'rev-parse', 'HEAD']),
    runGit(['-C', root, 'status', '--porcelain', '--', ...recipePaths]),
  ])
  return { revision, sha256: digest.digest('hex'), inputs, dirty: Boolean(status) }
}

async function sourceProvenance(source, directory) {
  const provenance = JSON.parse(await readFile(path.join(directory, provenanceName), 'utf8'))
  const [head, tree, unstaged, untracked] = await Promise.all([
    runGit(['-C', directory, 'rev-parse', 'HEAD']),
    runGit(['-C', directory, 'write-tree']),
    runGit(['-C', directory, 'diff', '--name-only']),
    runGit(['-C', directory, 'ls-files', '--others', '--exclude-standard']),
  ])
  if (
    head !== source.revision || tree !== provenance.tree ||
    JSON.stringify(provenance.source) !== JSON.stringify(source) || unstaged || untracked
  ) throw new Error(`Prepared ${source.id} source changed after patching`)
  return { id: source.id, directory, tree, source }
}

async function files(directory, extension) {
  const result = []
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))
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

async function compileArguments(file, sources) {
  const quote = (value) => `"${value.replaceAll('\\', '/').replaceAll('"', '\\"')}"`
  await writeFile(file, sources.map(quote).join('\r\n') + '\r\n', { flag: 'wx' })
  return `@${file}`
}

function manifestLine(name, value) {
  const lines = []
  let line = `${name}: `
  for (const char of value) {
    if (Buffer.byteLength(line + char) > 72) {
      lines.push(line)
      line = ` ${char}`
    } else line += char
  }
  return [...lines, line].join('\r\n') + '\r\n'
}

function manifest(dependencies) {
  return Buffer.from(
    manifestLine('Manifest-Version', '1.0') +
    manifestLine('Main-Class', 'TestBot1') +
    manifestLine('Add-Opens', 'java.base/java.nio') +
    manifestLine('Class-Path', dependencies.map(({ artifact }) => `lib/${artifact.name}`).join(' ')) +
    '\r\n', 'utf8',
  )
}

export async function buildMarineHell({ root = process.cwd(), outputDir, javaHome = process.env.JAVA_HOME } = {}) {
  const repository = await realpath(root)
  const buildRoot = path.join(repository, '.build')
  if (!(await assertSafeDirectory(buildRoot, '.build'))) await mkdir(buildRoot)
  const output = path.join(buildRoot, validateOutputName(outputDir))
  if (await stat(output)) throw new Error(`Build output already exists: ${output}`)
  const recipe = await recipeProvenance(repository)
  const lock = await readSourceLock(repository)
  const sources = sourceIds.map((id) => {
    const source = lock.sources.find((entry) => entry.id === id)
    if (!source) throw new Error(`source-lock.json is missing ${id}`)
    return source
  })
  const dependencyLock = validateDependencyLock(JSON.parse(await readFile(path.join(repository, 'jvm/dependencies.json'), 'utf8')))
  const cache = path.join(buildRoot, 'java-dependencies')
  if (!(await assertSafeDirectory(cache, 'Java dependency cache'))) await mkdir(cache)
  const dependencies = []
  for (const name of dependencyNames) {
    const artifact = dependencyLock.artifacts.find((entry) => entry.name === name)
    if (!artifact?.runtime) throw new Error(`Missing locked runtime dependency: ${name}`)
    dependencies.push(await cachedDependency(cache, artifact))
  }
  const jdk = await toolchain(javaHome)
  const prepared = []
  for (const source of sources) {
    const directory = path.join(output, 'sources', source.id)
    await prepareSource({ rootDir: repository, sourceId: source.id, outputDir: relativeTo(repository, directory) })
    prepared.push(await sourceProvenance(source, directory))
  }
  const dirs = new Map(prepared.map((item) => [item.id, item.directory]))
  const classes = path.join(output, 'classes')
  const compile = path.join(output, 'compile')
  const bin = path.join(output, 'bin')
  const lib = path.join(bin, 'lib')
  for (const directory of [classes, compile, lib]) await mkdir(directory, { recursive: true })
  const javaSources = await files(path.join(dirs.get('jbwapi'), 'src/main/java'), '.java')
  const marineSource = path.join(dirs.get('marine-hell'), 'src/TestBot1.java')
  if (!(await stat(marineSource))?.isFile()) throw new Error('Marine Hell entry source is missing')
  const jbwapiArgs = await compileArguments(path.join(compile, 'jbwapi.args'), javaSources)
  const marineArgs = await compileArguments(path.join(compile, 'marine.args'), [marineSource])
  const jars = dependencies.map(({ artifact }) => path.join(cache, artifact.name))
  // JBWAPI uses sun.misc.Unsafe, which --release 8 intentionally hides from javac.
  await run(jdk.javac, ['-encoding', 'UTF-8', '-source', '8', '-target', '8', '-Xlint:-options', '-cp', jars.join(path.delimiter), '-d', classes, jbwapiArgs])
  await run(jdk.javac, ['-encoding', 'UTF-8', '--release', '8', '-Xlint:-options', '-cp', [classes, ...jars].join(path.delimiter), '-d', classes, marineArgs])
  const entries = [['META-INF/MANIFEST.MF', manifest(dependencies)]]
  for (const file of await files(classes)) entries.push([relativeTo(classes, file), await readFile(file)])
  const jar = path.join(bin, 'MarineHell.jar')
  const jarBytes = await makeJar(entries)
  await writeFile(jar, jarBytes, { flag: 'wx' })
  const built = [{ path: relativeTo(output, jar), sha256: sha256(jarBytes), sizeBytes: jarBytes.length }]
  for (const { artifact, bytes } of dependencies) {
    const destination = path.join(lib, artifact.name)
    await writeFile(destination, bytes, { flag: 'wx' })
    built.push({ path: relativeTo(output, destination), sha256: sha256(bytes), sizeBytes: bytes.length })
  }
  const verified = []
  for (const source of sources) {
    const directory = dirs.get(source.id)
    verified.push({ ...await sourceProvenance(source, directory), directory: relativeTo(output, directory) })
  }
  const after = await recipeProvenance(repository)
  if (after.sha256 !== recipe.sha256 || after.revision !== recipe.revision)
    throw new Error('Marine Hell recipe inputs changed during compilation')
  const buildInfo = {
    schemaVersion: 1,
    recipeRevision: recipe.revision,
    recipeSha256: recipe.sha256,
    recipeInputs: recipe.inputs,
    recipeDirty: recipe.dirty || after.dirty,
    toolchain: { javacVersion: jdk.javacVersion, java: jdk.java, targetRelease: 8 },
    sources: verified,
    dependencies: dependencies.map(({ artifact }) => artifact),
    files: built,
  }
  await writeFile(path.join(output, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n', { flag: 'wx' })
  return { output, buildInfo }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [outputDir, javaHome, ...rest] = process.argv.slice(2)
  if (!outputDir || rest.length) {
    console.error('Usage: node tools/build-marine-hell.mjs <new-output-directory> [java-home]')
    process.exitCode = 1
  } else {
    buildMarineHell({ outputDir, javaHome })
      .then(({ output }) => console.log(`Built Marine Hell in ${output}`))
      .catch((error) => { console.error(error.message); process.exitCode = 1 })
  }
}
