import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  selectAssSources,
  validateInfestedDependencySet,
  validateOutputName,
} from './build-infested-artosis.ts'

const lock = JSON.parse(
  await readFile(new URL('../jvm/infested-artosis-dependencies.json', import.meta.url), 'utf8'),
)

await test('locks only the four required Java artifacts with JNA as runtime', () => {
  const artifacts = validateInfestedDependencySet(lock)
  assert.deepEqual(
    artifacts.filter(artifact => artifact.runtime).map(artifact => artifact.name),
    ['jna-5.18.1.jar', 'jna-platform-5.18.1.jar'],
  )
  assert.throws(
    () =>
      validateInfestedDependencySet({
        ...lock,
        artifacts: lock.artifacts.map((artifact: { name: string }) =>
          artifact.name === 'lombok-1.18.48.jar' ? { ...artifact, runtime: true } : artifact,
        ),
      }),
    /unexpected artifacts or runtime roles/,
  )
  assert.throws(
    () => validateInfestedDependencySet({ ...lock, artifacts: lock.artifacts.slice(0, -1) }),
    /unexpected artifacts or runtime roles/,
  )
})

await test('compiles the ASS subset and rejects missing selected sources', () => {
  const root = path.resolve('prepared-ass', 'src/main/java')
  const source = (name: string) => path.join(root, name)
  const required = [
    'org/bk/ass/sim/Agent.java',
    'org/bk/ass/sim/AgentUtil.java',
    'org/bk/ass/sim/AttackerBehavior.java',
    'org/bk/ass/sim/BWMirrorAgentFactory.java',
    'org/bk/ass/sim/DamageType.java',
    'org/bk/ass/sim/Evaluator.java',
    'org/bk/ass/sim/HealerBehavior.java',
    'org/bk/ass/sim/RepairerBehavior.java',
    'org/bk/ass/sim/RetreatBehavior.java',
    'org/bk/ass/sim/Simulator.java',
    'org/bk/ass/sim/SplashType.java',
    'org/bk/ass/sim/SuiciderBehavior.java',
    'org/bk/ass/sim/UnitSize.java',
    'org/bk/ass/sim/Weapon.java',
    'org/bk/ass/info/BWMirrorUnitInfo.java',
    'org/bk/ass/collection/UnorderedCollection.java',
    'org/bk/ass/collection/FastArrayFill.java',
    'org/bk/ass/PositionOutOfBoundsException.java',
  ]
  const selected = selectAssSources(root, [...required.map(source), source('extra/Unused.java')])
  assert.deepEqual(selected, required.map(source))
  assert.throws(
    () => selectAssSources(root, required.slice(1).map(source)),
    /Required ASS source is missing: org\/bk\/ass\/sim\/Agent.java/,
  )
})

await test('requires a safe fresh output name', () => {
  assert.equal(validateOutputName('infested-artosis-release-1'), 'infested-artosis-release-1')
  for (const name of ['', '../escape', 'nested/path', 'CON', 'infested artosis'])
    assert.throws(() => validateOutputName(name), /safe directory name/)
})
