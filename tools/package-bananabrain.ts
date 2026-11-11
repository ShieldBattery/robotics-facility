import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { bananabrainRecipePaths } from './build-bananabrain.ts'
import {
  bwapiSourcePrefixes,
  type NativePackageOptions,
  type NativePackageRecipe,
  packageNativeBot,
} from './native-package.ts'

// The pinned author submission contains configuration, mining data and pretraining.
const aiFiles = [
  'Configuration.txt',
  'OptimalMining_0a41f144c6134a2204f3d47d57cf2afcd8430841.txt',
  'OptimalMining_30f8396f0399403ddf60fc733ce99f393602575e.txt',
  'OptimalMining_4176c3dd9e8cd11d3da1323b4c17e059d06a8fed.txt',
  'OptimalMining_5e0bc3346c201ede3c92d6e970ffd4e8bab8b0cf.txt',
  'OptimalMining_630fc57ab58f4ac8a28d2b8dcd1cf524fd1566ec.txt',
  'OptimalMining_731138b5b844a4a0b4a4bb4e495969fd6659414c.txt',
  'OptimalMining_ad870839912421dc3b4fd736a954bf770693ba9a.txt',
  'OptimalMining_dbc596b6d00052f57e755b86bd3a8ff7db7a030a.txt',
  'OptimalMining_e72a0a853545b77b39229a8c11d5c5624c09242b.txt',
  'OptimalMining_ed37fce47d1312e39a3a379c122382790e190cbd.txt',
  'Results_McRaveZ.txt',
]

const recipe: NativePackageRecipe = {
  botId: 'bananabrain',
  executable: 'BananaBrain.exe',
  version: 'AIIDE2025',
  recipePaths: bananabrainRecipePaths,
  sources: {
    bwapi: { prefixes: bwapiSourcePrefixes, required: ['bwapi/BWAPIClient/Source/Client.cpp'] },
    bananabrain: {
      prefixes: ['src', 'AI', 'readme.txt'],
      excluded: ['src/.DS_Store', 'src/BWEM/.DS_Store', 'src/Source/.DS_Store'],
      required: ['readme.txt', 'src/Source/Dll.cpp', 'src/Source/License.txt', 'src/BWEM/LICENSE'],
    },
  },
  notices: [
    [
      'BananaBrain License',
      'notices/BananaBrain-License.txt',
      'source/bananabrain/src/Source/License.txt',
    ],
    ['MIT/X11 - BWEM', 'notices/BWEM-License.txt', 'source/bananabrain/src/BWEM/LICENSE'],
    ['LGPL-3.0 - BWAPI', 'notices/BWAPI-LGPL-3.0.txt', 'source/bwapi/LICENSE'],
    ['GPL-3.0 license text', 'notices/GPL-3.0.txt', 'native/GPL-3.0.txt'],
    ['MIT - ShieldBattery native host', 'notices/ShieldBattery-MIT.txt', 'native/LICENSE'],
    [
      'Attribution, modifications, and source',
      'notices/RELEASE.txt',
      'bots/bananabrain/RELEASE.txt',
    ],
    ['Scoped local-practice admission', 'notices/ADMISSION.txt', 'bots/bananabrain/ADMISSION.txt'],
  ],
  files: aiFiles.map(name => [`work/bwapi-data/AI/${name}`, `source/bananabrain/AI/${name}`]),
  modifications: [
    {
      modifier: 'ShieldBattery',
      date: '2026-10-26',
      scope: 'bot',
      summary:
        "AIIDE 2025 source built in the existing single-match Win32 native host with static MSVC runtime; storage patch bounds parsing, encodes filenames, prefers saved output, fixes configuration and uses atomic saves. Human-opponent mode selects the author's UCB1 opening policy and glhf/gg chat. Original AI text data included.",
    },
    {
      modifier: 'ShieldBattery',
      date: '2026-10-26',
      scope: 'dependency',
      summary: 'Source-built BWAPI 4.4 uses the existing isolated instance-discovery patch.',
    },
  ],
}

export function packageBananaBrain(options: NativePackageOptions) {
  return packageNativeBot(recipe, options)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [buildDirectory, releaseId, ...rest] = process.argv.slice(2)
  if (!buildDirectory || !releaseId || rest.length > 1 || (rest.length && rest[0] !== '--review'))
    throw new Error(
      'Usage: node tools/package-bananabrain.ts <build-directory> <bananabrain-sb-N> [--review]',
    )
  packageBananaBrain({ buildDirectory, releaseId, review: rest[0] === '--review' })
    .then(console.log)
    .catch(error => {
      console.error(error)
      process.exitCode = 1
    })
}
