import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { readSourceLock, runGit } from './fetch-sources.mjs'
import { prepareSource, provenanceName } from './prepare-source.mjs'

const outputNamePattern = /^[a-z0-9][a-z0-9-]*$/
const reservedWindowsDeviceNames = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/
const recipePaths = [
  'native/CMakeLists.txt',
  'native/host.cpp',
  'native/LICENSE',
  'source-lock.json',
]
const generator = 'Visual Studio 17 2022'

export function validateOutputName(name) {
  if (
    typeof name !== 'string' ||
    !outputNamePattern.test(name) ||
    reservedWindowsDeviceNames.test(name)
  ) {
    throw new Error('Output name must be a new safe directory name under .build')
  }
  return name
}

export function parseBuildArguments(args) {
  if (args.length !== 1) throw new Error('Usage: node tools/build-zzzkbot.mjs <new-output-name>')
  return validateOutputName(args[0])
}

export function validateProvenanceRecord({
  source,
  provenance,
  head,
  indexTree,
  unstaged,
  untracked,
}) {
  if (!provenance || provenance.schemaVersion !== 1 || !provenance.source || !provenance.tree) {
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

async function assertMissingDirectory(directory) {
  try {
    await lstat(directory)
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  throw new Error(`Build output already exists: ${directory}`)
}

async function sourceProvenance(source, directory) {
  const provenancePath = path.join(directory, provenanceName)
  let provenance
  try {
    provenance = JSON.parse(await readFile(provenancePath, 'utf8'))
  } catch (error) {
    throw new Error(`Could not read source provenance at ${provenancePath}: ${error.message}`, {
      cause: error,
    })
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

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.on('error', (error) =>
      reject(new Error(`Could not start ${command}: ${error.message}`, { cause: error })),
    )
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code}`))
    })
  })
}

async function commandOutput(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (data) => (stdout += data))
    child.stderr.on('data', (data) => (stderr += data))
    child.on('error', (error) =>
      reject(new Error(`Could not start ${command}: ${error.message}`, { cause: error })),
    )
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim())
      else
        reject(new Error(`${command} exited with code ${code}: ${stderr.trim() || stdout.trim()}`))
    })
  })
}

async function sha256(file) {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex')
}

async function recipeProvenance(root, recipePaths) {
  const [revision, tracked, changed] = await Promise.all([
    runGit(['-C', root, 'rev-parse', 'HEAD']),
    runGit(['-C', root, 'ls-files', '--', ...recipePaths]),
    runGit(['-C', root, 'diff', '--name-only', 'HEAD', '--', ...recipePaths]),
  ])
  const trackedPaths = tracked ? tracked.split(/\r?\n/) : []
  if (
    trackedPaths.length !== recipePaths.length ||
    recipePaths.some((file) => !trackedPaths.includes(file))
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

async function readToolchain(cmakeDirectory) {
  const fields = new Map()
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
    compiler: fields.get('compiler'),
    compilerId: fields.get('compilerId'),
    compilerVersion: fields.get('compilerVersion'),
    windowsSdkVersion: fields.get('windowsSdkVersion'),
  }
}

function relativeToRoot(root, target) {
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
}) {
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

export const ualbertaRecipePaths = Object.freeze([
  ...recipePaths,
  'native/ualbertabot.cmake',
  'native/ualberta-timer.hpp',
  'tools/build-zzzkbot.mjs',
  'tools/build-ualbertabot.mjs',
  'bots/ualbertabot/UAlbertaBot_Config.txt',
])

export function buildZzzkbot(options) {
  return buildNativeBot({ ...options, botId: 'zzzkbot' })
}

export async function buildNativeBot({ rootDir = process.cwd(), outputName, botId }) {
  if (!['zzzkbot', 'ualbertabot'].includes(botId)) throw new Error('Unsupported native bot')
  const sourceIds = ['bwapi', botId]
  const inputs = botId === 'ualbertabot' ? ualbertaRecipePaths : recipePaths
  const target = botId === 'ualbertabot' ? 'UAlbertaBot' : 'ZZZKBotClient'
  const sourceVariable = botId === 'ualbertabot' ? 'UALBERTABOT' : 'ZZZKBOT'

  const root = await realpath(rootDir)
  const name = validateOutputName(outputName)
  const output = path.join(root, '.build', name)
  await assertMissingDirectory(output)

  const recipe = await recipeProvenance(root, inputs)
  const lock = await readSourceLock(root)
  const selectedSources = sourceIds.map((id) => {
    const source = lock.sources.find((candidate) => candidate.id === id)
    if (!source) throw new Error(`source-lock.json is missing ${id}`)
    return source
  })

  const prepared = []
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
    throw new Error(`CMake did not produce ${executablePath}: ${error.message}`, { cause: error })
  }

  // CMake must not write into a source input. Re-read every invariant after compilation, not only
  // before it, so publication can trust the recorded index trees.
  const verified = []
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
    sources: verified.map((source) => ({
      ...source,
      directory: relativeToRoot(output, source.directory),
    })),
  })
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
    console.error(error.message)
    process.exitCode = 1
  }
  if (!process.exitCode) {
    buildZzzkbot({ outputName })
      .then(({ output }) => console.log(`Built ZZZKBotClient in ${output}`))
      .catch((error) => {
        console.error(error.message)
        process.exitCode = 1
      })
  }
}
