import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import type { Candidate, Catalog } from './metadata.ts'
import { validate, validateRepository } from './validate.ts'

function readJson(path: URL): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError('Expected an object')
  return value
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError('Expected an array')
  return value
}

function packageOf(release: Record<string, unknown>): Record<string, unknown> {
  return record(release.package)
}

function botsOf(catalog: Record<string, unknown>): unknown[] {
  return array(catalog.bots)
}

function releasesOf(bot: unknown): unknown[] {
  return array(record(bot).releases)
}

function releaseAndCatalog(value: unknown): {
  catalog: Record<string, unknown>
  release: Record<string, unknown>
} {
  const catalog = record(value)
  const release = record(releasesOf(botsOf(catalog)[0])[0])
  return { catalog, release }
}

await test('checked-in source lock, candidates, and catalog validate', () => {
  assert.ok(validateRepository() > 0, 'repository must contain valid bot candidates')
})

await test('unknown schema versions and catalog fields are rejected', () => {
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

await test('source locks reject moving refs, path IDs, and duplicate IDs', () => {
  const source = {
    id: 'bot',
    repository: 'https://example.test/bot.git',
    revision: 'a'.repeat(40),
  }
  const lock = (sources: unknown[]): unknown => ({ schemaVersion: 1, sources })
  assert.throws(() => validate('sourceLock', lock([{ ...source, revision: 'main' }])))
  assert.throws(() => validate('sourceLock', lock([{ ...source, id: '../bot' }])))
  assert.throws(() => validate('sourceLock', lock([source, source])))
})

await test('catalog validates a complete release and rejects invalid publication', () => {
  const candidate: unknown = readJson(new URL('../bots/zzzkbot/bot.json', import.meta.url))
  validate('candidate', candidate)
  const pkg = {
    schemaVersion: 1,
    botId: candidate.bot.id,
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
    profile: candidate.profile,
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
  const catalog: unknown = {
    schemaVersion: 1,
    revision: 1,
    bots: [
      {
        bot: candidate.bot,
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
  const validModifications = structuredClone(catalog)
  validModifications.bots[0].releases[0].package.modifications = [
    {
      modifier: 'ShieldBattery',
      date: '2026-09-22',
      summary: 'Adds a compatibility setting.',
      scope: 'bot',
    },
  ]
  assert.doesNotThrow(() => validate('catalog', validModifications))

  const bad = (
    change: (release: Record<string, unknown>, catalog: Record<string, unknown>) => void,
  ) => {
    const copy: unknown = structuredClone(catalog)
    const { catalog: catalogRecord, release } = releaseAndCatalog(copy)
    change(release, catalogRecord)
    assert.throws(() => validate('catalog', copy))
  }
  for (const entrypoint of [
    '../bot.exe',
    '/bot.exe',
    'C:/bot.exe',
    'bin/../bot.exe',
    'bin\\bot.exe',
  ]) {
    bad(release => {
      record(packageOf(release).launch).entrypoint = entrypoint
    })
  }
  bad(release => {
    packageOf(release).modifications = [
      {
        modifier: 'ShieldBattery',
        date: '2026-09-22',
        summary: 'Adds a compatibility setting.',
        scope: 'unknown',
      },
    ]
  })
  bad(release => {
    packageOf(release).modifications = [
      { modifier: 'ShieldBattery', date: '2026-09-22', scope: 'bot' },
    ]
  })
  bad(release => {
    packageOf(release).modifications = [
      {
        modifier: 'ShieldBattery',
        date: '2026-09-22',
        summary: 'Adds a compatibility setting.',
        scope: 'bot',
        extra: true,
      },
    ]
  })
  bad(release => {
    record(record(packageOf(release).permissions).localDistribution).status = 'unreviewed'
  })
  bad(release => {
    record(packageOf(release).sourceReview).status = 'pending'
  })
  bad(release => {
    delete packageOf(release).sourceReview
  })
  bad(release => {
    packageOf(release).botId = 'other-bot'
  })
  bad(release => {
    const pkgRecord = packageOf(release)
    array(pkgRecord.sources).push(structuredClone(array(pkgRecord.sources)[0]))
  })
  bad(release => {
    const profile = record(packageOf(release).profile)
    array(profile.formats).push(structuredClone(array(profile.formats)[0]))
  })
  bad(release => {
    packageOf(release).runtime = { kind: 'java', major: 8, architecture: 'x86_64' }
  })
  bad(release => {
    record(release.artifact).sha256 = 'bad'
  })
  bad(release => {
    record(release.artifact).url = 'http://example.test/file.zip'
  })
  bad((_release, catalogRecord) => {
    botsOf(catalogRecord).push(structuredClone(botsOf(catalogRecord)[0]))
  })
  bad((_release, catalogRecord) => {
    releasesOf(botsOf(catalogRecord)[0]).push(
      structuredClone(releasesOf(botsOf(catalogRecord)[0])[0]),
    )
  })
})

await test('play-style vocabulary is enforced for candidates and published catalog entries', () => {
  const candidate: unknown = readJson(new URL('../bots/zzzkbot/bot.json', import.meta.url))
  const catalog: unknown = readJson(new URL('../catalog/catalog.json', import.meta.url))
  validate('candidate', candidate)
  validate('catalog', catalog)
  const schema = record(readJson(new URL('../schemas/metadata.schema.json', import.meta.url)))
  const definitions = record(schema.$defs)
  const botDefinition = record(definitions.bot)
  const properties = record(botDefinition.properties)
  const playStyleTags = record(properties.playStyleTags)
  const items = record(playStyleTags.items)
  const tags = array(items.enum).map(tag => {
    assert.equal(typeof tag, 'string')
    return tag
  })
  assert.ok(tags.length > 0)
  assert.equal(new Set(tags).size, tags.length)
  const fixtures: Array<{
    kind: 'candidate' | 'catalog'
    fixture: Candidate | Catalog
    identity: Record<string, unknown>
  }> = [
    { kind: 'candidate', fixture: candidate, identity: record(candidate.bot) },
    { kind: 'catalog', fixture: catalog, identity: record(catalog.bots[0].bot) },
  ]
  for (const { kind, fixture, identity } of fixtures) {
    for (const allowed of [[], ['cheese', 'bio'], ...tags.map(tag => [tag])]) {
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

await test('candidate metadata supports Java x64 without claiming prototype verification', () => {
  const bot: unknown = readJson(new URL('../bots/purplewave/bot.json', import.meta.url))
  validate('candidate', bot)
  bot.compatibility.status = 'unverified'
  bot.compatibility.botArchitecture = 'x86_64'
  assert.doesNotThrow(() => validate('candidate', bot))
  record(bot.compatibility).botArchitecture = 'arm64'
  assert.throws(() => validate('candidate', bot))
})
