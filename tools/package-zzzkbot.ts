import { execFileSync } from 'node:child_process'
import { writeReleasePackage } from './release-package.ts'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { zzzkbotRecipePaths } from './build-zzzkbot.ts'
import type { Candidate, Package, Source, SourceLock } from './metadata.ts'
import type { NativeBuildInfo } from './native-build.ts'
import { type ArchiveEntry, indexedFiles, recipeFiles } from './package-archive.ts'
import { sha256 } from './publication-archive.ts'

const git = (directory: string, ...args: string[]) =>
  execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim()
const json = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8')) as T

export async function packageBot({
  root = process.cwd(),
  buildDirectory,
  releaseId,
  review = false,
}: {
  root?: string
  buildDirectory: string
  releaseId: string
  review?: boolean
}) {
  if (!/^[a-z][a-z0-9-]*$/.test(releaseId)) throw new Error('Invalid release ID')
  const build = path.resolve(root, buildDirectory)
  const info = await json<NativeBuildInfo>(path.join(build, 'build-info.json'))
  const candidate = await json<Candidate>(path.join(root, 'bots/zzzkbot/bot.json'))
  if (
    !review &&
    (candidate.sourceReview.status !== 'approved' ||
      candidate.permissions.localDistribution.status !== 'approved')
  )
    throw new Error('Source and distribution review must be approved before packaging')
  const lock = await json<SourceLock>(path.join(root, 'source-lock.json'))
  const executable = await readFile(path.join(build, info.executable))
  if (sha256(executable) !== info.executableSha256) throw new Error('Build executable changed')
  const entries: ArchiveEntry[] = [['bin/ZZZKBotClient.exe', executable]]
  const sources: Source[] = []
  for (const id of ['bwapi', 'zzzkbot']) {
    const source = lock.sources.find(s => s.id === id)!
    const input = info.sources.find(s => s.id === id)!
    const directory = path.resolve(build, input.directory)
    const provenance = await json<{ source: Source; tree: string }>(
      path.join(directory, '.git/robotics-source.json'),
    )
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
  entries.push(
    ...(await recipeFiles({
      root,
      revision: recipeRevision,
      sha256: info.recipeSha256,
      paths: zzzkbotRecipePaths,
    })),
  )
  const notices: [name: string, noticePath: string, file: string][] = [
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
  const pkg: Package = {
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
  return writeReleasePackage({ root, candidate, pkg, entries, review })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [buildDirectory, releaseId, ...rest] = process.argv.slice(2)
  if (!buildDirectory || !releaseId || rest.length > 1 || (rest.length && rest[0] !== '--review'))
    throw new Error(
      'Usage: node tools/package-zzzkbot.ts <build-directory> <release-id> [--review]',
    )
  packageBot({ buildDirectory, releaseId, review: rest[0] === '--review' })
    .then(console.log)
    .catch(error => {
      console.error(error)
      process.exitCode = 1
    })
}
