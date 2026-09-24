import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { runGit } from './fetch-sources.ts'
import type { Source } from './metadata.ts'
import { provenanceName } from './prepare-source.ts'

export type PreparedSource = { source: Source; directory: string; tree: string }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateProvenanceRecord({
  source,
  provenance,
  head,
  indexTree,
  unstaged,
  untracked,
}: {
  source: Source
  provenance: unknown
  head: string
  indexTree: string
  unstaged: string
  untracked: string
}) {
  if (
    !isRecord(provenance) ||
    provenance.schemaVersion !== 1 ||
    !provenance.source ||
    typeof provenance.tree !== 'string' ||
    !provenance.tree
  )
    throw new Error(`Missing source provenance for ${source.id}`)
  if (JSON.stringify(provenance.source) !== JSON.stringify(source))
    throw new Error(`Source provenance does not match source-lock.json for ${source.id}`)
  if (head !== source.revision) throw new Error(`Prepared ${source.id} HEAD does not match its pin`)
  if (indexTree !== provenance.tree)
    throw new Error(`Prepared ${source.id} index tree differs from provenance`)
  if (unstaged) throw new Error(`Prepared ${source.id} has unstaged changes`)
  if (untracked) throw new Error(`Prepared ${source.id} has untracked files`)
}

export async function verifyPreparedSource(
  source: Source,
  directory: string,
): Promise<PreparedSource> {
  const provenance: unknown = JSON.parse(
    await readFile(path.join(directory, provenanceName), 'utf8'),
  )
  const [head, indexTree, unstaged, untracked] = await Promise.all([
    runGit(['-C', directory, 'rev-parse', 'HEAD']),
    runGit(['-C', directory, 'write-tree']),
    runGit(['-C', directory, 'diff', '--name-only']),
    runGit(['-C', directory, 'ls-files', '--others', '--exclude-standard']),
  ])
  validateProvenanceRecord({ source, provenance, head, indexTree, unstaged, untracked })
  return { source, directory, tree: indexTree }
}
