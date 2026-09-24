import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Artifact, Candidate, Catalog, Package } from './metadata.ts'
import { type ArchiveEntry, makeArchive } from './package-archive.ts'
import { sha256, verifyArchive } from './publication-archive.ts'
import { validate } from './validate.ts'

/** Assemble and verify a local release before writing its immutable archive and catalog. */
export async function writeReleasePackage({
  root,
  candidate,
  pkg,
  entries,
  review,
}: {
  root: string
  candidate: Candidate
  pkg: Package
  entries: readonly ArchiveEntry[]
  review: boolean
}) {
  validate('package', pkg)
  if (pkg.botId !== candidate.bot.id) throw new Error('Package and candidate identities differ')
  const { releaseId } = pkg
  const manifest = Buffer.from(JSON.stringify(pkg, null, 2) + '\n')
  const contents: ArchiveEntry[] = [...entries, ['package.json', manifest]]
  const bytes = await makeArchive(contents)
  const file = `${releaseId}.zip`
  const artifact: Artifact = {
    url: `https://github.com/ShieldBattery/robotics-facility/releases/download/${releaseId}/${file}`,
    sha256: sha256(bytes),
    sizeBytes: bytes.length,
    manifestSha256: sha256(manifest),
    format: 'zip',
  }
  const release = { package: pkg, artifact }
  await verifyArchive(bytes, release)
  const catalog: Catalog = {
    schemaVersion: 1,
    revision: 0,
    bots: [{ bot: candidate.bot, releases: [release] }],
  }
  if (!review) validate('catalog', catalog)
  const destination = path.join(root, 'dist', review ? `${releaseId}-review` : releaseId)
  await mkdir(destination, { recursive: true })
  await writeFile(path.join(destination, file), bytes, { flag: 'wx' })
  await writeFile(path.join(destination, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n', {
    flag: 'wx',
  })
  return { destination, sha256: artifact.sha256, sizeBytes: bytes.length, entries: contents.length }
}
