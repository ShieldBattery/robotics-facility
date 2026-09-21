import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm, lstat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { prepareSource, provenanceName } from './prepare-source.mjs'
import { runGit, validateSourceLock } from './fetch-sources.mjs'

const diff = (before, after) =>
  Buffer.from(`diff --git a/data.txt b/data.txt
--- a/data.txt
+++ b/data.txt
@@ -1 +1 @@
-${before}
+${after}
`)

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'robotics-patches-'))
  t.after(async () => {
    const relative = path.relative(path.resolve(tmpdir()), path.resolve(root))
    assert.ok(
      relative &&
        relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative),
    )
    assert.ok(path.basename(root).startsWith('robotics-patches-'))
    await rm(root, { recursive: true, force: true })
  })
  const src = path.join(root, '.sources', 'bot')
  await mkdir(src, { recursive: true })
  await runGit(['init', src])
  for (const [key, value] of [
    ['user.name', 'Test'],
    ['user.email', 'test@example.invalid'],
    ['core.autocrlf', 'false'],
  ]) {
    await runGit(['-C', src, 'config', key, value])
  }
  await writeFile(path.join(src, 'data.txt'), 'alpha\n')
  await runGit(['-C', src, 'add', 'data.txt'])
  await runGit(['-C', src, 'commit', '-m', 'Fixture'])
  const revision = await runGit(['-C', src, 'rev-parse', 'HEAD'])
  const repository = 'https://example.test/bot.git'
  await runGit(['-C', src, 'remote', 'add', 'origin', repository])
  const source = { id: 'bot', repository, revision, patches: [] }
  const save = () =>
    writeFile(
      path.join(root, 'source-lock.json'),
      JSON.stringify({ schemaVersion: 1, sources: [source] }),
    )
  await save()
  await mkdir(path.join(root, 'patches', 'bot'), { recursive: true })
  const patch = async (name, bytes) => {
    const relative = `patches/bot/${name}.patch`
    await writeFile(path.join(root, relative), bytes)
    source.patches.push({
      path: relative,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
    await save()
  }
  const prepare = (outputDir = '.build/bot') =>
    prepareSource({ rootDir: root, sourceId: 'bot', outputDir })
  return { root, src, source, save, patch, prepare }
}

test('applies patches in order and records the resulting tree without modifying upstream', async (t) => {
  const f = await fixture(t)
  await f.patch('001-first', diff('alpha', 'beta'))
  await f.patch('002-second', diff('beta', 'gamma'))
  const record = await f.prepare()
  const out = path.join(f.root, '.build', 'bot')
  assert.equal(await readFile(path.join(out, 'data.txt'), 'utf8'), 'gamma\n')
  assert.equal(await readFile(path.join(f.src, 'data.txt'), 'utf8'), 'alpha\n')
  assert.equal(await runGit(['-C', f.src, 'status', '--porcelain']), '')
  assert.equal(await runGit(['-C', out, 'rev-parse', 'HEAD']), f.source.revision)
  assert.equal(await runGit(['-C', out, 'show', `${record.tree}:data.txt`]), 'gamma')
  assert.deepEqual(JSON.parse(await readFile(path.join(out, provenanceName), 'utf8')), record)
  assert.deepEqual(record.source.patches, f.source.patches)
  await assert.rejects(f.prepare(), /already exists/)
})

test('rejects mismatched hashes and wrong base before creating output', async (t) => {
  const f = await fixture(t)
  await f.patch('change', diff('alpha', 'beta'))
  const file = path.join(f.root, f.source.patches[0].path)
  await writeFile(file, diff('alpha', 'tampered'))
  await assert.rejects(f.prepare(), /hash mismatch/)
  await assert.rejects(lstat(path.join(f.root, '.build')), { code: 'ENOENT' })
  await writeFile(file, diff('alpha', 'beta'))
  f.source.revision = 'a'.repeat(40)
  await f.save()
  await assert.rejects(f.prepare(), /not locked revision/)
})

test('a nonapplicable patch leaves no success marker', async (t) => {
  const f = await fixture(t)
  await f.patch('wrong-context', diff('absent', 'beta'))
  await assert.rejects(f.prepare(), /Preparation failed/)
  await assert.rejects(lstat(path.join(f.root, '.build', 'bot', provenanceName)), {
    code: 'ENOENT',
  })
  assert.equal(await readFile(path.join(f.src, 'data.txt'), 'utf8'), 'alpha\n')
})

test('refuses output escapes and linked ancestors', async (t) => {
  const f = await fixture(t)
  await assert.rejects(f.prepare('../escape'), /under .build/)
  await assert.rejects(f.prepare('.build'), /under .build/)
  await assert.rejects(f.prepare('.build/con'), /under .build/)
  const external = path.join(f.root, 'elsewhere')
  await mkdir(external)
  await symlink(
    external,
    path.join(f.root, '.build'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  await assert.rejects(f.prepare(), /symbolic link or junction/)
})

test('refuses unsafe patch paths, duplicates, and linked patch directories', async (t) => {
  const f = await fixture(t)
  await f.patch('change', diff('alpha', 'beta'))
  const lock = (patches) => ({ schemaVersion: 1, sources: [{ ...f.source, patches }] })
  assert.throws(() =>
    validateSourceLock(lock([{ ...f.source.patches[0], path: '../change.patch' }])),
  )
  assert.throws(() => validateSourceLock(lock([f.source.patches[0], f.source.patches[0]])))
  const target = path.join(f.root, 'patch-target')
  await mkdir(target)
  const linkedDir = path.join(f.root, 'patches', 'linked')
  await symlink(target, linkedDir, process.platform === 'win32' ? 'junction' : 'dir')
  // A source with a linked patch directory must be rejected before reading its bytes.
  await assert.rejects(
    import('./prepare-source.mjs').then(({ readPatches }) =>
      readPatches(f.root, {
        patches: [{ path: 'patches/linked/change.patch', sha256: 'a'.repeat(64) }],
      }),
    ),
    /symbolic link or junction/,
  )
})

test('empty patch sets preserve the exact upstream tree', async (t) => {
  const f = await fixture(t)
  const record = await f.prepare()
  assert.equal(record.tree, await runGit(['-C', f.src, 'rev-parse', 'HEAD^{tree}']))
  assert.deepEqual(record.source.patches, [])
})
