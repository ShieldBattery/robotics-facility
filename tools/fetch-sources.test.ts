import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

import { fetchSources, parseArguments, SourceFetchError } from './fetch-sources.ts'

function git(args: readonly string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, shell: false, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (data: string) => {
      stdout += data
    })
    child.stderr.on('data', (data: string) => {
      stderr += data
    })
    child.on('error', reject)
    child.on('close', code => {
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

async function writeLock(root: string, revision: string, source: Record<string, unknown> = {}) {
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

async function withFixture(
  callback: (fixture: Awaited<ReturnType<typeof makeFixture>>) => Promise<void>,
): Promise<void> {
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

async function withCanonicalOrigin(
  root: string,
  upstream: string,
  callback: () => Promise<void>,
): Promise<void> {
  const configPath = path.join(root, 'gitconfig')
  const previousConfig = process.env.GIT_CONFIG_GLOBAL
  await writeFile(
    configPath,
    `[url ${JSON.stringify(pathToFileURL(upstream).href)}]\n\tinsteadOf = https://github.com/bwapi/bwapi.git\n`,
  )
  process.env.GIT_CONFIG_GLOBAL = configPath
  try {
    await callback()
  } finally {
    if (previousConfig === undefined) {
      delete process.env.GIT_CONFIG_GLOBAL
    } else {
      process.env.GIT_CONFIG_GLOBAL = previousConfig
    }
  }
}

await test('fetches a pinned source from a local clone and records its canonical origin', async () => {
  await withFixture(async ({ root, research, firstRevision }) => {
    await writeLock(root, firstRevision)

    const result = await fetchSources({ rootDir: root, from: new Map([['bwapi', research]]) })
    const destination = path.join(root, '.sources', 'bwapi')

    assert.deepEqual(result, { fetched: ['bwapi'], reused: [] })
    assert.equal(await git(['-C', destination, 'rev-parse', 'HEAD']), firstRevision)
    assert.equal(
      await git(['-C', destination, 'config', '--get', 'remote.origin.url']),
      'https://github.com/bwapi/bwapi.git',
    )
    assert.equal((await stat(destination)).isDirectory(), true)
    assert.equal(await readFile(path.join(research, 'README.md'), 'utf8'), 'second revision\n')
  })
})

await test('fetches an unadvertised pinned commit from the canonical origin without changing its seed', async () => {
  await withFixture(async ({ root, research, secondRevision }) => {
    const seed = path.join(root, 'seed')
    const upstream = path.join(root, 'upstream.git')
    await git(['clone', '--no-hardlinks', research, seed])
    await git(['clone', '--bare', research, upstream])
    await git(['-C', upstream, 'config', 'core.logAllRefUpdates', 'true'])
    await git(['-C', upstream, 'config', 'uploadpack.allowAnySHA1InWant', 'true'])

    await writeFile(path.join(research, 'README.md'), 'unadvertised revision\n')
    await git(['-C', research, 'commit', '-am', 'unadvertised'])
    const pinnedRevision = await git(['-C', research, 'rev-parse', 'HEAD'])
    await git(['-C', research, 'push', upstream, 'HEAD:refs/hidden/pin'])
    await git(['-C', research, 'push', upstream, ':refs/hidden/pin'])
    assert.doesNotMatch(await git(['-C', upstream, 'show-ref']), new RegExp(pinnedRevision))

    await writeLock(root, pinnedRevision)
    await withCanonicalOrigin(root, upstream, async () => {
      const result = await fetchSources({ rootDir: root, from: new Map([['bwapi', seed]]) })
      const destination = path.join(root, '.sources', 'bwapi')

      assert.deepEqual(result, { fetched: ['bwapi'], reused: [] })
      assert.equal(await git(['-C', destination, 'rev-parse', 'HEAD']), pinnedRevision)
      assert.equal(
        await git(['-C', destination, 'config', '--get', 'remote.origin.url']),
        'https://github.com/bwapi/bwapi.git',
      )
      assert.doesNotMatch(await git(['-C', destination, 'show-ref']), new RegExp(pinnedRevision))
      assert.deepEqual(await fetchSources({ rootDir: root, from: new Map([['bwapi', seed]]) }), {
        fetched: [],
        reused: ['bwapi'],
      })
    })

    assert.equal(await git(['-C', seed, 'rev-parse', 'HEAD']), secondRevision)
    assert.equal(await git(['-C', seed, 'status', '--porcelain=v1', '--untracked-files=all']), '')
  })
})

await test('refuses an existing dirty checkout and a clean checkout at another revision', async () => {
  await withFixture(async ({ root, research, firstRevision, secondRevision }) => {
    await writeLock(root, firstRevision)
    await fetchSources({ rootDir: root, from: new Map([['bwapi', research]]) })
    const destination = path.join(root, '.sources', 'bwapi')

    await writeFile(path.join(destination, 'untracked-local-edit.txt'), 'local edit\n')
    await assert.rejects(
      fetchSources({ rootDir: root, from: new Map([['bwapi', research]]) }),
      error => error instanceof SourceFetchError && /dirty/.test(error.message),
    )

    await unlink(path.join(destination, 'untracked-local-edit.txt'))
    await git(['-C', destination, 'checkout', '--detach', secondRevision])
    await assert.rejects(
      fetchSources({ rootDir: root, from: new Map([['bwapi', research]]) }),
      error => error instanceof SourceFetchError && /not locked revision/.test(error.message),
    )
  })
})

await test('rejects an escaping source id before creating .sources', async () => {
  await withFixture(async ({ root, firstRevision }) => {
    await writeLock(root, firstRevision, { id: '../escape' })

    await assert.rejects(fetchSources({ rootDir: root }), /Invalid source id/)
    await assert.rejects(stat(path.join(root, '.sources')), { code: 'ENOENT' })
  })
})

await test('refuses an existing checkout whose origin is not the canonical lock repository', async () => {
  await withFixture(async ({ root, research, firstRevision }) => {
    await writeLock(root, firstRevision)
    await fetchSources({ rootDir: root, from: new Map([['bwapi', research]]) })
    const destination = path.join(root, '.sources', 'bwapi')
    await git(['-C', destination, 'remote', 'set-url', 'origin', research])

    await assert.rejects(
      fetchSources({ rootDir: root, from: new Map([['bwapi', research]]) }),
      error => error instanceof SourceFetchError && /canonical repository/.test(error.message),
    )
  })
})

await test('reuses a clean, pinned source checkout without changing it', async () => {
  await withFixture(async ({ root, research, firstRevision }) => {
    await writeLock(root, firstRevision)
    await fetchSources({ rootDir: root, from: new Map([['bwapi', research]]) })

    const result = await fetchSources({ rootDir: root, from: new Map([['bwapi', research]]) })

    assert.deepEqual(result, { fetched: [], reused: ['bwapi'] })
  })
})

await test('rejects malformed and unknown --from overrides before any clone', async () => {
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

await test('rejects .sources and source destinations that are symbolic links or junctions', async () => {
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

await test('requires at least one safe source id', async () => {
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
