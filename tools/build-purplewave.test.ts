import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  makeJar,
  makeManifest,
  parseBuildArguments,
  sanitizeJavaProperties,
  validateDependencyLock,
  validateOutputDirectory,
  verifyDependencyBytes,
  verifyRecordedFile,
} from './build-purplewave.ts'

const lock = JSON.parse(
  await readFile(new URL('../jvm/dependencies.json', import.meta.url), 'utf8'),
)

await test('records only safe Java toolchain properties', () => {
  const properties = sanitizeJavaProperties(
    [
      'Property settings:',
      '    java.version = 21.0.11',
      '    java.vendor = Eclipse Adoptium',
      '    java.vm.name = OpenJDK 64-Bit Server VM',
      '    java.vm.version = 21.0.11+9',
      '    os.arch = amd64',
      '    sun.arch.data.model = 64',
      '    user.home = C:\\Users\\Travis',
      '    user.name = Travis',
      '    user.dir = C:\\Users\\Travis\\Documents\\Projects\\robotics-facility',
      '    PATH = C:\\Users\\Travis\\bin',
    ].join('\n'),
  )
  assert.deepEqual(properties, {
    javaVersion: '21.0.11',
    javaVendor: 'Eclipse Adoptium',
    javaVmName: 'OpenJDK 64-Bit Server VM',
    javaVmVersion: '21.0.11+9',
    osArchitecture: 'amd64',
    dataModel: '64',
  })
  assert.doesNotMatch(JSON.stringify(properties), /Travis|robotics-facility|PATH/)
})

await test('accepts the locked Maven Central dependency set', () => {
  assert.strictEqual(validateDependencyLock(lock), lock)
})

await test('rejects unsafe dependency paths and noncanonical download URLs', () => {
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

await test('verifies cached or downloaded bytes by both size and hash', () => {
  const artifact = {
    name: 'example.jar',
    sizeBytes: 3,
    sha256: createHash('sha256').update('abc').digest('hex'),
  }
  assert.equal(verifyDependencyBytes(artifact, Buffer.from('abc')).toString(), 'abc')
  assert.throws(() => verifyDependencyBytes(artifact, Buffer.from('abd')), /SHA-256 mismatch/)
})

await test('folds manifest lines to Java 72-byte limits with CRLF continuations', () => {
  const manifest = makeManifest(
    Array.from({ length: 8 }, (_, index) => ({ name: `long-runtime-dependency-${index}.jar` })),
  ).toString()
  assert.match(manifest, /\r\n \S/)
  assert.ok(manifest.endsWith('\r\n\r\n'))
  for (const line of manifest.split('\r\n').filter(Boolean))
    assert.ok(Buffer.byteLength(line) <= 72)
})

await test('detects a changed thin jar from its recorded hash', () => {
  const bytes = Buffer.from('thin jar')
  const record = {
    path: path.posix.join('bin', 'PurpleWave.jar'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
  }
  assert.doesNotThrow(() => verifyRecordedFile(record, bytes))
  assert.throws(() => verifyRecordedFile(record, Buffer.from('thin jar!')), /Built file changed/)
})

await test('only accepts a safe new output directory', () => {
  assert.equal(validateOutputDirectory('purplewave-release-1'), 'purplewave-release-1')
  assert.deepEqual(parseBuildArguments(['purplewave-release-1', 'C:\\JDK 21']), {
    outputDir: 'purplewave-release-1',
    javaHome: 'C:\\JDK 21',
  })
  for (const value of ['', '../escape', 'nested/path', 'CON', 'purple wave'])
    assert.throws(() => validateOutputDirectory(value), /safe directory name/)
})

await test('writes deterministic JAR entries containing Scala dollar class names', async () => {
  const entries: [string, Buffer][] = [['Lifecycle/Main$.class', Buffer.from('bytecode')]]
  assert.deepEqual(await makeJar(entries), await makeJar([...entries].reverse()))
})
