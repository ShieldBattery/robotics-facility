import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  dependencyLockPath,
  dependencyNames,
  recipePaths,
  sourceIds,
} from './build-infested-artosis.ts'
import { type JvmPackageOptions, type JvmPackageRecipe, packageJvmBot } from './jvm-package.ts'

const recipe: JvmPackageRecipe = {
  botId: 'infested-artosis',
  jarName: 'InfestedArtosis.jar',
  version: '2026.09.23',
  sourceIds,
  dependencyNames,
  dependencyLockPath,
  recipePaths,
  sources: {
    'infested-artosis': {
      prefixes: ['src', 'LICENSE', 'README.md', 'pom.xml'],
      required: ['src/main/java/Bot.java'],
      notices: [['MIT - Infested Artosis', 'LICENSE']],
    },
    ass: {
      prefixes: ['src/main/java', 'LICENSE', 'README.md', 'build.gradle.kts'],
      required: ['src/main/java/org/bk/ass/sim/Simulator.java'],
      notices: [['MIT - Agent Starcraft Simulator', 'LICENSE']],
    },
    jbwapi: {
      prefixes: ['src/main/java', 'LICENSE', 'README.md', 'pom.xml'],
      required: ['src/main/java/bwapi/BWClient.java'],
      notices: [
        ['MIT - JBWAPI', 'LICENSE'],
        ['MIT/X11 - Java BWEM', 'src/main/java/bwem/LICENSE.txt'],
      ],
    },
  },
  extraNotices: [
    [
      'Apache-2.0 license for JNA and JetBrains annotations',
      'bots/infested-artosis/APACHE-2.0-LICENSE.txt',
    ],
    [
      'MIT - libffi bundled in JNA native support',
      'bots/infested-artosis/JNA-THIRD-PARTY-NOTICES.txt',
    ],
    [
      'Infested Artosis attribution, modifications, and source',
      'bots/infested-artosis/RELEASE.txt',
    ],
  ],
  dependencyNotices: { 'annotations-26.1.0.jar': 'bots/infested-artosis/ANNOTATIONS-NOTICE.txt' },
  modifications: [
    {
      modifier: 'ShieldBattery',
      date: '2026-09-23',
      scope: 'bot',
      summary:
        'Fixed a quiet runtime profile, removed environment configuration loading, and adapted bounded opponent history for isolated persistent working copies with malformed-state handling.',
    },
    {
      modifier: 'ShieldBattery',
      date: '2026-09-23',
      scope: 'dependency',
      summary:
        'Used source-built JBWAPI with isolated instance discovery, bounded single-match connection lifecycle, and corrected unit cache growth. Compiled a selected ASS simulator subset and used pinned JNA 5.18.1.',
    },
  ],
}
export function packageInfestedArtosis(options: JvmPackageOptions) {
  return packageJvmBot(recipe, options)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [buildDirectory, releaseId, ...rest] = process.argv.slice(2)
  if (!buildDirectory || !releaseId || rest.length > 1 || (rest.length && rest[0] !== '--review'))
    throw new Error(
      'Usage: node tools/package-infested-artosis.ts <build-directory> <infested-artosis-sb-N> [--review]',
    )
  packageInfestedArtosis({ buildDirectory, releaseId, review: rest[0] === '--review' })
    .then(console.log)
    .catch(error => {
      console.error(error)
      process.exitCode = 1
    })
}
