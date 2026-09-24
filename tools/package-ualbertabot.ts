import { execFileSync } from 'node:child_process'
import { writeReleasePackage } from './release-package.ts'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ualbertaRecipePaths } from './build-ualbertabot.ts'
import type { Candidate, Package, Source, SourceLock } from './metadata.ts'
import type { NativeBuildInfo } from './native-build.ts'
import { type ArchiveEntry, indexedFiles, recipeFiles } from './package-archive.ts'
import { sha256 } from './publication-archive.ts'

const git = (directory: string, ...args: string[]) =>
  execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim()
const json = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8')) as T
const excluded = [
  'BOSS/source/CImg/',
  'BOSS/source/deprecated/',
  'BOSS/source/StarCraftGUI.cpp',
  'BOSS/source/StarCraftGUI.h',
  'BOSS/source/Timer.hpp',
  'SparCraft/source/glext/',
  'SparCraft/source/glfont2/',
  'SparCraft/source/gui/',
  'SparCraft/source/main/',
  'SparCraft/source/Timer.cpp',
  'SparCraft/source/Timer.h',
  'SparCraft/source/TutorialCode.cpp',
  'UAlbertaBot/Source/research/',
  'UAlbertaBot/Source/StarDraftMap.hpp',
]
const omit = (name: string) => excluded.some(entry => name === entry || name.startsWith(entry))

async function addSources({
  build,
  entries,
  lock,
  root,
  sources,
}: {
  build: NativeBuildInfo & { directory: string }
  entries: ArchiveEntry[]
  lock: SourceLock
  root: string
  sources: Source[]
}) {
  for (const id of ['bwapi', 'ualbertabot']) {
    const source = lock.sources.find(entry => entry.id === id)
    const input = build.sources.find(entry => entry.id === id)
    if (!source || !input) throw new Error('Build is missing source provenance for ' + id)
    const directory = path.resolve(build.directory, input.directory)
    const provenance = await json<{ source: Source; tree: string }>(
      path.join(directory, '.git/robotics-source.json'),
    )
    if (
      JSON.stringify(provenance.source) !== JSON.stringify(source) ||
      provenance.tree !== input.tree ||
      git(directory, 'write-tree') !== input.tree
    )
      throw new Error('Build source provenance changed: ' + id)
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
        : ['BOSS/source', 'SparCraft/source', 'UAlbertaBot/Source', 'License.md']
    for (const [name, bytes] of await indexedFiles(directory, prefixes)) {
      if (id !== 'ualbertabot' || !omit(name)) entries.push(['source/' + id + '/' + name, bytes])
    }
    for (const patch of source.patches ?? []) {
      const bytes = await readFile(path.join(root, patch.path))
      if (sha256(bytes) !== patch.sha256)
        throw new Error('Source patch hash changed: ' + patch.path)
      entries.push(['source/' + patch.path, bytes])
    }
  }
}

export async function packageUalbertabot({
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
  const match = /^ualbertabot-sb-([1-9][0-9]*)$/.exec(releaseId)
  if (!match) throw new Error('Release ID must be ualbertabot-sb-N')
  const directory = path.resolve(root, buildDirectory)
  const info = await json<NativeBuildInfo>(path.join(directory, 'build-info.json'))
  const candidate = await json<Candidate>(path.join(root, 'bots/ualbertabot/bot.json'))
  if (
    !review &&
    (candidate.sourceReview.status !== 'approved' ||
      candidate.permissions.localDistribution.status !== 'approved')
  )
    throw new Error('Source and distribution review must be approved before packaging')
  const executable = await readFile(path.join(directory, info.executable))
  if (sha256(executable) !== info.executableSha256) throw new Error('Build executable changed')

  const entries: ArchiveEntry[] = [['bin/UAlbertaBot.exe', executable]]
  const sources: Source[] = []
  await addSources({
    build: { directory, ...info },
    entries,
    lock: await json<SourceLock>(path.join(root, 'source-lock.json')),
    root,
    sources,
  })
  entries.push(
    ...(await recipeFiles({
      root,
      revision: info.recipeRevision,
      sha256: info.recipeSha256,
      paths: ualbertaRecipePaths,
    })),
  )
  const notices: [name: string, noticePath: string, source: string][] = [
    ['LGPL-3.0 (BWAPI)', 'notices/BWAPI-LGPL-3.0.txt', 'source/bwapi/LICENSE'],
    ['GPL-3.0 license text', 'notices/GPL-3.0.txt', 'source/bwapi/bwapi/COPYING'],
    [
      'MIT (UAlbertaBot, BOSS, and SparCraft)',
      'notices/UAlbertaBot-MIT.txt',
      'bots/ualbertabot/UALBERTABOT-MIT.txt',
    ],
    ['MIT (RapidJSON)', 'notices/RapidJSON-MIT.txt', 'bots/ualbertabot/RAPIDJSON-MIT.txt'],
    [
      'BSD-3-Clause (msinttypes)',
      'notices/MSINTTYPES-BSD-3-Clause.txt',
      'bots/ualbertabot/MSINTTYPES-BSD-3-Clause.txt',
    ],
    [
      'BSD-3-Clause (smallsha1)',
      'notices/SMALLSHA1-LICENSE.txt',
      'bots/ualbertabot/SMALLSHA1-LICENSE.txt',
    ],
    ['MIT (ShieldBattery native recipe)', 'notices/ShieldBattery-MIT.txt', 'native/LICENSE'],
    [
      'Attribution, modifications, and source',
      'notices/RELEASE.txt',
      'bots/ualbertabot/RELEASE.txt',
    ],
  ]
  for (const [, target, source] of notices) {
    const bytes = source.startsWith('source/')
      ? entries.find(([name]) => name === source)?.[1]
      : await readFile(path.join(root, source))
    if (!bytes) throw new Error('Notice source is missing: ' + source)
    entries.push([target, bytes])
  }
  entries.push(['source/BUILD.md', await readFile(path.join(root, 'bots/ualbertabot/BUILD.md'))])
  entries.push(['source/build-info.json', Buffer.from(JSON.stringify(info, null, 2) + '\n')])
  entries.push([
    'work/UAlbertaBot_Config.txt',
    await readFile(path.join(root, 'bots/ualbertabot/UAlbertaBot_Config.txt')),
  ])
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
    botId: 'ualbertabot',
    releaseId,
    version: 'snapshot-558899d-sb.' + match[1],
    platform: { os: 'windows', architecture: 'x86' },
    runtime: { kind: 'native' },
    launch: { entrypoint: 'bin/UAlbertaBot.exe', arguments: [], workingDirectory: 'work' },
    profile: candidate.profile,
    bwapi: { version: '4.4.0', protocol: 10003, minimumBridgeVersion: '1' },
    sources,
    licenses: notices.map(([name, noticePath]) => ({ name, noticePath })),
    permissions: candidate.permissions,
    modifications: [
      {
        modifier: 'ShieldBattery',
        date: '2026-09-23',
        scope: 'bot',
        summary:
          'Fixed quiet Terran MarineRush configuration disables complete-map information, user input, debug output, result storage, and opponent-specific strategy overrides.',
      },
      {
        modifier: 'ShieldBattery',
        date: '2026-09-23',
        scope: 'bot',
        summary:
          'Chat configuration setters are disabled, the process exits after one completed match, and the replaced timer uses an independent std::chrono implementation.',
      },
      {
        modifier: 'ShieldBattery',
        date: '2026-09-23',
        scope: 'dependency',
        summary:
          'BWAPI selects the match discovery table through SB_BWAPI_INSTANCE and rejects malformed instance identifiers.',
      },
      {
        modifier: 'ShieldBattery',
        date: '2026-09-23',
        scope: 'bot',
        summary: 'The native Win32 recipe statically links the MSVC runtime.',
      },
    ],
    writableDirectories: ['work/bwapi-data/read', 'work/bwapi-data/write'],
    build: {
      recipeSource: {
        id: 'robotics-facility',
        repository: 'https://github.com/ShieldBattery/robotics-facility.git',
        revision: info.recipeRevision,
        patches: [],
      },
      recipePath: 'native/CMakeLists.txt',
      toolchain: JSON.stringify(info.toolchain),
    },
    sourceReview: review
      ? { status: 'pending', evidence: 'Review-only archive; publication is not approved.' }
      : candidate.sourceReview,
  }
  return writeReleasePackage({ root, candidate, pkg, entries, review })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [buildDirectory, releaseId, ...rest] = process.argv.slice(2)
  if (!buildDirectory || !releaseId || rest.length > 1 || (rest.length && rest[0] !== '--review'))
    throw new Error(
      'Usage: node tools/package-ualbertabot.ts <build-directory> ualbertabot-sb-N [--review]',
    )
  packageUalbertabot({ buildDirectory, releaseId, review: rest[0] === '--review' })
    .then(console.log)
    .catch(error => {
      console.error(error)
      process.exitCode = 1
    })
}
