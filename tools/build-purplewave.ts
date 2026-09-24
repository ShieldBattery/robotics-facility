import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { readSourceLock, runGit } from './fetch-sources.ts'
import {
  argumentFile,
  cachedDependency,
  classPath,
  type DependencyArtifact,
  errorMessage,
  files,
  inspectJavaToolchain,
  type JavaFileRecord,
  type JavaProperties,
  makeJar,
  makeManifest,
  relativeTo,
  run,
  safeDirectory,
  sha256,
  stat,
  validateDependencyLock,
} from './jvm-build.ts'
import type { Source } from './metadata.ts'
import { prepareSource } from './prepare-source.ts'
import { type PreparedSource, verifyPreparedSource } from './source-provenance.ts'

const sourceIds = ['purplewave', 'jbwapi', 'jbweb', 'javajps', 'mjson']
const outputName = /^[a-z0-9][a-z0-9-]*$/
const devices = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const defaultJavaHome = process.env.JAVA_HOME
export interface PurpleWaveBuildInfo {
  schemaVersion: 1
  recipeRevision: string
  recipeSha256: string
  toolchain: { javacVersion: string; java: JavaProperties; scalaVersion: '2.12.20' }
  sources: { id: string; directory: string; tree: string; source: Source }[]
  files: JavaFileRecord[]
}
export const recipePaths = Object.freeze([
  'source-lock.json',
  'jvm/dependencies.json',
  'tools/build-purplewave.ts',
  'tools/jvm-build.ts',
  'tools/source-provenance.ts',
  'tools/prepare-source.ts',
  'tools/fetch-sources.ts',
  'bots/purplewave/PurpleWaveShieldBattery.config.json',
  'bots/purplewave/BUILD.md',
  'bots/purplewave/RELEASE.txt',
  'bots/purplewave/JNA-THIRD-PARTY-NOTICES.txt',
  'tools/package-purplewave.ts',
  'tools/package-archive.ts',
  'tools/release-package.ts',
  'tools/publication-archive.ts',
  'tools/validate.ts',
  'schemas/metadata.schema.json',
  'package.json',
  'pnpm-lock.yaml',
])

export function validateOutputDirectory(value: unknown) {
  if (typeof value !== 'string' || !outputName.test(value) || devices.test(value))
    throw new Error('Output directory must be a new safe directory name under .build')
  return value
}

export function parseBuildArguments(args: string[]) {
  if (args.length < 1 || args.length > 2)
    throw new Error('Usage: node tools/build-purplewave.ts <new-output-directory> [java-home]')
  return { outputDir: validateOutputDirectory(args[0]), javaHome: args[1] }
}

async function recipeProvenance(root: string) {
  const [revision, tracked, changed] = await Promise.all([
    runGit(['-C', root, 'rev-parse', 'HEAD']),
    runGit(['-C', root, 'ls-files', '--', ...recipePaths]),
    runGit(['-C', root, 'diff', '--name-only', 'HEAD', '--', ...recipePaths]),
  ])
  const paths = tracked ? tracked.split(/\r?\n/) : []
  if (paths.length !== recipePaths.length || recipePaths.some(file => !paths.includes(file)))
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

export function makeBuildInfo({
  recipeRevision,
  recipeSha256,
  toolchain,
  sources,
  files,
}: {
  recipeRevision: string
  recipeSha256: string
  toolchain: PurpleWaveBuildInfo['toolchain']
  sources: PreparedSource[]
  files: JavaFileRecord[]
}): PurpleWaveBuildInfo {
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
}: {
  root?: string
  outputDir: string
  javaHome?: string
  dependencyDirectory?: string
}) {
  const repository = await realpath(root)
  const buildRoot = path.join(repository, '.build')
  const output = path.join(buildRoot, validateOutputDirectory(outputDir))
  await safeDirectory(buildRoot, '.build', true)
  if (await stat(output)) throw new Error(`Build output already exists: ${output}`)

  const recipe = await recipeProvenance(repository)
  const sourceLock = await readSourceLock(repository)
  const sources = sourceIds.map(id => {
    const source = sourceLock.sources.find(candidate => candidate.id === id)
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
  const dependencies: { artifact: DependencyArtifact; file: string; bytes: Buffer }[] = []
  for (const artifact of dependencyLock.artifacts)
    dependencies.push(await cachedDependency(cache, artifact))

  const prepared: PreparedSource[] = []
  for (const source of sources) {
    const directory = path.join(output, 'sources', source.id)
    await prepareSource({
      rootDir: repository,
      sourceId: source.id,
      outputDir: relativeTo(repository, directory),
    })
    prepared.push(await verifyPreparedSource(source, directory))
  }

  const directories = new Map(prepared.map(item => [item.source.id, item.directory]))
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
      files(path.join(directories.get('jbwapi')!, 'src/main/java'), '.java'),
      files(path.join(directories.get('jbweb')!, 'src/main/java'), '.java'),
      files(path.join(directories.get('javajps')!, 'src/main/java'), '.java'),
      files(path.join(directories.get('mjson')!, 'src/java'), '.java'),
      files(path.join(directories.get('purplewave')!, 'src'), '.java'),
    ])
  ).flat()
  const [macroSources, scalaSources] = await Promise.all([
    files(path.join(directories.get('purplewave')!, 'src-macros'), '.scala'),
    files(path.join(directories.get('purplewave')!, 'src'), '.scala'),
  ])
  const [javaArgs, macroArgs, scalaArgs] = await Promise.all([
    argumentFile(path.join(compile, 'java.args'), javaSources),
    argumentFile(path.join(compile, 'macros.args'), macroSources),
    argumentFile(path.join(compile, 'scala.args'), scalaSources),
  ])

  if (!javaHome) throw new Error('PurpleWave requires an explicit javaHome or JAVA_HOME')
  const tools = await inspectJavaToolchain(path.resolve(javaHome))
  if (
    !/(?:^|\s)javac 21(?:[.\s]|$)/m.test(tools.javacVersion) ||
    !/^21(?:[.]|$)/.test(tools.javaProperties.javaVersion ?? '') ||
    tools.javaProperties.dataModel !== '64' ||
    !/^(?:amd64|x86_64)$/i.test(tools.javaProperties.osArchitecture ?? '') ||
    !tools.javaProperties.javaVendor ||
    !tools.javaProperties.javaVmName ||
    !tools.javaProperties.javaVmVersion
  ) {
    throw new Error('PurpleWave requires JDK 21 x64')
  }
  const allJars = dependencies.map(dependency => dependency.file)
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
  const runtime = dependencies.filter(dependency => dependency.artifact.runtime)
  const jar = path.join(bin, 'PurpleWave.jar')
  const entries: [string, Buffer][] = [
    [
      'META-INF/MANIFEST.MF',
      makeManifest(
        'Lifecycle.Main',
        runtime.map(({ artifact }) => artifact),
      ),
    ],
  ]
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
  for (const item of prepared)
    verified.push(await verifyPreparedSource(item.source, item.directory))
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
    sources: verified.map(item => ({ ...item, directory: relativeTo(output, item.directory) })),
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
    console.error(errorMessage(error))
    process.exitCode = 1
  }
  if (!process.exitCode)
    buildPurpleWave(options!)
      .then(({ output }) => console.log(`Built PurpleWave in ${output}`))
      .catch(error => {
        console.error(errorMessage(error))
        process.exitCode = 1
      })
}
