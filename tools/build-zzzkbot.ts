import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { buildNativeBot, nativeRecipePaths, validateOutputName } from './native-build.ts'
import type { NativeBuildOptions, NativeBuildRecipe } from './native-build.ts'

export const zzzkbotRecipePaths = Object.freeze([
  ...nativeRecipePaths,
  'tools/build-zzzkbot.ts',
  'tools/package-zzzkbot.ts',
  'bots/zzzkbot/BUILD.md',
  'bots/zzzkbot/RELEASE.txt',
  'bots/zzzkbot/SMALLSHA1-LICENSE.txt',
])

export const zzzkbotRecipe: NativeBuildRecipe = {
  botId: 'zzzkbot',
  target: 'ZZZKBotClient',
  sourceIds: ['bwapi', 'zzzkbot'],
  sourceVariables: { BWAPI_SOURCE_DIR: 'bwapi', ZZZKBOT_SOURCE_DIR: 'zzzkbot' },
  outputVariable: 'ZZZKBOT_OUTPUT_DIR',
  recipePaths: zzzkbotRecipePaths,
}

export function parseBuildArguments(args: string[]) {
  if (args.length !== 1) throw new Error('Usage: node tools/build-zzzkbot.ts <new-output-name>')
  return validateOutputName(args[0])
}

export function buildZzzkbot(options: NativeBuildOptions) {
  return buildNativeBot(zzzkbotRecipe, options)
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) {
  let outputName
  try {
    outputName = parseBuildArguments(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
  if (!process.exitCode) {
    buildZzzkbot({ outputName: outputName! })
      .then(({ output }) => console.log(`Built ZZZKBotClient in ${output}`))
      .catch(error => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      })
  }
}
