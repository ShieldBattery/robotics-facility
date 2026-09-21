import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { validate } from './validate.mjs'
import { ARCHIVE_LIMIT, JSON_LIMIT, sha256, verifyArchive } from './publication-archive.mjs'

export const PREFIX = 'public/robotics-facility/'
export function revision(value) {
  if (!/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(Number(value)))
    throw new Error('Revision must be a positive safe integer')
  return Number(value)
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`
  return JSON.stringify(value)
}
export function httpsUrl(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new Error('URL must be HTTPS without credentials or fragment')
  return url
}
export function baseUrl(value) {
  const url = httpsUrl(value)
  if (url.search || !url.pathname.endsWith(`/${PREFIX}`))
    throw new Error(`Public base URL must end with /${PREFIX}`)
  return url.href
}
function channelName(channel) {
  if (!['staging', 'production'].includes(channel)) throw new Error('Invalid publication channel')
}
function key(input, privateKey = false) {
  const result = privateKey ? createPrivateKey(input) : createPublicKey(input)
  if (result.asymmetricKeyType !== 'ed25519') throw new Error('Catalog key must be Ed25519')
  return result
}
export function signCatalog(catalog, { channel, keyId, privateKey }) {
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
export function verifyCatalog(bytes, { channel, keyId, publicKey }) {
  if (bytes.length > JSON_LIMIT) throw new Error('Catalog too large')
  const envelope = JSON.parse(bytes)
  if (
    Object.keys(envelope).sort().join(',') !== 'envelopeVersion,payload,signature' ||
    envelope.envelopeVersion !== 1
  )
    throw new Error('Invalid signed envelope')
  const decode = (text) => {
    if (typeof text !== 'string') throw new Error('Invalid signed bytes')
    const result = Buffer.from(text, 'base64')
    if (result.toString('base64') !== text) throw new Error('Noncanonical base64')
    return result
  }
  const payload = decode(envelope.payload),
    signature = decode(envelope.signature)
  if (signature.length !== 64 || !verify(null, payload, key(publicKey), signature))
    throw new Error('Invalid catalog signature')
  const parsed = JSON.parse(payload)
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
export async function downloadBytes(value, limit) {
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
    const chunks = []
    let total = 0
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
}) {
  channelName(channel)
  const base = baseUrl(publicBaseUrl)
  const catalog = structuredClone(inputCatalog)
  catalog.revision = revision(nextRevision)
  validate('catalog', catalog)
  if (!catalog.bots.length)
    throw new Error('No approved releases to publish; the candidate catalog is empty')
  const artifacts = new Map()
  let total = 0
  for (const bot of catalog.bots)
    for (const release of bot.releases) {
      const { artifact } = release
      if (artifact.sizeBytes > ARCHIVE_LIMIT) throw new Error('Archive exceeds limit')
      const relative = `packages/${artifact.sha256}.zip`
      if (channel === 'production' && artifact.url !== baseUrl(stagingBaseUrl) + relative)
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

export async function publishPrepared({ prepared, store, publicBaseUrl, trust, privateKey }) {
  const { channel, catalog, artifacts } = prepared
  const base = baseUrl(publicBaseUrl)
  channelName(channel)
  validate('catalog', catalog)
  revision(catalog.revision)
  if (!catalog.bots.length) throw new Error('No approved releases to publish')
  // Recheck local bundle integrity; ZIP parsing happens in the credential-free preparation step.
  const objects = new Map()
  const retain = (name, bytes, type) => {
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
  const missing = []
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
      cacheControl: 'public, max-age=60, must-revalidate',
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
