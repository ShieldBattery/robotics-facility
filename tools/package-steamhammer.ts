import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { steamhammerRecipePaths } from './build-steamhammer.ts'
import {
  bwapiSourcePrefixes,
  type NativePackageOptions,
  type NativePackageRecipe,
  packageNativeBot,
} from './native-package.ts'

const recipe: NativePackageRecipe = {
  botId: 'steamhammer',
  executable: 'Steamhammer.exe',
  version: '5.3.6',
  recipePaths: steamhammerRecipePaths,
  sources: {
    bwapi: { prefixes: bwapiSourcePrefixes, required: ['bwapi/BWAPIClient/Source/Client.cpp'] },
    steamhammer: {
      prefixes: [
        'Steamhammer/Source',
        'Steamhammer/VisualStudio',
        'RC/Source',
        'RC/RC.vcxproj',
        'licenses',
        'README.txt',
        'SOURCE-IMPORT.md',
      ],
      required: [
        'Steamhammer/Source/Dll.cpp',
        'Steamhammer/Source/TimerManager.h',
        'RC/Source/Logistic.cpp',
      ],
    },
  },
  notices: [
    [
      'MIT - Steamhammer',
      'notices/Steamhammer-MIT.txt',
      'source/steamhammer/licenses/Steamhammer.txt',
    ],
    ['MIT - UAlbertaBot', 'notices/UAlbertaBot-MIT.txt', 'source/steamhammer/licenses/License.md'],
    ['MIT - FAP', 'notices/FAP-MIT.txt', 'source/steamhammer/licenses/LICENSE'],
    [
      'MIT - RapidJSON',
      'notices/RapidJSON-MIT.txt',
      'source/steamhammer/licenses/RAPIDJSON-MIT.txt',
    ],
    [
      'BSD-3-Clause - msinttypes',
      'notices/MSINTTYPES-BSD-3-Clause.txt',
      'source/steamhammer/licenses/MSINTTYPES-BSD-3-Clause.txt',
    ],
    ['LGPL-3.0 - BWAPI', 'notices/BWAPI-LGPL-3.0.txt', 'source/bwapi/LICENSE'],
    ['GPL-3.0 license text', 'notices/GPL-3.0.txt', 'source/steamhammer/licenses/GPL-3.0.txt'],
    ['MIT - ShieldBattery host and timer', 'notices/ShieldBattery-MIT.txt', 'native/LICENSE'],
    [
      'Attribution, modifications, and source',
      'notices/RELEASE.txt',
      'bots/steamhammer/RELEASE.txt',
    ],
  ],
  files: [['work/bwapi-data/AI/Steamhammer_5.3.6.json', 'bots/steamhammer/Steamhammer_5.3.6.json']],
  modifications: [
    {
      modifier: 'ShieldBattery',
      date: '2026-09-23',
      scope: 'bot',
      summary:
        'Fixed quiet configuration retains upstream strategy choices and learning, isolates bounded saved state with encoded opponent names and atomic writes, and removes runtime configuration overrides.',
    },
    {
      modifier: 'ShieldBattery',
      date: '2026-09-23',
      scope: 'bot',
      summary:
        'Runs one match in an external Win32 host with the static MSVC runtime and an independently implemented monotonic timer.',
    },
    {
      modifier: 'ShieldBattery',
      date: '2026-09-23',
      scope: 'bot',
      summary:
        'Keeps refinery construction assigned while native orders arrive by exempting occupied geyser tiles from the generic walkability check.',
    },
    {
      modifier: 'ShieldBattery',
      date: '2026-09-23',
      scope: 'dependency',
      summary:
        'Uses separately source-built BWAPI 4.4 with isolated instance discovery; omits upstream binaries and the redundant BWAPILIB copy.',
    },
  ],
}
export function packageSteamhammer(options: NativePackageOptions) {
  return packageNativeBot(recipe, options)
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [buildDirectory, releaseId, ...rest] = process.argv.slice(2)
  if (!buildDirectory || !releaseId || rest.length > 1 || (rest.length && rest[0] !== '--review'))
    throw new Error(
      'Usage: node tools/package-steamhammer.ts <build-directory> <steamhammer-sb-N> [--review]',
    )
  packageSteamhammer({ buildDirectory, releaseId, review: rest[0] === '--review' })
    .then(console.log)
    .catch(error => {
      console.error(error)
      process.exitCode = 1
    })
}
