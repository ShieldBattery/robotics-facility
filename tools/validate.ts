import type { AnySchemaObject, ValidateFunction } from 'ajv'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { validateSourceLock } from './fetch-sources.ts'
import type { Artifact, Candidate, Catalog, MetadataTypes, Package } from './metadata.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSchemaDocument(value: unknown): value is AnySchemaObject & { $id: string } {
  return isObject(value) && typeof value.$id === 'string'
}

function read(path: string): unknown {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'))
}

const schema = read('schemas/metadata.schema.json')
if (!isSchemaDocument(schema))
  throw new Error('metadata schema must be an object with a string $id')
const schemaDocument: AnySchemaObject & { $id: string } = schema
const ajv = new Ajv2020({ allErrors: true, strict: true })
ajv.addSchema(schemaDocument)

type MetadataKind = keyof MetadataTypes

function schemaCheck<K extends MetadataKind>(kind: K): ValidateFunction<MetadataTypes[K]> {
  const check = ajv.getSchema<MetadataTypes[K]>(`${schemaDocument.$id}#/$defs/${kind}`)
  if (!check) throw new Error(`Unknown metadata kind: ${kind}`)
  return check
}

function assertSchema<K extends MetadataKind>(
  kind: K,
  value: unknown,
): asserts value is MetadataTypes[K] {
  const check = schemaCheck(kind)
  if (!check(value)) throw new Error(ajv.errorsText(check.errors, { separator: '\n' }))
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`)
}

function validateCandidateRelations(candidate: Candidate): void {
  unique(
    candidate.profile.formats.map(format => format.id),
    'format ID',
  )
}

function validatePackageRelations(pkg: Package): void {
  unique(
    pkg.profile.formats.map(format => format.id),
    'format ID',
  )
  validateSourceLock({ schemaVersion: 1, sources: pkg.sources })
  validateSourceLock({ schemaVersion: 1, sources: [pkg.build.recipeSource] })
  if (pkg.runtime.kind === 'java' && pkg.runtime.architecture !== pkg.platform.architecture) {
    throw new Error('Java runtime architecture must match package architecture')
  }
}

function validateArtifactUrl(artifact: Artifact): void {
  const url = new URL(artifact.url)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('Artifact URL must be HTTPS without credentials or fragment')
  }
}

function validateCatalogRelations(catalog: Catalog): void {
  unique(
    catalog.bots.map(entry => entry.bot.id),
    'bot ID',
  )
  for (const { bot, releases } of catalog.bots) {
    unique(
      releases.map(release => release.package.releaseId),
      'release ID',
    )
    for (const { package: pkg, artifact } of releases) {
      validatePackageRelations(pkg)
      validateArtifactUrl(artifact)
      if (pkg.botId !== bot.id) throw new Error('Package bot ID does not match catalog entry')
      if (pkg.sourceReview.status !== 'approved') {
        throw new Error('Catalog releases require approved source review')
      }
      if (pkg.permissions.localDistribution.status !== 'approved') {
        throw new Error('Catalog releases require approved local distribution')
      }
    }
  }
}

export function validate<K extends MetadataKind>(
  kind: K,
  value: unknown,
): asserts value is MetadataTypes[K] {
  assertSchema(kind, value)
  if (kind === 'sourceLock') {
    validateSourceLock(value)
  } else if (kind === 'candidate') {
    assertSchema('candidate', value)
    validateCandidateRelations(value)
  } else if (kind === 'package') {
    assertSchema('package', value)
    validatePackageRelations(value)
  } else if (kind === 'catalog') {
    assertSchema('catalog', value)
    validateCatalogRelations(value)
  }
}

export function validateRepository(): number {
  const lock: unknown = read('source-lock.json')
  validate('sourceLock', lock)
  const sourceIds = new Set(lock.sources.map(source => source.id))
  let count = 0
  for (const dir of readdirSync(resolve(root, 'bots'), { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const candidate: unknown = read(`bots/${dir.name}/bot.json`)
    validate('candidate', candidate)
    if (candidate.bot.id !== dir.name) throw new Error(`Mismatched bot directory: ${dir.name}`)
    for (const id of candidate.sourceIds) {
      if (!sourceIds.has(id)) throw new Error(`Unknown source ${id}`)
    }
    if (!candidate.sourceIds.includes(candidate.license.sourceId)) {
      throw new Error('Unknown license source')
    }
    count += 1
  }
  const catalog: unknown = read('catalog/catalog.json')
  validate('catalog', catalog)
  return count
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(`Validated source lock, ${validateRepository()} candidates, and catalog.`)
}
