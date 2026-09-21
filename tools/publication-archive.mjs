import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import yauzl from 'yauzl'

export const ARCHIVE_LIMIT = 128 * 1024 * 1024
export const JSON_LIMIT = 8 * 1024 * 1024
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function archivePath(name) {
  const clean = name.endsWith('/') ? name.slice(0, -1) : name
  if (
    !clean ||
    clean
      .split('/')
      .some(
        (p) =>
          !/^[A-Za-z0-9_ .-]+$/.test(p) ||
          p === '.' ||
          p === '..' ||
          /[. ]$/.test(p) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p),
      )
  ) {
    throw new Error(`Unsupported or unsafe archive path: ${name}`)
  }
  return clean.toLowerCase()
}

const crcTable = Array.from({ length: 256 }, (_, i) => {
  let n = i
  for (let j = 0; j < 8; j++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1
  return n >>> 0
})

export async function verifyArchive(bytes, release) {
  const { artifact, package: pkg } = release
  if (
    bytes.length > ARCHIVE_LIMIT ||
    bytes.length !== artifact.sizeBytes ||
    sha256(bytes) !== artifact.sha256
  ) {
    throw new Error('Archive size or SHA-256 mismatch')
  }
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      bytes,
      { lazyEntries: true, strictFileNames: true, validateEntrySizes: true },
      (error, zip) => {
        if (error) return reject(error)
        let failed = false,
          expanded = 0,
          count = 0,
          manifest
        const entries = new Map()
        const fail = (err) => {
          failed = true
          zip.close()
          reject(err)
        }
        zip.on('error', fail)
        zip.on('entry', (entry) => {
          if (failed) return
          try {
            const directory = entry.fileName.endsWith('/')
            const name = archivePath(entry.fileName)
            const mode = (entry.externalFileAttributes >>> 16) & 0xf000
            if (
              ++count > 10000 ||
              entry.generalPurposeBitFlag & 1 ||
              (mode && mode !== (directory ? 0x4000 : 0x8000))
            )
              throw new Error('Unsupported ZIP entry')
            if (entries.has(name)) throw new Error('Duplicate or case-colliding ZIP path')
            entries.set(name, { directory, original: entry.fileName })
            expanded += entry.uncompressedSize
            if (
              expanded > 512 * 1024 * 1024 ||
              (name === 'package.json' && entry.uncompressedSize > 1024 * 1024)
            ) {
              throw new Error('ZIP expanded-size limit exceeded')
            }
            if (directory) {
              if (entry.uncompressedSize !== 0) throw new Error('Directory entry contains data')
              zip.readEntry()
              return
            }
            zip.openReadStream(entry, (err, stream) => {
              if (err) return fail(err)
              let length = 0,
                crc = 0xffffffff
              const chunks = []
              stream.on('error', fail)
              stream.on('data', (chunk) => {
                length += chunk.length
                if (length > entry.uncompressedSize) {
                  stream.destroy(new Error('ZIP entry size mismatch'))
                  return
                }
                for (const byte of chunk) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
                if (name === 'package.json') chunks.push(chunk)
              })
              stream.on('end', () => {
                if (failed) return
                if (length !== entry.uncompressedSize || (crc ^ 0xffffffff) >>> 0 !== entry.crc32) {
                  fail(new Error('ZIP entry size or CRC mismatch'))
                  return
                }
                if (name === 'package.json') manifest = Buffer.concat(chunks)
                zip.readEntry()
              })
            })
          } catch (err) {
            fail(err)
          }
        })
        zip.on('end', () => {
          if (failed) return
          try {
            for (const name of entries.keys()) {
              const parts = name.split('/')
              for (let i = 1; i < parts.length; i++) {
                if (entries.get(parts.slice(0, i).join('/'))?.directory === false)
                  throw new Error('ZIP file/directory collision')
              }
            }
            if (
              !manifest ||
              sha256(manifest) !== artifact.manifestSha256 ||
              !isDeepStrictEqual(JSON.parse(manifest), pkg)
            ) {
              throw new Error('Package descriptor missing or does not match catalog')
            }
            const requireFile = (name) => {
              if (entries.get(archivePath(name))?.directory !== false)
                throw new Error(`Required package file missing: ${name}`)
            }
            requireFile(pkg.launch.entrypoint)
            for (const license of pkg.licenses) requireFile(license.noticePath)
            if (pkg.launch.workingDirectory !== '.') {
              const dir = archivePath(pkg.launch.workingDirectory)
              if (
                !entries.get(dir)?.directory &&
                ![...entries.keys()].some((p) => p.startsWith(`${dir}/`))
              )
                throw new Error('Working directory missing')
            }
            resolve()
          } catch (err) {
            fail(err)
          }
        })
        zip.readEntry()
      },
    )
  })
}
