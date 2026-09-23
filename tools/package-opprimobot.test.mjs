import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { makeArchive } from './package-zzzkbot.mjs'
import { verifiedBoostFiles } from './package-opprimobot.mjs'
import { sha256 } from './publication-archive.mjs'

const originals = {
  'LICENSE_1_0.txt': Buffer.from('Boost license fixture'),
  'boost/geometry.hpp': Buffer.from('#pragma once\n// geometry fixture\n'),
}

async function fixture(t, { archiveFiles = originals, extractedFiles = originals, mutateArchive } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'opprimobot-boost-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const deps = path.join(directory, 'deps')
  const headers = path.join(deps, 'boost_1_56_0')
  await mkdir(headers, { recursive: true })
  const inventory = Object.entries(extractedFiles).map(([name, bytes]) => ({
    path: name,
    sha256: sha256(bytes),
    sizeBytes: bytes.length,
  }))
  for (const [name, bytes] of Object.entries(extractedFiles)) {
    const file = path.join(headers, ...name.split('/'))
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, bytes)
  }
  const inventoryBytes = Buffer.from(JSON.stringify({ schemaVersion: 1, files: inventory }) + '\n')
  await writeFile(path.join(deps, 'boost-header-inventory.json'), inventoryBytes)
  let archive = await makeArchive(Object.entries(archiveFiles).map(([name, bytes]) => [
    'boost_1_56_0/' + name, bytes,
  ]))
  if (mutateArchive) archive = mutateArchive(archive)
  await writeFile(path.join(deps, 'boost_1_56_0.zip'), archive)
  const artifact = {
    name: 'boost_1_56_0.zip',
    url: 'https://example.invalid/boost_1_56_0.zip',
    sha256: sha256(archive),
    sizeBytes: archive.length,
  }
  const boost = {
    directory: 'deps/boost_1_56_0',
    archive: artifact,
    files: inventory,
    inventory: 'deps/boost-header-inventory.json',
    inventorySha256: sha256(inventoryBytes),
    headerCount: inventory.length - 1,
    extractedBytes: inventory.reduce((sum, file) => sum + file.sizeBytes, 0),
  }
  const lock = { schemaVersion: 1, artifacts: [artifact] }
  return { directory, boost, lock }
}

function replaceZipName(bytes, before, after) {
  assert.equal(before.length, after.length)
  const changed = Buffer.from(bytes)
  let offset = 0
  let count = 0
  while ((offset = changed.indexOf(before, offset)) !== -1) {
    changed.write(after, offset, 'ascii')
    offset += after.length
    count += 1
  }
  assert.equal(count, 2)
  return changed
}

test('pinned Boost archive matches extracted header inventory', async t => {
  const { directory, boost, lock } = await fixture(t)
  const files = await verifiedBoostFiles(directory, boost, lock)
  assert.deepEqual(files, Object.entries(originals))
})

test('rewritten inventory cannot hide a header differing from the pinned ZIP', async t => {
  const extractedFiles = {
    ...originals,
    'boost/geometry.hpp': Buffer.from('#pragma once\n// altered geometry\n'),
  }
  const { directory, boost, lock } = await fixture(t, { extractedFiles })
  await assert.rejects(verifiedBoostFiles(directory, boost, lock), /archive header differs/)
})

test('inventory must contain every selected header in the pinned ZIP', async t => {
  const archiveFiles = { ...originals, 'boost/extra.hpp': Buffer.from('// extra\n') }
  const { directory, boost, lock } = await fixture(t, { archiveFiles })
  await assert.rejects(verifiedBoostFiles(directory, boost, lock), /archive and header inventory differ/)
})

test('unsafe entry in a pinned ZIP is rejected', async t => {
  const archiveFiles = { ...originals, 'boost/a.hpp': Buffer.from('// unsafe\n') }
  const { directory, boost, lock } = await fixture(t, {
    archiveFiles,
    mutateArchive: bytes => replaceZipName(
      bytes,
      'boost_1_56_0/boost/a.hpp',
      'boost_1_56_0/../xx/a.hpp',
    ),
  })
  await assert.rejects(verifiedBoostFiles(directory, boost, lock), /Unsafe Boost archive path|invalid relative path/i)
})