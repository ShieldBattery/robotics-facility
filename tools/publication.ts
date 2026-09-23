import type { Catalog } from './metadata.ts'
import type { PublicationStore } from './publication-store.ts'

export type Channel = 'staging' | 'production'
export interface CatalogTrust {
  keyId: string
  publicKey: string | Buffer
}
export interface PreparedPublication {
  channel: Channel
  catalog: Catalog
  artifacts: Map<string, Buffer>
}
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { ARCHIVE_LIMIT, JSON_LIMIT, sha256, verifyArchive } from './publication-archive.ts'
import { validate } from './validate.ts'

export const PREFIX = 'robotics-facility/'
export function revision(value: unknown) {
  if (!/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(Number(value)))
    throw new Error('Revision must be a positive safe integer')
  return Number(value)
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  const result = JSON.stringify(value)
  if (result === undefined) throw new Error('Value is not JSON serializable')
  return result
}
export function httpsUrl(value: string | URL) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new Error('URL must be HTTPS without credentials or fragment')
  return url
}
export function baseUrl(value: string) {
  const url = httpsUrl(value)
  if (url.search || url.pathname !== `/${PREFIX}`)
    throw new Error(`Public base URL path must be /${PREFIX}`)
  return url.href
}
export function channelName(channel: unknown): asserts channel is Channel {
  if (channel !== 'staging' && channel !== 'production')
    throw new Error('Invalid publication channel')
}
function key(input: string | Buffer, privateKey = false) {
  const result = privateKey ? createPrivateKey(input) : createPublicKey(input)
  if (result.asymmetricKeyType !== 'ed25519') throw new Error('Catalog key must be Ed25519')
  return result
}
export function signCatalog(
  catalog: unknown,
  { channel, keyId, privateKey }: { channel: string; keyId: string; privateKey: string | Buffer },
) {
  channelName(channel)
  if (!/^[a-zA-Z0-9_-]+$/.test(keyId)) throw new Error('Invalid catalog key ID')
  validate('catalog', catalog)
  const payload = Buffer.from(
    canonical({ purpose: 'shieldbattery-bot-catalog', channel, keyId, catalog }),
  )
  const signature = sign(null, payload, key(privateKey, true))
  return Buffer.from(
    canonical({
      envelopeVersion: 1,
      payload: payload.toString('base64'),
      signature: signature.toString('base64'),
    }) + '\n',
  )
}
export function verifyCatalog(
  bytes: Buffer,
  { channel, keyId, publicKey }: CatalogTrust & { channel: string },
): Catalog {
  if (bytes.length > JSON_LIMIT) throw new Error('Catalog too large')
  const envelope: unknown = JSON.parse(bytes.toString('utf8'))
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope))
    throw new Error('Invalid signed envelope')
  if (
    Object.keys(envelope).sort().join(',') !== 'envelopeVersion,payload,signature' ||
    ('envelopeVersion' in envelope ? envelope.envelopeVersion : undefined) !== 1
  )
    throw new Error('Invalid signed envelope')
  const decode = (text: unknown) => {
    if (typeof text !== 'string') throw new Error('Invalid signed bytes')
    const result = Buffer.from(text, 'base64')
    if (result.toString('base64') !== text) throw new Error('Noncanonical base64')
    return result
  }
  const payload = decode('payload' in envelope ? envelope.payload : undefined),
    signature = decode('signature' in envelope ? envelope.signature : undefined)
  if (signature.length !== 64 || !verify(null, payload, key(publicKey), signature))
    throw new Error('Invalid catalog signature')
  const value: unknown = JSON.parse(payload.toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Catalog trust context mismatch')
  const parsed = value as Record<string, unknown>
  if (
    canonical(parsed) !== payload.toString() ||
    Object.keys(parsed).sort().join(',') !== 'catalog,channel,keyId,purpose' ||
    parsed.purpose !== 'shieldbattery-bot-catalog' ||
    parsed.channel !== channel ||
    parsed.keyId !== keyId
  )
    throw new Error('Catalog trust context mismatch')
  channelName(channel)
  validate('catalog', parsed.catalog)
  revision(parsed.catalog.revision)
  return parsed.catalog
}
export async function downloadBytes(value: string, limit: number): Promise<Buffer> {
  let url = httpsUrl(value)
  const signal = AbortSignal.timeout(180000)
  for (let count = 0; count < 6; count++) {
    const response = await fetch(url, { redirect: 'manual', signal })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const target = response.headers.get('location')
      await response.body?.cancel()
      if (!target) throw new Error('Download redirect without location')
      url = httpsUrl(new URL(target, url).href)
      continue
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`Download failed: HTTP ${response.status}`)
    }
    const length = response.headers.get('content-length')
    if (length && Number(length) > limit) {
      await response.body?.cancel()
      throw new Error('Download exceeds size limit')
    }
    const chunks: Buffer[] = []
    let total = 0
    if (!response.body) throw new Error('Download response has no body')
    for await (const chunk of response.body) {
      total += chunk.length
      if (total > limit) throw new Error('Download exceeds size limit')
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }
  throw new Error('Too many redirects')
}
export async function preparePublication({
  channel,
  nextRevision,
  inputCatalog,
  publicBaseUrl,
  download = downloadBytes,
  stagingBaseUrl,
}: {
  channel: string
  nextRevision: unknown
  inputCatalog: unknown
  publicBaseUrl: string
  download?: typeof downloadBytes
  stagingBaseUrl?: string
}): Promise<PreparedPublication> {
  channelName(channel)
  const base = baseUrl(publicBaseUrl)
  const input = structuredClone(inputCatalog)
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid input catalog')
  const catalog = input as Record<string, unknown>
  catalog.revision = revision(nextRevision)
  validate('catalog', catalog)
  if (!catalog.bots.length)
    throw new Error('No approved releases to publish; the candidate catalog is empty')
  const artifacts = new Map<string, Buffer>()
  let total = 0
  for (const bot of catalog.bots)
    for (const release of bot.releases) {
      const { artifact } = release
      if (artifact.sizeBytes > ARCHIVE_LIMIT) throw new Error('Archive exceeds limit')
      const relative = `packages/${artifact.sha256}.zip`
      if (
        channel === 'production' &&
        (!stagingBaseUrl || artifact.url !== baseUrl(stagingBaseUrl) + relative)
      )
        throw new Error('Staging package URL does not match its digest')
      let bytes = artifacts.get(artifact.sha256)
      if (!bytes) {
        total += artifact.sizeBytes
        if (total > 512 * 1024 * 1024) throw new Error('Publication exceeds total archive limit')
        bytes = await download(artifact.url, artifact.sizeBytes)
        artifacts.set(artifact.sha256, bytes)
      }
      await verifyArchive(bytes, release)
      artifact.url = base + relative
    }
  return { channel, catalog, artifacts }
}

export async function publishPrepared({
  prepared,
  store,
  publicBaseUrl,
  trust,
  privateKey,
}: {
  prepared: PreparedPublication
  store: PublicationStore
  publicBaseUrl: string
  trust: CatalogTrust
  privateKey: string | Buffer
}) {
  const { channel, catalog, artifacts } = prepared
  const base = baseUrl(publicBaseUrl)
  channelName(channel)
  validate('catalog', catalog)
  revision(catalog.revision)
  if (!catalog.bots.length) throw new Error('No approved releases to publish')
  // Recheck local bundle integrity; ZIP parsing happens in the credential-free preparation step.
  const objects = new Map<string, { bytes: Buffer; type: string }>()
  const retain = (name: string, bytes: Buffer, type: string) => {
    const prior = objects.get(name)
    if (prior && !prior.bytes.equals(bytes)) throw new Error('Conflicting immutable object')
    objects.set(name, { bytes, type })
  }
  for (const bot of catalog.bots)
    for (const release of bot.releases) {
      const { artifact, package: pkg } = release
      const bytes = artifacts.get(artifact.sha256)
      if (
        !bytes ||
        bytes.length !== artifact.sizeBytes ||
        bytes.length > ARCHIVE_LIMIT ||
        sha256(bytes) !== artifact.sha256 ||
        artifact.url !== base + `packages/${artifact.sha256}.zip`
      )
        throw new Error('Prepared artifact mismatch')
      retain(`packages/${artifact.sha256}.zip`, bytes, 'application/zip')
      retain(
        `releases/${bot.bot.id}/${pkg.releaseId}.json`,
        Buffer.from(
          canonical({
            package: pkg,
            sha256: artifact.sha256,
            manifestSha256: artifact.manifestSha256,
          }),
        ),
        'application/json',
      )
    }
  const trustContext = { ...trust, channel }
  const signed = signCatalog(catalog, { channel, keyId: trust.keyId, privateKey })
  verifyCatalog(signed, trustContext)
  const current = await store.get('catalog.json', JSON_LIMIT)
  if (current) {
    const old = verifyCatalog(current, trustContext)
    if (catalog.revision < old.revision) throw new Error('Catalog revision would roll back')
    if (catalog.revision === old.revision && canonical(old) !== canonical(catalog))
      throw new Error('Catalog revision already used')
  }
  retain(`catalogs/${catalog.revision}.json`, signed, 'application/json')
  const receiptName = `published/${catalog.revision}.json`
  const receipt = await store.get(receiptName, JSON_LIMIT)
  if (receipt && !receipt.equals(signed)) throw new Error('Publication receipt already differs')
  const missing: Array<[string, { bytes: Buffer; type: string }]> = []
  // Detect all existing-object conflicts before uploading anything.
  for (const [name, object] of objects) {
    const old = await store.get(name, object.bytes.length)
    if (old && !old.equals(object.bytes)) throw new Error(`Immutable object differs: ${name}`)
    if (!old) missing.push([name, object])
  }
  for (const [name, object] of missing) {
    await store.put(name, object.bytes, {
      contentType: object.type,
      cacheControl: 'public, max-age=31536000, immutable',
    })
    const uploaded = await store.get(name, object.bytes.length)
    if (!uploaded?.equals(object.bytes))
      throw new Error(`Uploaded object verification failed: ${name}`)
  }
  // This is an additional pre-activation check, not compare-and-swap. All writers must use the serialized workflow.
  const latest = await store.get('catalog.json', JSON_LIMIT)
  if (current ? !latest?.equals(current) : latest !== null)
    throw new Error('Catalog changed during publication')
  if (!current?.equals(signed)) {
    await store.put('catalog.json', signed, {
      contentType: 'application/json',
      cacheControl: 'public, no-cache, max-age=0, must-revalidate',
    })
    const activated = await store.get('catalog.json', JSON_LIMIT)
    if (!activated?.equals(signed)) throw new Error('Catalog activation verification failed')
  }
  // A promotion receipt is only written after the current catalog has been activated and verified.
  if (!receipt) {
    await store.put(receiptName, signed, {
      contentType: 'application/json',
      cacheControl: 'public, max-age=31536000, immutable',
    })
    const recorded = await store.get(receiptName, JSON_LIMIT)
    if (!recorded?.equals(signed)) throw new Error('Publication receipt verification failed')
  }
  return { revision: catalog.revision, packages: artifacts.size }
}
