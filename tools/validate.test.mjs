import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { validate, validateRepository } from './validate.mjs'

test('checked-in source lock, candidates, and empty catalog validate', () => {
  assert.equal(validateRepository(), 2)
})
test('unknown schema versions and catalog fields are rejected', () => {
  assert.throws(() => validate('catalog', { schemaVersion: 2, revision: 0, bots: [] }))
  assert.throws(() =>
    validate('catalog', {
      schemaVersion: 1,
      revision: 0,
      bots: [],
      installed: [],
    }),
  )
})
test('source locks reject moving refs, path IDs, and duplicate IDs', () => {
  const source = {
    id: 'bot',
    repository: 'https://example.test/bot.git',
    revision: 'a'.repeat(40),
  }
  const lock = (sources) => ({ schemaVersion: 1, sources })
  assert.throws(() => validate('sourceLock', lock([{ ...source, revision: 'main' }])))
  assert.throws(() => validate('sourceLock', lock([{ ...source, id: '../bot' }])))
  assert.throws(() => validate('sourceLock', lock([source, source])))
})
test('catalog validates a complete release and rejects invalid publication', () => {
  const bot = JSON.parse(readFileSync(new URL('../bots/zzzkbot/bot.json', import.meta.url), 'utf8'))
  const pkg = {
    schemaVersion: 1,
    botId: bot.bot.id,
    releaseId: 'fixture-1',
    version: 'test-only',
    build: {
      recipeSource: {
        id: 'recipe',
        repository: 'https://example.test/recipes.git',
        revision: 'd'.repeat(40),
      },
      recipePath: 'build.cmake',
      toolchain: 'Test fixture only',
    },
    platform: { os: 'windows', architecture: 'x86' },
    runtime: { kind: 'native' },
    launch: { entrypoint: 'bin/bot.exe', arguments: [], workingDirectory: '.' },
    profile: bot.profile,
    bwapi: {
      version: '4.4.0',
      protocol: 10003,
      minimumBridgeVersion: 'test-fixture',
    },
    sources: [
      {
        id: 'bot',
        repository: 'https://example.test/bot.git',
        revision: 'a'.repeat(40),
      },
    ],
    licenses: [{ name: 'Fixture', noticePath: 'notices/LICENSE.txt' }],
    permissions: {
      localDistribution: { status: 'approved', evidence: 'Test fixture only' },
      publicCompetition: {
        status: 'unreviewed',
        evidence: 'Test fixture only',
      },
    },
    writableDirectories: ['bwapi-data/write'],
  }
  const catalog = {
    schemaVersion: 1,
    revision: 1,
    bots: [
      {
        bot: bot.bot,
        releases: [
          {
            package: pkg,
            artifact: {
              url: 'https://example.test/fixture.zip',
              sha256: 'b'.repeat(64),
              sizeBytes: 1,
              manifestSha256: 'c'.repeat(64),
              format: 'zip',
            },
          },
        ],
      },
    ],
  }
  validate('catalog', catalog)
  const bad = (change) => {
    const copy = structuredClone(catalog)
    change(copy.bots[0].releases[0], copy)
    assert.throws(() => validate('catalog', copy))
  }
  for (const path of ['../bot.exe', '/bot.exe', 'C:/bot.exe', 'bin/../bot.exe', 'bin\\bot.exe']) {
    bad((r) => {
      r.package.launch.entrypoint = path
    })
  }
  bad((r) => {
    r.package.permissions.localDistribution.status = 'unreviewed'
  })
  bad((r) => {
    r.package.botId = 'other-bot'
  })
  bad((r) => {
    r.package.sources.push(structuredClone(r.package.sources[0]))
  })
  bad((r) => {
    r.package.profile.formats.push(structuredClone(r.package.profile.formats[0]))
  })
  bad((r) => {
    r.package.runtime = { kind: 'java', major: 8, architecture: 'x86_64' }
  })
  bad((r) => {
    r.artifact.sha256 = 'bad'
  })
  bad((r) => {
    r.artifact.url = 'http://example.test/file.zip'
  })
  bad((r, c) => {
    c.bots.push(structuredClone(c.bots[0]))
  })
  bad((r, c) => {
    c.bots[0].releases.push(structuredClone(r))
  })
})
