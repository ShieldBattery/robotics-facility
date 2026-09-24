import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildNativeBot, nativeRecipePaths, validateOutputName } from './native-build.ts'
import type { NativeBuildOptions, NativeBuildRecipe } from './native-build.ts'

export const ualbertaRecipePaths = Object.freeze([
  ...nativeRecipePaths,
  'native/ualbertabot.cmake',
  'native/chrono-timer.hpp',
  'native/ualberta-timer.hpp',
  'tools/build-ualbertabot.ts',
  'tools/package-ualbertabot.ts',
  'tools/native-package.ts',
  'native/GPL-3.0.txt',
  'bots/ualbertabot/UAlbertaBot_Config.txt',
  'bots/ualbertabot/BUILD.md',
  'bots/ualbertabot/RELEASE.txt',
  'bots/ualbertabot/UALBERTABOT-MIT.txt',
  'bots/ualbertabot/RAPIDJSON-MIT.txt',
  'bots/ualbertabot/MSINTTYPES-BSD-3-Clause.txt',
  'bots/ualbertabot/SMALLSHA1-LICENSE.txt',
])

export const ualbertaRecipe: NativeBuildRecipe = {
  botId: 'ualbertabot',
  target: 'UAlbertaBot',
  sourceIds: ['bwapi', 'ualbertabot'],
  sourceVariables: { BWAPI_SOURCE_DIR: 'bwapi', UALBERTABOT_SOURCE_DIR: 'ualbertabot' },
  outputVariable: 'UALBERTABOT_OUTPUT_DIR',
  recipePaths: ualbertaRecipePaths,
}

export function buildUalbertabot(options: NativeBuildOptions) {
  return buildNativeBot(ualbertaRecipe, options)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [outputName, ...rest] = process.argv.slice(2)
  if (!outputName || rest.length)
    throw new Error('Usage: node tools/build-ualbertabot.ts <new-output-name>')
  buildUalbertabot({ outputName: validateOutputName(outputName) })
    .then(({ output }) => console.log(output))
    .catch(error => {
      console.error(error)
      process.exitCode = 1
    })
}
