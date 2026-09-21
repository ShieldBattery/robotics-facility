import { validateSourceLock } from './fetch-sources.mjs'
import Ajv2020 from 'ajv/dist/2020.js'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const schema = read('schemas/metadata.schema.json')
const ajv = new Ajv2020({ allErrors: true, strict: true })
ajv.addSchema(schema)

export function validate(kind, value) {
  const check = ajv.getSchema(`${schema.$id}#/$defs/${kind}`)
  if (!check) throw new Error(`Unknown metadata kind: ${kind}`)
  if (!check(value)) throw new Error(ajv.errorsText(check.errors, { separator: '\n' }))
  const unique = (values, label) => {
    if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`)
  }
  if (kind === 'sourceLock') validateSourceLock(value)
  if (kind === 'candidate' || kind === 'package') {
    unique(
      value.profile.formats.map((f) => f.id),
      'format ID',
    )
  }
  if (kind === 'package') {
    validateSourceLock({ schemaVersion: 1, sources: value.sources })
    validateSourceLock({ schemaVersion: 1, sources: [value.build.recipeSource] })
    if (
      value.runtime.kind === 'java' &&
      value.runtime.architecture !== value.platform.architecture
    ) {
      throw new Error('Java runtime architecture must match package architecture')
    }
  }
  if (kind === 'catalog') {
    unique(
      value.bots.map((b) => b.bot.id),
      'bot ID',
    )
    for (const { bot, releases } of value.bots) {
      unique(
        releases.map((r) => r.package.releaseId),
        'release ID',
      )
      for (const { package: pkg, artifact } of releases) {
        validate('package', pkg)
        const url = new URL(artifact.url)
        if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
          throw new Error('Artifact URL must be HTTPS without credentials or fragment')
        }
        if (pkg.botId !== bot.id) throw new Error('Package bot ID does not match catalog entry')
        if (pkg.permissions.localDistribution.status !== 'approved') {
          throw new Error('Catalog releases require approved local distribution')
        }
      }
    }
  }
}

export function validateRepository() {
  const lock = read('source-lock.json')
  validate('sourceLock', lock)
  const sourceIds = new Set(lock.sources.map((s) => s.id))
  let count = 0
  for (const dir of readdirSync(resolve(root, 'bots'), {
    withFileTypes: true,
  })) {
    if (!dir.isDirectory()) continue
    const candidate = read(`bots/${dir.name}/bot.json`)
    validate('candidate', candidate)
    if (candidate.bot.id !== dir.name) throw new Error(`Mismatched bot directory: ${dir.name}`)
    for (const id of candidate.sourceIds) {
      if (!sourceIds.has(id)) throw new Error(`Unknown source ${id}`)
    }
    if (!candidate.sourceIds.includes(candidate.license.sourceId))
      throw new Error('Unknown license source')
    count++
  }
  validate('catalog', read('catalog/catalog.json'))
  return count
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(`Validated source lock, ${validateRepository()} candidates, and catalog.`)
}
