import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { validate, validateRepository } from './validate.mjs'

test('checked-in source lock, candidates, and catalog validate', () => {
  assert.equal(validateRepository(), 3)
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
    sourceReview: { status: 'approved', evidence: 'Test fixture only; no artifact approval' },
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
    r.package.sourceReview.status = 'pending'
  })
  bad((r) => {
    delete r.package.sourceReview
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

test('play-style vocabulary is enforced for candidates and published catalog entries', () => {
  const candidate = JSON.parse(
    readFileSync(new URL('../bots/zzzkbot/bot.json', import.meta.url), 'utf8'),
  )
  const catalog = JSON.parse(
    readFileSync(new URL('../catalog/catalog.json', import.meta.url), 'utf8'),
  )
  const schema = JSON.parse(
    readFileSync(new URL('../schemas/metadata.schema.json', import.meta.url), 'utf8'),
  )
  const tags = schema.$defs.bot.properties.playStyleTags.items.enum
  assert.ok(tags.length > 0)
  assert.equal(new Set(tags).size, tags.length)
  for (const [kind, fixture, identity] of [
    ['candidate', candidate, candidate.bot],
    ['catalog', catalog, catalog.bots[0].bot],
  ]) {
    for (const allowed of [[], ['cheese', 'bio'], ...tags.map((tag) => [tag])]) {
      identity.playStyleTags = allowed
      assert.doesNotThrow(() => validate(kind, fixture))
    }
    for (const rejected of [
      ['invented-strategy'],
      ['rush'],
      ['Cheese'],
      ['cheese', 'cheese'],
      ['cheese', 'learns'],
      ['cheese', 'terran'],
      ['beginner-friendly'],
      [null],
      'cheese',
    ]) {
      identity.playStyleTags = rejected
      assert.throws(() => validate(kind, fixture), /playStyleTags/)
    }
  }
})

test('candidate metadata supports Java x64 without claiming prototype verification', () => {
  const bot = JSON.parse(
    readFileSync(new URL('../bots/purplewave/bot.json', import.meta.url), 'utf8'),
  )
  bot.compatibility.status = 'unverified'
  bot.compatibility.botArchitecture = 'x86_64'
  assert.doesNotThrow(() => validate('candidate', bot))
  bot.compatibility.botArchitecture = 'arm64'
  assert.throws(() => validate('candidate', bot))
})
