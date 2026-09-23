import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import https from 'node:https'
import path from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import { pathToFileURL } from 'node:url'
import yauzl from 'yauzl'
import { buildNativeBot, validateOutputName } from './build-zzzkbot.mjs'

const archiveLimit = 200 * 1024 * 1024
const extractedLimit = 120 * 1024 * 1024
const archiveRoot = 'boost_1_56_0'
const comparePaths = (a, b) => a < b ? -1 : a > b ? 1 : 0

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function validateBoostLock(lock) {
  if (lock?.schemaVersion !== 1 || lock.artifacts?.length !== 1) {
    throw new Error('native/dependencies.json must pin exactly one Boost archive')
  }
  const artifact = lock.artifacts[0]
  if (
    artifact.name !== 'boost_1_56_0.zip' ||
    artifact.url !== 'https://archives.boost.io/release/1.56.0/source/boost_1_56_0.zip' ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
    !Number.isSafeInteger(artifact.sizeBytes) ||
    artifact.sizeBytes <= 0 || artifact.sizeBytes > archiveLimit ||
    artifact.license !== 'Boost Software License 1.0'
  ) {
    throw new Error('Invalid pinned Boost 1.56.0 archive')
  }
  return artifact
}

async function downloadArchive(artifact) {
  return await new Promise((resolve, reject) => {
    const request = https.get(artifact.url, {
      headers: { 'User-Agent': 'robotics-facility-build' },
    }, response => {
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Boost archive download returned HTTP ${response.statusCode}`))
        return
      }
      if (response.headers['content-length'] &&
          Number(response.headers['content-length']) !== artifact.sizeBytes) {
        response.resume()
        reject(new Error('Boost archive download has unexpected Content-Length'))
        return
      }
      const chunks = []
      let size = 0
      response.on('data', chunk => {
        size += chunk.length
        if (size > artifact.sizeBytes) {
          response.destroy(new Error('Boost archive exceeds its pinned size'))
        } else {
          chunks.push(chunk)
        }
      })
      response.on('error', reject)
      response.on('end', () => resolve(Buffer.concat(chunks)))
    })
    request.on('error', reject)
  })
}

function safeArchivePath(name) {
  if (name.includes('\\') || name.includes(':') || name.includes('\0')) {
    throw new Error(`Unsafe Boost archive path: ${name}`)
  }
  const parts = name.replace(/\/$/, '').split('/')
  if (parts[0] !== archiveRoot || parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe Boost archive path: ${name}`)
  }
  return parts.slice(1).join('/')
}

function openZip(bytes) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, {
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    }, (error, zip) => error ? reject(error) : resolve(zip))
  })
}

function openEntry(zip, entry) {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream))
  })
}

async function extractHeaders(bytes, includeDir) {
  const zip = await openZip(bytes)
  const inventory = []
  let totalBytes = 0
  const seen = new Set()
  await new Promise((resolve, reject) => {
    let finished = false
    const fail = error => {
      if (finished) return
      finished = true
      zip.close()
      reject(error)
    }
    zip.on('error', fail)
    zip.on('end', () => {
      if (!finished) {
        finished = true
        resolve()
      }
    })
    zip.on('entry', async entry => {
      try {
        const relative = safeArchivePath(entry.fileName)
        const fileType = (entry.externalFileAttributes >>> 16) & 0o170000
        const isDirectory = entry.fileName.endsWith('/')
        if (fileType && fileType !== (isDirectory ? 0o040000 : 0o100000)) {
          throw new Error(`Unsafe Boost archive entry type: ${entry.fileName}`)
        }
        if (!isDirectory && (relative.startsWith('boost/') || relative === 'LICENSE_1_0.txt')) {
          if (seen.has(relative)) throw new Error(`Duplicate Boost archive entry: ${relative}`)
          seen.add(relative)
          totalBytes += entry.uncompressedSize
          if (entry.uncompressedSize > 4 * 1024 * 1024 || totalBytes > extractedLimit) {
            throw new Error('Boost header extraction exceeds its size limit')
          }
          const destination = path.join(includeDir, ...relative.split('/'))
          await mkdir(path.dirname(destination), { recursive: true })
          await pipeline(await openEntry(zip, entry), createWriteStream(destination, { flags: 'wx' }))
          const content = await readFile(destination)
          inventory.push({ path: relative, sha256: hash(content), sizeBytes: content.length })
        }
        zip.readEntry()
      } catch (error) {
        fail(error)
      }
    })
    zip.readEntry()
  })
  if (!seen.has('boost/geometry.hpp') || !seen.has('LICENSE_1_0.txt')) {
    throw new Error('Boost archive is missing headers or its license')
  }
  inventory.sort((a, b) => comparePaths(a.path, b.path))
  return { inventory, totalBytes }
}

async function listExtractedFiles(directory, prefix = '') {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...await listExtractedFiles(path.join(directory, entry.name), relative))
    } else if (entry.isFile()) {
      files.push(relative)
    } else {
      throw new Error(`Unexpected Boost extraction entry: ${relative}`)
    }
  }
  return files.sort(comparePaths)
}

export async function prepareBoost({ root, output, archivePath }) {
  const artifact = validateBoostLock(JSON.parse(await readFile(path.join(root, 'native/dependencies.json'), 'utf8')))
  let bytes
  if (archivePath) {
    const info = await lstat(archivePath)
    if (!info.isFile() || info.size !== artifact.sizeBytes) {
      throw new Error('Local Boost archive is not a regular file of the pinned size')
    }
    bytes = await readFile(archivePath)
  } else {
    bytes = await downloadArchive(artifact)
  }
  if (bytes.length !== artifact.sizeBytes || hash(bytes) !== artifact.sha256) {
    throw new Error('Boost archive does not match its pinned size and SHA-256')
  }
  const depsDir = path.join(output, 'deps')
  const includeDir = path.join(depsDir, archiveRoot)
  await mkdir(includeDir, { recursive: true })
  const savedArchive = path.join(depsDir, artifact.name)
  await writeFile(savedArchive, bytes, { flag: 'wx' })
  const { inventory, totalBytes } = await extractHeaders(bytes, includeDir)
  const inventoryPath = path.join(depsDir, 'boost-header-inventory.json')
  const inventoryBytes = Buffer.from(JSON.stringify({ schemaVersion: 1, files: inventory }, null, 2) + '\n')
  await writeFile(inventoryPath, inventoryBytes, { flag: 'wx' })

  return {
    includeDir,
    async verify() {
      if (hash(await readFile(savedArchive)) !== artifact.sha256) {
        throw new Error('Boost archive changed during compilation')
      }
      if (hash(await readFile(inventoryPath)) !== hash(inventoryBytes)) {
        throw new Error('Boost inventory changed during compilation')
      }
      const actualFiles = await listExtractedFiles(includeDir)
      if (actualFiles.length !== inventory.length ||
          actualFiles.some((file, index) => file !== inventory[index].path)) {
        throw new Error('Extracted Boost header set changed during compilation')
      }
      for (const file of inventory) {
        const actual = await readFile(path.join(includeDir, ...file.path.split('/')))
        if (actual.length !== file.sizeBytes || hash(actual) !== file.sha256) {
          throw new Error(`Boost header changed during compilation: ${file.path}`)
        }
      }
      return {
        boost: {
          directory: 'deps/boost_1_56_0',
          archive: {
            name: artifact.name,
            url: artifact.url,
            sha256: artifact.sha256,
            sizeBytes: artifact.sizeBytes,
          },
          files: inventory,
          inventory: 'deps/boost-header-inventory.json',
          inventorySha256: hash(inventoryBytes),
          headerCount: inventory.length - 1,
          extractedBytes: totalBytes,
        },
      }
    },
  }
}

export function buildOpprimobot({ archivePath, ...options }) {
  return buildNativeBot({
    ...options,
    botId: 'opprimobot',
    prepareDependencies: ({ root, output }) => prepareBoost({ root, output, archivePath }),
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [outputName, archivePath, ...rest] = process.argv.slice(2)
  if (!outputName || rest.length) {
    throw new Error('Usage: node tools/build-opprimobot.mjs <new-output-name> [boost_1_56_0.zip]')
  }
  buildOpprimobot({ outputName: validateOutputName(outputName), archivePath })
    .then(({ output }) => console.log(output))
    .catch(error => { console.error(error); process.exitCode = 1 })
}
