import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  argumentFile,
  type DependencyArtifact,
  files,
  inspectJavaToolchain,
  type JavaFileRecord,
  type JavaProperties,
  loadJvmDependencies,
  prepareJvmSources,
  recordJvmRecipe,
  relativeTo,
  run,
  safeDirectory,
  stat,
  validateDependencyLock,
  writeJvmJar,
} from './jvm-build.ts'
import type { Source } from './metadata.ts'
import { verifyPreparedSource } from './source-provenance.ts'

export interface InfestedArtosisBuildInfo {
  schemaVersion: 1
  recipeRevision: string
  recipeSha256: string
  recipeInputs: JavaFileRecord[]
  recipeDirty: boolean
  toolchain: { javacVersion: string; java: JavaProperties; targetRelease: 8 }
  sources: { id: string; directory: string; tree: string; source: Source }[]
  dependencies: DependencyArtifact[]
  files: JavaFileRecord[]
}

export const sourceIds = ['infested-artosis', 'ass', 'jbwapi'] as const
export const dependencyNames = [
  'jna-5.18.1.jar',
  'jna-platform-5.18.1.jar',
  'annotations-26.1.0.jar',
  'lombok-1.18.48.jar',
] as const
export const runtimeDependencyNames = ['jna-5.18.1.jar', 'jna-platform-5.18.1.jar'] as const
export const dependencyLockPath = 'jvm/infested-artosis-dependencies.json'
export const recipePaths = [
  'source-lock.json',
  dependencyLockPath,
  'patches/infested-artosis/0001-isolate-runtime.patch',
  'patches/jbwapi/instance-discovery.patch',
  'patches/jbwapi/0002-single-match-lifecycle.patch',
  'tools/build-infested-artosis.ts',
  'tools/jvm-build.ts',
  'tools/source-provenance.ts',
  'tools/prepare-source.ts',
  'tools/fetch-sources.ts',
  'tools/package-infested-artosis.ts',
  'tools/jvm-package.ts',
  'tools/package-archive.ts',
  'tools/release-package.ts',
  'tools/publication-archive.ts',
  'tools/validate.ts',
  'schemas/metadata.schema.json',
  'bots/infested-artosis/BUILD.md',
  'bots/infested-artosis/rebuild.ps1',
  'bots/infested-artosis/RELEASE.txt',
  'bots/infested-artosis/JNA-THIRD-PARTY-NOTICES.txt',
  'bots/infested-artosis/LOMBOK-LICENSE.txt',
  'bots/infested-artosis/APACHE-2.0-LICENSE.txt',
  'bots/infested-artosis/ANNOTATIONS-NOTICE.txt',
  'package.json',
  'pnpm-lock.yaml',
] as const

const assSourcePaths = [
  'org/bk/ass/sim/Agent.java',
  'org/bk/ass/sim/AgentUtil.java',
  'org/bk/ass/sim/AttackerBehavior.java',
  'org/bk/ass/sim/BWMirrorAgentFactory.java',
  'org/bk/ass/sim/DamageType.java',
  'org/bk/ass/sim/Evaluator.java',
  'org/bk/ass/sim/HealerBehavior.java',
  'org/bk/ass/sim/RepairerBehavior.java',
  'org/bk/ass/sim/RetreatBehavior.java',
  'org/bk/ass/sim/Simulator.java',
  'org/bk/ass/sim/SplashType.java',
  'org/bk/ass/sim/SuiciderBehavior.java',
  'org/bk/ass/sim/UnitSize.java',
  'org/bk/ass/sim/Weapon.java',
  'org/bk/ass/info/BWMirrorUnitInfo.java',
  'org/bk/ass/collection/UnorderedCollection.java',
  'org/bk/ass/collection/FastArrayFill.java',
  'org/bk/ass/PositionOutOfBoundsException.java',
] as const

const outputName = /^[a-z0-9][a-z0-9-]*$/
const devices = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

export function validateOutputName(value: unknown): string {
  if (typeof value !== 'string' || !outputName.test(value) || devices.test(value))
    throw new Error('Output must be a new safe directory name under .build')
  return value
}

export function validateInfestedDependencySet(value: unknown): DependencyArtifact[] {
  const artifacts = validateDependencyLock(value, dependencyLockPath).artifacts
  if (
    artifacts.length !== dependencyNames.length ||
    artifacts.some((artifact, index) => artifact.name !== dependencyNames[index]) ||
    artifacts.some(
      artifact =>
        artifact.runtime !==
        runtimeDependencyNames.includes(artifact.name as (typeof runtimeDependencyNames)[number]),
    )
  )
    throw new Error('Infested Artosis dependency lock has unexpected artifacts or runtime roles')
  return artifacts
}

export function selectAssSources(root: string, availableFiles: readonly string[]): string[] {
  const available = new Map(availableFiles.map(file => [relativeTo(root, file), file]))
  return assSourcePaths.map(name => {
    const file = available.get(name)
    if (!file) throw new Error('Required ASS source is missing: ' + name)
    return file
  })
}

export async function buildInfestedArtosis({
  root = process.cwd(),
  outputDir,
  javaHome = process.env.JAVA_HOME,
}: {
  root?: string
  outputDir: string
  javaHome?: string
}) {
  const repository = await realpath(root)
  const buildRoot = path.join(repository, '.build')
  await safeDirectory(buildRoot, '.build', true)
  const output = path.join(buildRoot, validateOutputName(outputDir))
  if (await stat(output)) throw new Error('Build output already exists: ' + output)

  const recipe = await recordJvmRecipe(repository, recipePaths)
  validateInfestedDependencySet(
    JSON.parse(await readFile(path.join(repository, dependencyLockPath), 'utf8')),
  )
  const dependencies = await loadJvmDependencies(repository, dependencyLockPath, dependencyNames)
  if (!javaHome) throw new Error('Infested Artosis requires an explicit javaHome or JAVA_HOME')
  const jdk = await inspectJavaToolchain(path.resolve(javaHome))
  if (
    !/(?:^|\s)javac 21(?:[.\s]|$)/m.test(jdk.javacVersion) ||
    !/^21(?:[.]|$)/.test(jdk.javaProperties.javaVersion ?? '') ||
    jdk.javaProperties.dataModel !== '64' ||
    !/^(?:amd64|x86_64)$/i.test(jdk.javaProperties.osArchitecture ?? '') ||
    !jdk.javaProperties.javaVendor ||
    !jdk.javaProperties.javaVmName ||
    !jdk.javaProperties.javaVmVersion
  )
    throw new Error('Infested Artosis requires JDK 21 x64')

  const prepared = await prepareJvmSources(repository, output, sourceIds)
  const dirs = new Map(prepared.map(item => [item.source.id, item.directory]))
  const classes = path.join(output, 'classes')
  const compile = path.join(output, 'compile')
  await mkdir(classes, { recursive: true })
  await mkdir(compile, { recursive: true })
  const javaSources = [
    ...(await files(path.join(dirs.get('infested-artosis')!, 'src/main/java'), '.java')),
    ...selectAssSources(
      path.join(dirs.get('ass')!, 'src/main/java'),
      await files(path.join(dirs.get('ass')!, 'src/main/java'), '.java'),
    ),
    ...(await files(path.join(dirs.get('jbwapi')!, 'src/main/java'), '.java')),
  ]
  const sourceArgs = await argumentFile(path.join(compile, 'sources.args'), javaSources)
  const lombok = dependencies.find(item => item.artifact.name === 'lombok-1.18.48.jar')!
  await run(jdk.javac, [
    '-encoding',
    'UTF-8',
    '-source',
    '8',
    '-target',
    '8',
    '-Xmaxerrs',
    '200',
    '-cp',
    dependencies.map(item => item.file).join(path.delimiter),
    '-processorpath',
    lombok.file,
    '-processor',
    'lombok.launch.AnnotationProcessorHider$AnnotationProcessor',
    '-d',
    classes,
    sourceArgs,
  ])

  const built = await writeJvmJar({
    output,
    classes: [classes],
    jarName: 'InfestedArtosis.jar',
    mainClass: 'Bot',
    runtime: dependencies.filter(item => item.artifact.runtime),
  })
  const verified: InfestedArtosisBuildInfo['sources'] = []
  for (const item of prepared)
    verified.push({
      ...(await verifyPreparedSource(item.source, item.directory)),
      id: item.source.id,
      directory: relativeTo(output, item.directory),
    })
  const after = await recordJvmRecipe(repository, recipePaths)
  if (after.sha256 !== recipe.sha256 || after.revision !== recipe.revision)
    throw new Error('Infested Artosis recipe inputs changed during compilation')
  const buildInfo: InfestedArtosisBuildInfo = {
    schemaVersion: 1,
    recipeRevision: recipe.revision,
    recipeSha256: recipe.sha256,
    recipeInputs: recipe.inputs,
    recipeDirty: recipe.dirty || after.dirty,
    toolchain: { javacVersion: jdk.javacVersion, java: jdk.javaProperties, targetRelease: 8 },
    sources: verified,
    dependencies: dependencies.map(item => item.artifact),
    files: built,
  }
  await writeFile(path.join(output, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n', {
    flag: 'wx',
  })
  return { output, buildInfo }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [outputDir, javaHome, ...rest] = process.argv.slice(2)
  if (!outputDir || rest.length) {
    console.error('Usage: node tools/build-infested-artosis.ts <new-output-directory> [java-home]')
    process.exitCode = 1
  } else {
    buildInfestedArtosis({ outputDir, javaHome })
      .then(({ output }) => console.log('Built Infested Artosis in ' + output))
      .catch(error => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      })
  }
}
