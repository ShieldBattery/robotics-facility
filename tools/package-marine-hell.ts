import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { recipePaths } from './build-marine-hell.ts'
import { type JvmPackageOptions, type JvmPackageRecipe, packageJvmBot } from './jvm-package.ts'

const recipe: JvmPackageRecipe = {
  botId: 'marine-hell',
  jarName: 'MarineHell.jar',
  version: '2026.09.23',
  sourceIds: ['marine-hell', 'jbwapi'],
  dependencyNames: ['jna-5.18.1.jar', 'jna-platform-5.18.1.jar'],
  dependencyLockPath: 'jvm/dependencies.json',
  recipePaths,
  sources: {
    'marine-hell': {
      prefixes: ['src', 'LICENSE', 'readme.md'],
      required: ['src/TestBot1.java'],
      notices: [['MIT - Marine Hell', 'LICENSE']],
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
    ['Apache-2.0 license for JNA and JNA Platform', 'bots/marine-hell/APACHE-2.0-LICENSE.txt'],
    ['MIT - libffi bundled in JNA native support', 'bots/marine-hell/JNA-THIRD-PARTY-NOTICES.txt'],
    ['Marine Hell attribution, modifications, and source', 'bots/marine-hell/RELEASE.txt'],
  ],
  modifications: [
    {
      modifier: 'ShieldBattery',
      date: '2026-09-23',
      summary:
        'Ported Marine Hell from BWMirror to JBWAPI, removed game-speed and debug effects, added crash guards, and adapted bunker loading to native right-click while retaining the mass-Marine strategy.',
      scope: 'bot',
    },
    {
      modifier: 'ShieldBattery',
      date: '2026-09-23',
      summary:
        'Patched JBWAPI instance discovery, selected JNA 5.18.1, and isolated JVM temporary files in the per-instance working copy.',
      scope: 'dependency',
    },
  ],
}
export function packageMarineHell(options: JvmPackageOptions) {
  return packageJvmBot(recipe, options)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [buildDirectory, releaseId, ...rest] = process.argv.slice(2)
  if (!buildDirectory || !releaseId || rest.length > 1 || (rest.length && rest[0] !== '--review'))
    throw new Error(
      'Usage: node tools/package-marine-hell.ts <build-directory> <marine-hell-sb-N> [--review]',
    )
  packageMarineHell({ buildDirectory, releaseId, review: rest[0] === '--review' })
    .then(console.log)
    .catch(error => {
      console.error(error)
      process.exitCode = 1
    })
}
