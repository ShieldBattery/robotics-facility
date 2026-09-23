import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ARCHIVE_LIMIT, JSON_LIMIT, sha256 } from './publication-archive.ts'
import { createStore } from './publication-store.ts'
import {
  baseUrl,
  channelName,
  downloadBytes,
  preparePublication,
  publishPrepared,
  revision,
  verifyCatalog,
} from './publication.ts'
import { validate } from './validate.ts'

function required(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name]
  if (!value) throw new Error(`Missing configuration: ${name}`)
  return value
}
export function parsePublishArgs(args: string[]) {
  const prepare = args[0] === 'prepare'
  const rest = prepare ? args.slice(1) : args
  const [channel, ...flags] = rest
  if (channel !== 'staging' && channel !== 'production')
    throw new Error('Expected staging or production')
  const options: Record<string, number | undefined> = {}
  for (let i = 0; i < flags.length; i += 2) {
    if (
      !['--revision', '--staging-revision'].includes(flags[i]) ||
      options[flags[i]] !== undefined ||
      flags[i + 1] === undefined
    ) {
      throw new Error('Invalid or duplicate publication argument')
    }
    options[flags[i]] = revision(flags[i + 1])
  }
  if (!options['--revision'] || (channel === 'production') !== !!options['--staging-revision'])
    throw new Error('Missing or unexpected revision argument')
  return {
    prepare,
    channel,
    nextRevision: options['--revision'],
    stagingRevision: options['--staging-revision'] ?? null,
  }
}
async function boundedFile(file: string, limit: number) {
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || info.size > limit)
    throw new Error('Invalid or oversized publication input')
  const bytes = await readFile(file)
  if (bytes.length > limit) throw new Error('Oversized publication input')
  return bytes
}
async function realDirectory(dir: string) {
  const info = await lstat(dir)
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error('Publication workspace must be a real directory')
}
export async function runPublish(args: string[], env = process.env, root = process.cwd()) {
  const options = parsePublishArgs(args)
  const publicBaseUrl = baseUrl(required(env, 'BOT_PUBLIC_BASE_URL'))
  const build = path.join(root, '.build')
  const bundle = path.join(build, 'publication')
  if (options.prepare) {
    let inputCatalog: unknown
    let stagingBaseUrl
    if (options.channel === 'staging') {
      inputCatalog = JSON.parse(
        (await boundedFile(path.join(root, 'catalog/catalog.json'), JSON_LIMIT)).toString('utf8'),
      )
    } else {
      stagingBaseUrl = baseUrl(required(env, 'STAGING_PUBLIC_BASE_URL'))
      if (stagingBaseUrl === publicBaseUrl)
        throw new Error('Staging and production URLs must differ')
      const receipt = await downloadBytes(
        `${stagingBaseUrl}published/${options.stagingRevision}.json`,
        JSON_LIMIT,
      )
      const stagingCatalog = verifyCatalog(receipt, {
        channel: 'staging',
        keyId: required(env, 'STAGING_CATALOG_KEY_ID'),
        publicKey: required(env, 'STAGING_CATALOG_PUBLIC_KEY'),
      })
      inputCatalog = stagingCatalog
      if (stagingCatalog.revision !== options.stagingRevision)
        throw new Error('Staging revision mismatch')
    }
    const prepared = await preparePublication({
      ...options,
      inputCatalog,
      publicBaseUrl,
      stagingBaseUrl,
    })
    try {
      await mkdir(build)
    } catch (e) {
      if (!(e instanceof Error && 'code' in e && e.code === 'EEXIST')) throw e
    }
    await realDirectory(build)
    await mkdir(bundle)
    for (const [digest, bytes] of prepared.artifacts)
      await writeFile(path.join(bundle, `${digest}.zip`), bytes, { flag: 'wx' })
    // Write the descriptor last; failed preparations cannot be consumed as complete bundles.
    await writeFile(
      path.join(bundle, 'bundle.json'),
      JSON.stringify({
        schemaVersion: 1,
        channel: options.channel,
        stagingRevision: options.stagingRevision,
        catalog: prepared.catalog,
      }) + '\n',
      { flag: 'wx' },
    )
    return {
      prepared: true,
      revision: prepared.catalog.revision,
      packages: prepared.artifacts.size,
    }
  }
  await realDirectory(build)
  await realDirectory(bundle)
  const parsed: unknown = JSON.parse(
    (await boundedFile(path.join(bundle, 'bundle.json'), JSON_LIMIT)).toString('utf8'),
  )
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Invalid prepared bundle')
  const metadata = parsed as Record<string, unknown>
  const catalog = metadata.catalog
  validate('catalog', catalog)
  if (
    metadata.schemaVersion !== 1 ||
    metadata.channel !== options.channel ||
    metadata.stagingRevision !== options.stagingRevision ||
    catalog.revision !== options.nextRevision
  )
    throw new Error('Prepared bundle does not match requested publication')
  channelName(metadata.channel)
  const artifacts = new Map<string, Buffer>()
  let total = 0
  for (const bot of catalog.bots)
    for (const release of bot.releases) {
      const digest = release.artifact.sha256
      if (!artifacts.has(digest)) {
        const bytes = await boundedFile(path.join(bundle, `${digest}.zip`), ARCHIVE_LIMIT)
        total += bytes.length
        if (total > 512 * 1024 * 1024 || sha256(bytes) !== digest)
          throw new Error('Invalid prepared artifacts')
        artifacts.set(digest, bytes)
      }
    }
  const privateKey = required(env, 'CATALOG_SIGNING_PRIVATE_KEY')
  const trust = {
    keyId: required(env, 'CATALOG_KEY_ID'),
    publicKey: required(env, 'CATALOG_PUBLIC_KEY'),
  }
  const store = createStore({
    endpoint: required(env, 'SPACES_ENDPOINT'),
    bucket: required(env, 'SPACES_BUCKET'),
    region: required(env, 'SPACES_REGION'),
    accessKeyId: required(env, 'SPACES_ACCESS_KEY_ID'),
    secretAccessKey: required(env, 'SPACES_SECRET_ACCESS_KEY'),
  })
  try {
    return await publishPrepared({
      prepared: { channel: metadata.channel, catalog, artifacts },
      store,
      publicBaseUrl,
      trust,
      privateKey,
    })
  } finally {
    store.close()
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runPublish(process.argv.slice(2))
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => {
      // Print the message without SDK request details, which may contain authentication headers.
      console.error(`Publication stopped: ${error.message}`)
      process.exitCode = 1
    })
}
