import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import yazl from 'yazl'
import { archivePath, sha256, verifyArchive } from './publication-archive.mjs'
import { validate } from './validate.mjs'

const git = (directory, ...args) =>
  execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim()
const json = async (file) => JSON.parse(await readFile(file, 'utf8'))

export async function makeArchive(entries) {
  const zip = new yazl.ZipFile()
  const chunks = []
  const complete = new Promise((resolve, reject) => {
    zip.outputStream.on('data', (chunk) => chunks.push(chunk))
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)))
    zip.outputStream.on('error', reject)
  })
  const seen = new Set()
  for (const [name, bytes] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
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

export async function indexedFiles(directory, prefixes) {
  if (git(directory, 'diff', '--name-only')) throw new Error('Prepared source has unstaged changes')
  if (git(directory, 'ls-files', '--others', '--exclude-standard'))
    throw new Error('Prepared source has untracked files')
  const files = git(directory, 'ls-files', '-z').split('\0').filter(Boolean)
  const entries = []
  for (const name of files) {
    if (!prefixes.some((prefix) => name === prefix || name.startsWith(`${prefix}/`))) continue
    const file = path.join(directory, name)
    const stat = await lstat(file)
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error(`Not a regular source file: ${name}`)
    entries.push([name, await readFile(file)])
  }
  if (!entries.length) throw new Error('Source inventory is empty')
  return entries
}

export async function packageBot({
  root = process.cwd(),
  buildDirectory,
  releaseId,
  review = false,
}) {
  if (!/^[a-z][a-z0-9-]*$/.test(releaseId)) throw new Error('Invalid release ID')
  const build = path.resolve(root, buildDirectory)
  const info = await json(path.join(build, 'build-info.json'))
  const candidate = await json(path.join(root, 'bots/zzzkbot/bot.json'))
  if (
    !review &&
    (candidate.sourceReview.status !== 'approved' ||
      candidate.permissions.localDistribution.status !== 'approved')
  )
    throw new Error('Source and distribution review must be approved before packaging')
  const lock = await json(path.join(root, 'source-lock.json'))
  const executable = await readFile(path.join(build, info.executable))
  if (sha256(executable) !== info.executableSha256) throw new Error('Build executable changed')
  const entries = [['bin/ZZZKBotClient.exe', executable]]
  const sources = []
  for (const id of ['bwapi', 'zzzkbot']) {
    const source = lock.sources.find((s) => s.id === id)
    const input = info.sources.find((s) => s.id === id)
    const directory = path.resolve(build, input.directory)
    const provenance = await json(path.join(directory, '.git/robotics-source.json'))
    if (
      JSON.stringify(provenance.source) !== JSON.stringify(source) ||
      provenance.tree !== input.tree ||
      git(directory, 'write-tree') !== input.tree
    )
      throw new Error(`Build source provenance changed: ${id}`)
    sources.push(source)
    const prefixes =
      id === 'bwapi'
        ? [
            'bwapi/include',
            'bwapi/BWAPILIB',
            'bwapi/BWAPIClient/Source',
            'bwapi/Shared',
            'bwapi/Util/Source',
            'bwapi/Storm',
            'LICENSE',
            'LICENSE.md',
            'bwapi/COPYING',
          ]
        : [
            'ZZZKBot/Source',
            'ZZZKBot/Configs',
            'LICENSE.txt',
            'COPYING.txt',
            'COPYING.LESSER.txt',
            'AUTHORS.md',
            'THANKS.md',
          ]
    for (const [name, bytes] of await indexedFiles(directory, prefixes))
      entries.push([`source/${id}/${name}`, bytes])
    for (const patch of source.patches ?? []) {
      const bytes = await readFile(path.join(root, patch.path))
      if (sha256(bytes) !== patch.sha256) throw new Error('Source patch hash changed')
      entries.push([`source/${patch.path}`, bytes])
    }
  }
  const recipeRevision = info.recipeRevision
  if (!/^[a-f0-9]{40}$/.test(recipeRevision)) throw new Error('Invalid recipe revision')
  const recipeHash = createHash('sha256')
  for (const name of [
    'native/CMakeLists.txt',
    'native/host.cpp',
    'native/LICENSE',
    'source-lock.json',
  ]) {
    const bytes = execFileSync('git', ['-C', root, 'show', `${recipeRevision}:${name}`])
    const actual = await readFile(path.join(root, name))
    if (
      bytes.toString('utf8').replaceAll('\r\n', '\n') !==
      actual.toString('utf8').replaceAll('\r\n', '\n')
    )
      throw new Error(`Recipe changed: ${name}`)
    recipeHash.update(name).update('\0').update(actual).update('\0')
    entries.push([`source/${name}`, actual])
  }
  if (recipeHash.digest('hex') !== info.recipeSha256)
    throw new Error('Recipe bytes changed since build')
  const notices = [
    ['LGPL-3.0-or-later (ZZZKBot)', 'notices/ZZZKBot-LICENSE.txt', '.sources/zzzkbot/LICENSE.txt'],
    ['GPL-3.0 license text', 'notices/GPL-3.0.txt', '.sources/zzzkbot/COPYING.txt'],
    ['LGPL-3.0 license text', 'notices/LGPL-3.0.txt', '.sources/zzzkbot/COPYING.LESSER.txt'],
    ['LGPL-3.0 (BWAPI)', 'notices/BWAPI-LICENSE.txt', '.sources/bwapi/LICENSE'],
    [
      'BSD-3-Clause (smallsha1)',
      'notices/SMALLSHA1-LICENSE.txt',
      'bots/zzzkbot/SMALLSHA1-LICENSE.txt',
    ],
    ['MIT (ShieldBattery host)', 'notices/ShieldBattery-MIT.txt', 'native/LICENSE'],
    ['Attribution, modifications, and source', 'notices/RELEASE.txt', 'bots/zzzkbot/RELEASE.txt'],
  ]
  for (const [, target, file] of notices)
    entries.push([target, await readFile(path.join(root, file))])
  entries.push(['source/BUILD.md', await readFile(path.join(root, 'bots/zzzkbot/BUILD.md'))])
  entries.push(['source/build-info.json', Buffer.from(JSON.stringify(info, null, 2) + '\n')])
  for (const dir of [
    'work/',
    'work/bwapi-data/',
    'work/bwapi-data/AI/',
    'work/bwapi-data/read/',
    'work/bwapi-data/write/',
  ])
    entries.push([dir, Buffer.alloc(0)])
  const pkg = {
    schemaVersion: 1,
    botId: 'zzzkbot',
    releaseId,
    version: '1.9.1.0.0-sb.1',
    platform: { os: 'windows', architecture: 'x86' },
    runtime: { kind: 'native' },
    launch: { entrypoint: 'bin/ZZZKBotClient.exe', arguments: [], workingDirectory: 'work' },
    profile: candidate.profile,
    bwapi: { version: '4.4.0', protocol: 10003, minimumBridgeVersion: '1' },
    sources,
    licenses: notices.map(([name, noticePath]) => ({ name, noticePath })),
    permissions: candidate.permissions,
    sourceReview: review
      ? { status: 'pending', evidence: 'Review-only archive; publication is not approved.' }
      : candidate.sourceReview,
    writableDirectories: ['work/bwapi-data/read', 'work/bwapi-data/write'],
    build: {
      recipeSource: {
        id: 'robotics-facility',
        repository: 'https://github.com/ShieldBattery/robotics-facility.git',
        revision: recipeRevision,
        patches: [],
      },
      recipePath: 'native/CMakeLists.txt',
      toolchain: JSON.stringify(info.toolchain),
    },
  }
  validate('package', pkg)
  const manifest = Buffer.from(JSON.stringify(pkg, null, 2) + '\n')
  entries.push(['package.json', manifest])
  const bytes = await makeArchive(entries)
  const file = `${releaseId}.zip`
  const release = {
    package: pkg,
    artifact: {
      url: `https://github.com/ShieldBattery/robotics-facility/releases/download/${releaseId}/${file}`,
      sha256: sha256(bytes),
      sizeBytes: bytes.length,
      manifestSha256: sha256(manifest),
      format: 'zip',
    },
  }
  await verifyArchive(bytes, release)
  const catalog = {
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
  return {
    destination,
    sha256: release.artifact.sha256,
    sizeBytes: bytes.length,
    entries: entries.length,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [buildDirectory, releaseId, ...rest] = process.argv.slice(2)
  if (!buildDirectory || !releaseId || rest.length > 1 || (rest.length && rest[0] !== '--review'))
    throw new Error(
      'Usage: node tools/package-zzzkbot.mjs <build-directory> <release-id> [--review]',
    )
  packageBot({ buildDirectory, releaseId, review: rest[0] === '--review' })
    .then(console.log)
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
