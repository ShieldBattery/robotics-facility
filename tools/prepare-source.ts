import { createHash } from 'node:crypto'
import type { Stats } from 'node:fs'
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  assertSafeDirectory,
  inspectExistingDestination,
  readSourceLock,
  runGit,
} from './fetch-sources.ts'
import type { Source } from './metadata.ts'

export const provenanceName = '.git/robotics-source.json'

type Patch = NonNullable<Source['patches']>[number]

interface PreparedPatch extends Patch {
  bytes: Buffer
}

export interface SourceProvenance {
  schemaVersion: 1
  source: Source
  tree: string
}

export interface PrepareSourceOptions {
  rootDir?: string
  sourceId: string
  outputDir: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function exists(target: string): Promise<Stats | undefined> {
  try {
    return await lstat(target)
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined
    throw error
  }
}

async function directories(
  root: string,
  segments: readonly string[],
  create = false,
): Promise<string> {
  let current = root
  for (const part of segments) {
    current = path.join(current, part)
    if (!(await assertSafeDirectory(current, 'Source preparation directory'))) {
      if (!create) throw new Error(`Missing directory: ${current}`)
      await mkdir(current)
    }
  }
  return current
}

export async function readPatches(
  rootDir: string,
  source: Pick<Source, 'patches'>,
): Promise<PreparedPatch[]> {
  const patches: PreparedPatch[] = []
  for (const patch of source.patches ?? []) {
    const segments = patch.path.split('/')
    await directories(rootDir, segments.slice(0, -1))
    const file = path.join(rootDir, ...segments)
    const info = await lstat(file)
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error(`Patch must be a regular file: ${patch.path}`)
    }
    const bytes = await readFile(file)
    const actual = createHash('sha256').update(bytes).digest('hex')
    if (actual !== patch.sha256) throw new Error(`Patch hash mismatch: ${patch.path}`)
    patches.push({ ...patch, bytes })
  }
  return patches
}

export async function prepareSource(options: PrepareSourceOptions): Promise<SourceProvenance> {
  const rootDir = options.rootDir ?? process.cwd()
  const { sourceId, outputDir } = options
  const root = await realpath(rootDir)
  const lock = await readSourceLock(root)
  const source = lock.sources.find(candidate => candidate.id === sourceId)
  if (!source) throw new Error(`Unknown source: ${sourceId}`)
  if (typeof outputDir !== 'string' || !outputDir) throw new Error('Output directory is required')

  const output = path.resolve(root, outputDir)
  const relative = path.relative(path.join(root, '.build'), output)
  const segments = relative.split(path.sep)
  if (
    !relative ||
    path.isAbsolute(relative) ||
    segments.some(
      part => !/^[a-zA-Z0-9_-]+$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(part),
    )
  ) {
    throw new Error('Output must be a new named directory under .build, without links or traversal')
  }

  let ancestor = root
  for (const part of ['.build', ...segments.slice(0, -1)]) {
    ancestor = path.join(ancestor, part)
    await assertSafeDirectory(ancestor, 'Output ancestor')
  }
  if (await exists(output)) throw new Error(`Output already exists: ${output}`)

  await directories(root, ['.sources'])
  const pristine = path.join(root, '.sources', source.id)
  if (!(await inspectExistingDestination(pristine, source))) {
    throw new Error('Fetch the pinned source first')
  }
  const patches = await readPatches(root, source)
  await directories(root, ['.build', ...segments.slice(0, -1)], true)
  await mkdir(output)

  try {
    await runGit([
      'clone',
      '--config',
      'core.autocrlf=false',
      '--no-checkout',
      '--no-hardlinks',
      pristine,
      output,
    ])
    await runGit(['-C', output, 'remote', 'set-url', 'origin', source.repository])
    await runGit(['-C', output, 'checkout', '--detach', source.revision])
    if ((await runGit(['-C', output, 'rev-parse', 'HEAD'])) !== source.revision) {
      throw new Error('Base revision mismatch')
    }
    if (await exists(path.join(output, provenanceName))) {
      throw new Error('Source collides with provenance marker')
    }
    for (const patch of patches) {
      await runGit(['-C', output, 'apply', '--check', '--index', '-'], { input: patch.bytes })
      await runGit(['-C', output, 'apply', '--index', '-'], { input: patch.bytes })
    }
    const provenance: SourceProvenance = {
      schemaVersion: 1,
      source: { ...source, patches: source.patches ?? [] },
      tree: await runGit(['-C', output, 'write-tree']),
    }
    await writeFile(path.join(output, provenanceName), `${JSON.stringify(provenance, null, 2)}\n`, {
      flag: 'wx',
    })
    return provenance
  } catch (error) {
    throw new Error(
      `Preparation failed; output retained for inspection, not a usable build input: ${output}. ${errorMessage(error)}`,
      { cause: error },
    )
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (args.length !== 2) {
    console.error('Usage: node tools/prepare-source.ts <source-id> <new-output-under-.build>')
    process.exitCode = 1
  } else {
    prepareSource({ sourceId: args[0], outputDir: args[1] }).then(
      provenance => console.log(`Prepared ${provenance.source.id}: ${provenance.tree}`),
      (error: unknown) => {
        console.error(errorMessage(error))
        process.exitCode = 1
      },
    )
  }
}
