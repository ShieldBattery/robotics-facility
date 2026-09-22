import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  makeJar,
  makeManifest,
  parseBuildArguments,
  validateDependencyLock,
  validateOutputDirectory,
  verifyDependencyBytes,
  verifyRecordedFile,
} from './build-purplewave.mjs'

const lock = JSON.parse(
  await readFile(new URL('../jvm/dependencies.json', import.meta.url), 'utf8'),
)

test('accepts the locked Maven Central dependency set', () => {
  assert.strictEqual(validateDependencyLock(lock), lock)
})

test('rejects unsafe dependency paths and noncanonical download URLs', () => {
  const artifact = lock.artifacts[0]
  assert.throws(
    () => validateDependencyLock({ ...lock, artifacts: [{ ...artifact, name: '../escape.jar' }] }),
    /artifact name/,
  )
  assert.throws(
    () =>
      validateDependencyLock({
        ...lock,
        artifacts: [{ ...artifact, url: 'https://example.test/a.jar' }],
      }),
    /Maven Central/,
  )
})

test('verifies cached or downloaded bytes by both size and hash', () => {
  const artifact = {
    name: 'example.jar',
    sizeBytes: 3,
    sha256: createHash('sha256').update('abc').digest('hex'),
  }
  assert.equal(verifyDependencyBytes(artifact, Buffer.from('abc')).toString(), 'abc')
  assert.throws(() => verifyDependencyBytes(artifact, Buffer.from('abd')), /SHA-256 mismatch/)
})

test('folds manifest lines to Java 72-byte limits with CRLF continuations', () => {
  const manifest = makeManifest(
    Array.from({ length: 8 }, (_, index) => ({ name: `long-runtime-dependency-${index}.jar` })),
  ).toString()
  assert.match(manifest, /\r\n \S/)
  assert.ok(manifest.endsWith('\r\n\r\n'))
  for (const line of manifest.split('\r\n').filter(Boolean))
    assert.ok(Buffer.byteLength(line) <= 72)
})

test('detects a changed thin jar from its recorded hash', () => {
  const bytes = Buffer.from('thin jar')
  const record = {
    path: path.posix.join('bin', 'PurpleWave.jar'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
  }
  assert.doesNotThrow(() => verifyRecordedFile(record, bytes))
  assert.throws(() => verifyRecordedFile(record, Buffer.from('thin jar!')), /Built file changed/)
})

test('only accepts a safe new output directory', () => {
  assert.equal(validateOutputDirectory('purplewave-release-1'), 'purplewave-release-1')
  assert.deepEqual(parseBuildArguments(['purplewave-release-1', 'C:\\JDK 21']), {
    outputDir: 'purplewave-release-1',
    javaHome: 'C:\\JDK 21',
  })
  for (const value of ['', '../escape', 'nested/path', 'CON', 'purple wave'])
    assert.throws(() => validateOutputDirectory(value), /safe directory name/)
})

test('writes deterministic JAR entries containing Scala dollar class names', async () => {
  const entries = [['Lifecycle/Main$.class', Buffer.from('bytecode')]]
  assert.deepEqual(await makeJar(entries), await makeJar([...entries].reverse()))
})
