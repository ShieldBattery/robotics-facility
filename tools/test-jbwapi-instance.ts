import { spawn } from 'node:child_process'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const executableSuffix = process.platform === 'win32' ? '.exe' : ''

function usage() {
  return 'Usage: node tools/test-jbwapi-instance.ts <prepared-source> [java-home]'
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', data => {
      stdout += data
    })
    child.stderr.on('data', data => {
      stderr += data
    })
    child.on('error', error => {
      reject(new Error('Could not start ' + command + ': ' + error.message, { cause: error }))
    })
    child.on('close', code => {
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(command + ' ' + args.join(' ') + ' failed: ' + (stderr || stdout)))
      }
    })
  })
}

async function main() {
  const [preparedSourceArgument, javaHome, ...extra] = process.argv.slice(2)
  if (!preparedSourceArgument || extra.length) {
    throw new Error(usage())
  }

  const preparedSource = path.resolve(preparedSourceArgument)
  const helperSource = path.join(
    preparedSource,
    'src',
    'main',
    'java',
    'bwapi',
    'GameTableMappingName.java',
  )
  if (!(await stat(helperSource)).isFile()) {
    throw new Error('Prepared JBWAPI source does not contain ' + helperSource)
  }

  const javaBin = javaHome ?? process.env.JAVA_HOME
  const javac = javaBin
    ? path.join(javaBin, 'bin', 'javac' + executableSuffix)
    : 'javac' + executableSuffix
  const java = javaBin
    ? path.join(javaBin, 'bin', 'java' + executableSuffix)
    : 'java' + executableSuffix
  const workDir = await mkdtemp(path.join(tmpdir(), 'jbwapi-instance-test-'))
  try {
    const fixture = path.join(workDir, 'GameTableMappingNameTest.java')
    await writeFile(
      fixture,
      String.raw`package bwapi;

final class GameTableMappingNameTest {
    private static final String BASE_NAME = "Local\\bwapi_shared_memory_game_list";

    private static void assertEquals(String expected, String actual) {
        if (!java.util.Objects.equals(expected, actual)) {
            throw new AssertionError("expected " + expected + ", got " + actual);
        }
    }

    public static void main(String[] args) {
        assertEquals(BASE_NAME, GameTableMappingName.forInstance(null));
        assertEquals(BASE_NAME, GameTableMappingName.forInstance(""));
        assertEquals(BASE_NAME + "_match_1-A", GameTableMappingName.forInstance("match_1-A"));
        assertEquals(BASE_NAME + "_" + "a".repeat(127), GameTableMappingName.forInstance("a".repeat(127)));
        assertEquals(null, GameTableMappingName.forInstance("a".repeat(128)));
        assertEquals(null, GameTableMappingName.forInstance("../match"));
        assertEquals(null, GameTableMappingName.forInstance("match/one"));
        assertEquals(null, GameTableMappingName.forInstance("match\\one"));
        assertEquals(null, GameTableMappingName.forInstance("match\u00e9"));
        assertEquals(null, GameTableMappingName.forInstance("match\nnext"));
    }
}
`,
      'utf8',
    )

    const classes = path.join(workDir, 'classes')
    await run(javac, ['-encoding', 'UTF-8', '-d', classes, helperSource, fixture])
    await run(java, ['-cp', classes, 'bwapi.GameTableMappingNameTest'])
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
