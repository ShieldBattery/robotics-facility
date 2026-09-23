import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildNativeBot, validateOutputName } from './build-zzzkbot.mjs'

export function buildUalbertabot(options) {
  return buildNativeBot({ ...options, botId: 'ualbertabot' })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [outputName, ...rest] = process.argv.slice(2)
  if (!outputName || rest.length) throw new Error('Usage: node tools/build-ualbertabot.mjs <new-output-name>')
  buildUalbertabot({ outputName: validateOutputName(outputName) })
    .then(({ output }) => console.log(output))
    .catch(error => { console.error(error); process.exitCode = 1 })
}
