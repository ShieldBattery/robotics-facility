import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ualbertaRecipePaths } from './build-ualbertabot.ts'
import {
  bwapiSourcePrefixes,
  type NativePackageOptions,
  type NativePackageRecipe,
  packageNativeBot,
} from './native-package.ts'

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

const notices: NativePackageRecipe['notices'] = [
  ['LGPL-3.0 (BWAPI)', 'notices/BWAPI-LGPL-3.0.txt', 'source/bwapi/LICENSE'],
  ['GPL-3.0 license text', 'notices/GPL-3.0.txt', 'native/GPL-3.0.txt'],
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
  ['Attribution, modifications, and source', 'notices/RELEASE.txt', 'bots/ualbertabot/RELEASE.txt'],
]

const recipe: NativePackageRecipe = {
  botId: 'ualbertabot',
  executable: 'UAlbertaBot.exe',
  version: 'snapshot-558899d',
  recipePaths: ualbertaRecipePaths,
  sources: {
    bwapi: { prefixes: bwapiSourcePrefixes, required: ['bwapi/BWAPIClient/Source/Client.cpp'] },
    ualbertabot: {
      prefixes: ['BOSS/source', 'SparCraft/source', 'UAlbertaBot/Source', 'License.md'],
      excluded,
      required: ['UAlbertaBot/Source/main.cpp'],
    },
  },
  notices,
  files: [['work/UAlbertaBot_Config.txt', 'bots/ualbertabot/UAlbertaBot_Config.txt']],
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
}
export function packageUalbertabot(options: NativePackageOptions) {
  return packageNativeBot(recipe, options)
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
