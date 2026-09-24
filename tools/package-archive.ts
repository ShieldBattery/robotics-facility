import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import yauzl from 'yauzl'
import yazl from 'yazl'
import { archivePath } from './publication-archive.ts'

export type ArchiveEntry = [name: string, bytes: Buffer]
const git = (directory: string, ...args: string[]) =>
  execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim()

export async function makeArchive(entries: Iterable<ArchiveEntry>): Promise<Buffer> {
  const zip = new yazl.ZipFile()
  const chunks: Buffer[] = []
  const complete = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk))
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)))
    zip.outputStream.on('error', reject)
  })
  const seen = new Set()
  for (const [name, bytes] of [...entries].sort(([a], [b]) => {
    if (a < b) return -1
    if (a > b) return 1
    return 0
  })) {
    const normalized = archivePath(name)
    if (seen.has(normalized)) throw new Error(`Duplicate archive entry: ${name}`)
    seen.add(normalized)
    const options = { mtime: new Date('2026-01-01T00:00:00Z'), forceDosTimestamp: true }
    if (name.endsWith('/')) zip.addEmptyDirectory(name, { ...options, mode: 0o40755 })
    else zip.addBuffer(bytes, name, { ...options, mode: 0o100644 })
  }
  zip.end()
  return complete
}

export async function indexedFiles(
  directory: string,
  prefixes: readonly string[],
): Promise<ArchiveEntry[]> {
  if (git(directory, 'diff', '--name-only')) throw new Error('Prepared source has unstaged changes')
  if (git(directory, 'ls-files', '--others', '--exclude-standard'))
    throw new Error('Prepared source has untracked files')
  const files = git(directory, 'ls-files', '-z').split('\0').filter(Boolean)
  const entries: ArchiveEntry[] = []
  for (const name of files) {
    if (!prefixes.some(prefix => name === prefix || name.startsWith(`${prefix}/`))) continue
    const file = path.join(directory, name)
    const stat = await lstat(file)
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error(`Not a regular source file: ${name}`)
    entries.push([name, await readFile(file)])
  }
  if (!entries.length) throw new Error('Source inventory is empty')
  return entries
}

// Runtime jars are hash-verified before this reader extracts their original legal notices.
export function jarNotices(bytes: Buffer): Promise<ArchiveEntry[]> {
  return new Promise<ArchiveEntry[]>((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error)
      const notices: ArchiveEntry[] = []
      zip.on('error', reject)
      zip.on('end', () => resolve(notices))
      zip.on('entry', entry => {
        if (!/^(META-INF\/)?(LICENSE|NOTICE)(\.txt)?$/i.test(entry.fileName)) {
          zip.readEntry()
          return
        }
        if (entry.uncompressedSize > 1024 * 1024) {
          zip.close()
          reject(new Error('Oversized dependency notice'))
          return
        }
        zip.openReadStream(entry, (err, stream) => {
          if (err) {
            zip.close()
            reject(err)
            return
          }
          const chunks: Buffer[] = []
          stream.on('error', reject)
          stream.on('data', (chunk: Buffer) => chunks.push(chunk))
          stream.on('end', () => {
            notices.push([entry.fileName.replaceAll('/', '-'), Buffer.concat(chunks)])
            zip.readEntry()
          })
        })
      })
      zip.readEntry()
    })
  })
}

/** Verify the committed recipe and exact bytes recorded by a build before archiving them. */
export async function recipeFiles({
  root,
  revision,
  sha256,
  paths,
}: {
  root: string
  revision: string
  sha256: string
  paths: readonly string[]
}): Promise<ArchiveEntry[]> {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid recipe revision')
  const hash = createHash('sha256')
  const entries: ArchiveEntry[] = []
  for (const name of paths) {
    const expected = execFileSync('git', ['-C', root, 'show', `${revision}:${name}`])
    const actual = await readFile(path.join(root, name))
    if (
      expected.toString('utf8').replaceAll('\r\n', '\n') !==
      actual.toString('utf8').replaceAll('\r\n', '\n')
    )
      throw new Error(`Recipe changed: ${name}`)
    hash.update(name).update('\0').update(actual).update('\0')
    entries.push([`source/${name}`, actual])
  }
  if (hash.digest('hex') !== sha256) throw new Error('Recipe bytes changed since build')
  return entries
}
