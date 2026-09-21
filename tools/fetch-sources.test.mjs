import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { SourceFetchError, fetchSources, parseArguments } from './fetch-sources.mjs'

function git(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, shell: false, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (data) => {
      stdout += data
    })
    child.stderr.on('data', (data) => {
      stderr += data
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new Error(`git ${args.join(' ')} failed: ${stderr || stdout}`))
      }
    })
  })
}

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'robotics-facility-fetch-test-'))
  const research = path.join(root, 'research-bwapi')
  await git(['init', research])
  await git(['-C', research, 'config', 'user.name', 'Test User'])
  await git(['-C', research, 'config', 'user.email', 'test@example.invalid'])
  await writeFile(path.join(research, 'README.md'), 'first revision\n')
  await git(['-C', research, 'add', 'README.md'])
  await git(['-C', research, 'commit', '-m', 'initial'])
  const firstRevision = await git(['-C', research, 'rev-parse', 'HEAD'])
  await writeFile(path.join(research, 'README.md'), 'second revision\n')
  await git(['-C', research, 'commit', '-am', 'second'])
  const secondRevision = await git(['-C', research, 'rev-parse', 'HEAD'])
  return { root, research, firstRevision, secondRevision }
}

async function writeLock(root, revision, source = {}) {
  await writeFile(
    path.join(root, 'source-lock.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      sources: [
        {
          id: 'bwapi',
          repository: 'https://github.com/bwapi/bwapi.git',
          revision,
          ...source,
        },
      ],
    })}\n`,
  )
}

async function withFixture(callback) {
  const fixture = await makeFixture()
  try {
    await callback(fixture)
  } finally {
    const tempRoot = path.resolve(tmpdir())
    const fixtureRoot = path.resolve(fixture.root)
    const relative = path.relative(tempRoot, fixtureRoot)
    assert.ok(relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
    assert.ok(path.basename(fixtureRoot).startsWith('robotics-facility-fetch-test-'))
    await rm(fixtureRoot, { recursive: true, force: true })
  }
}

test('fetches a pinned source from a local clone and records its canonical origin', async () => {
  await withFixture(async ({ root, research, firstRevision }) => {
    await writeLock(root, firstRevision)

    const result = await fetchSources({ rootDir: root, from: new Map([['bwapi', research]]) })
    const destination = path.join(root, '.sources', 'bwapi')

    assert.deepEqual(result, { fetched: ['bwapi'], reused: [] })
    assert.equal(await git(['-C', destination, 'rev-parse', 'HEAD']), firstRevision)
    assert.equal(
      await git(['-C', destination, 'remote', 'get-url', 'origin']),
      'https://github.com/bwapi/bwapi.git',
    )
    assert.equal((await stat(destination)).isDirectory(), true)
    assert.equal(await readFile(path.join(research, 'README.md'), 'utf8'), 'second revision\n')
  })
})

test('refuses an existing dirty checkout and a clean checkout at another revision', async () => {
  await withFixture(async ({ root, research, firstRevision, secondRevision }) => {
    await writeLock(root, firstRevision)
    await fetchSources({ rootDir: root, from: new Map([['bwapi', research]]) })
    const destination = path.join(root, '.sources', 'bwapi')

    await writeFile(path.join(destination, 'untracked-local-edit.txt'), 'local edit\n')
    await assert.rejects(
      fetchSources({ rootDir: root, from: new Map([['bwapi', research]]) }),
      (error) => error instanceof SourceFetchError && /dirty/.test(error.message),
    )

    await unlink(path.join(destination, 'untracked-local-edit.txt'))
    await git(['-C', destination, 'checkout', '--detach', secondRevision])
    await assert.rejects(
      fetchSources({ rootDir: root, from: new Map([['bwapi', research]]) }),
      (error) => error instanceof SourceFetchError && /not locked revision/.test(error.message),
    )
  })
})

test('rejects an escaping source id before creating .sources', async () => {
  await withFixture(async ({ root, firstRevision }) => {
    await writeLock(root, firstRevision, { id: '../escape' })

    await assert.rejects(fetchSources({ rootDir: root }), /Invalid source id/)
    await assert.rejects(stat(path.join(root, '.sources')), { code: 'ENOENT' })
  })
})

test('refuses an existing checkout whose origin is not the canonical lock repository', async () => {
  await withFixture(async ({ root, research, firstRevision }) => {
    await writeLock(root, firstRevision)
    await fetchSources({ rootDir: root, from: new Map([['bwapi', research]]) })
    const destination = path.join(root, '.sources', 'bwapi')
    await git(['-C', destination, 'remote', 'set-url', 'origin', research])

    await assert.rejects(
      fetchSources({ rootDir: root, from: new Map([['bwapi', research]]) }),
      (error) => error instanceof SourceFetchError && /canonical repository/.test(error.message),
    )
  })
})

test('reuses a clean, pinned source checkout without changing it', async () => {
  await withFixture(async ({ root, research, firstRevision }) => {
    await writeLock(root, firstRevision)
    await fetchSources({ rootDir: root, from: new Map([['bwapi', research]]) })

    const result = await fetchSources({ rootDir: root, from: new Map([['bwapi', research]]) })

    assert.deepEqual(result, { fetched: [], reused: ['bwapi'] })
  })
})

test('rejects malformed and unknown --from overrides before any clone', async () => {
  assert.throws(() => parseArguments(['--unknown']), /Unknown or malformed argument/)
  assert.throws(() => parseArguments(['--from']), /requires id=absolute-local-repo-path/)
  assert.throws(
    () => parseArguments(['--from', 'bwapi=relative-path']),
    /valid source id and an absolute/,
  )

  await withFixture(async ({ root, firstRevision }) => {
    await writeLock(root, firstRevision)
    await assert.rejects(
      fetchSources({ rootDir: root, from: new Map([['unknown-source', root]]) }),
      /unknown source/,
    )
    await assert.rejects(stat(path.join(root, '.sources')), { code: 'ENOENT' })
  })
})

test('rejects .sources and source destinations that are symbolic links or junctions', async () => {
  await withFixture(async ({ root, firstRevision }) => {
    await writeLock(root, firstRevision)
    const externalSources = path.join(root, 'external-sources')
    const sourcesRoot = path.join(root, '.sources')
    await mkdir(externalSources)
    await symlink(externalSources, sourcesRoot, process.platform === 'win32' ? 'junction' : 'dir')

    await assert.rejects(fetchSources({ rootDir: root }), /symbolic link or junction/)
    await unlink(sourcesRoot)

    await mkdir(sourcesRoot)
    const externalDestination = path.join(root, 'external-bwapi')
    await mkdir(externalDestination)
    await symlink(
      externalDestination,
      path.join(sourcesRoot, 'bwapi'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )

    await assert.rejects(fetchSources({ rootDir: root }), /symbolic link or junction/)
  })
})

test('requires at least one safe source id', async () => {
  await withFixture(async ({ root, firstRevision }) => {
    await writeFile(
      path.join(root, 'source-lock.json'),
      JSON.stringify({ schemaVersion: 1, sources: [] }),
    )
    await assert.rejects(fetchSources({ rootDir: root }), /sources array/)

    await writeLock(root, firstRevision, { id: 'con' })
    await assert.rejects(fetchSources({ rootDir: root }), /Invalid source id/)
  })
})
