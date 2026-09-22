import test from 'node:test'
import assert from 'node:assert/strict'
import { makeArchive } from './package-zzzkbot.mjs'
import { sha256 } from './publication-archive.mjs'
import yauzl from 'yauzl'

test('package archive is deterministic across input order and preserves empty profile directories', async () => {
  const entries = [
    ['work/bwapi-data/write/', Buffer.alloc(0)],
    ['bin/bot.exe', Buffer.from('fixture')],
  ]
  const first = await makeArchive(entries)
  const second = await makeArchive([...entries].reverse())
  assert.equal(sha256(first), sha256(second))
  const names = await new Promise((resolve, reject) => {
    yauzl.fromBuffer(first, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error)
      const result = []
      zip.on('entry', (entry) => {
        result.push(entry.fileName)
        zip.readEntry()
      })
      zip.on('end', () => resolve(result))
      zip.on('error', reject)
      zip.readEntry()
    })
  })
  assert.deepEqual(names, ['bin/bot.exe', 'work/bwapi-data/write/'])
})

test('package archive rejects unsafe and case-colliding source paths', async () => {
  await assert.rejects(makeArchive([['../outside', Buffer.from('x')]]), /unsafe/)
  await assert.rejects(
    makeArchive([
      ['LICENSE', Buffer.from('x')],
      ['license', Buffer.from('y')],
    ]),
    /Duplicate/,
  )
})
