import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildNativeBot, nativeRecipePaths, validateOutputName } from './native-build.ts'
import type { NativeBuildOptions, NativeBuildRecipe } from './native-build.ts'

export const steamhammerRecipePaths = Object.freeze([
  ...nativeRecipePaths,
  'native/steamhammer.cmake',
  'native/chrono-timer.hpp',
  'tools/build-steamhammer.ts',
  'tools/package-steamhammer.ts',
  'tools/native-package.ts',
  'imports/steamhammer-5.3.6.json',
  'bots/steamhammer/BUILD.md',
  'bots/steamhammer/RELEASE.txt',
  'bots/steamhammer/Steamhammer_5.3.6.json',
])

export const steamhammerRecipe: NativeBuildRecipe = {
  botId: 'steamhammer',
  target: 'Steamhammer',
  sourceIds: ['bwapi', 'steamhammer'],
  sourceVariables: { BWAPI_SOURCE_DIR: 'bwapi', STEAMHAMMER_SOURCE_DIR: 'steamhammer' },
  outputVariable: 'STEAMHAMMER_OUTPUT_DIR',
  recipePaths: steamhammerRecipePaths,
}

export function buildSteamhammer(options: NativeBuildOptions) {
  return buildNativeBot(steamhammerRecipe, options)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [outputName, ...rest] = process.argv.slice(2)
  if (!outputName || rest.length)
    throw new Error('Usage: node tools/build-steamhammer.ts <new-output-name>')
  buildSteamhammer({ outputName: validateOutputName(outputName) })
    .then(({ output }) => console.log(output))
    .catch(error => {
      console.error(error)
      process.exitCode = 1
    })
}
