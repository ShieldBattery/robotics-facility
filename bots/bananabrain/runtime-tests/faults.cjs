// Faults are injected at WinAPI boundaries; this does not fill a physical disk.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')
const [helperDirectory, outputDirectory] = process.argv.slice(2)
if (!helperDirectory || !outputDirectory) throw new Error('Usage: node faults.cjs <packaged-native-directory> <new-test-directory>')
const output = path.resolve(outputDirectory)
fs.mkdirSync(output)
fs.writeFileSync(path.join(output, 'CMakeLists.txt'), `cmake_minimum_required(VERSION 3.21)
project(BananaStorageFaults LANGUAGES CXX)
add_executable(storage-faults "${path.join(__dirname, 'storage-faults.cpp').replaceAll('\\', '/')}")
target_include_directories(storage-faults PRIVATE "${path.resolve(helperDirectory).replaceAll('\\', '/')}")
target_compile_features(storage-faults PRIVATE cxx_std_17)
set_property(TARGET storage-faults PROPERTY MSVC_RUNTIME_LIBRARY MultiThreaded)
`)
const run = (cmd, args, cwd = output) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 })
run('cmake', ['-S', '.', '-B', 'build', '-G', 'Visual Studio 17 2022', '-A', 'Win32'])
run('cmake', ['--build', 'build', '--config', 'Release'])
const binary = path.join(output, 'build/Release/storage-faults.exe')
const profile = name => { const dir = path.join(output, name); fs.mkdirSync(dir); return dir }
const temps = dir => fs.readdirSync(path.join(dir, 'bwapi-data/write')).filter(name => name.includes('.tmp-'))
function child(args, cwd, killAtBoundary = false) {
  return new Promise((resolve, reject) => {
    const process = spawn(binary, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', killed = false
    const timer = setTimeout(() => { process.kill(); reject(new Error('Storage child timeout')) }, 30000)
    process.stdout.on('data', data => {
      stdout += data
      if (killAtBoundary && !killed && stdout.includes('crash-boundary')) { killed = true; process.kill() }
    })
    process.on('error', reject)
    process.on('exit', code => {
      clearTimeout(timer)
      if (killAtBoundary ? killed : code === 0) resolve()
      else reject(new Error(`Storage child failed: ${code}`))
    })
  })
}
async function main() {
  const faults = profile('faults')
  run(binary, ['faults', 'original'], faults)
  if (temps(faults).length) throw new Error('Failed save left temporary files')
  for (const boundary of ['before', 'after']) {
    const dir = profile('crash-' + boundary)
    fs.mkdirSync(path.join(dir, 'bwapi-data/write'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'bwapi-data/write/history.txt'), 'old')
    await child(['crash-' + boundary, 'new'], dir, true)
    run(binary, ['recover', boundary === 'before' ? 'old' : 'new'], dir)
    if (temps(dir).length !== (boundary === 'before' ? 1 : 0)) throw new Error('Unexpected interrupted-save files')
  }
  const profiles = [profile('concurrent-one'), profile('concurrent-two')]
  await Promise.all(profiles.map((dir, i) => child(['concurrent', `profile-${i}`], dir)))
  profiles.forEach((dir, i) => {
    if (fs.readFileSync(path.join(dir, 'bwapi-data/write/history.txt'), 'utf8') !== `profile-${i}-99` || temps(dir).length)
      throw new Error('Concurrent profile history mismatch')
  })
  const result = { passed: true, faults: ['ERROR_DISK_FULL write', 'short write', 'ERROR_DISK_FULL flush', 'replacement denied'],
    crashBoundaries: ['before atomic replacement', 'after atomic replacement'], concurrentProfiles: 2, savesPerProfile: 100,
    limitation: 'Synthetic storage records and injected I/O failures; physical disk exhaustion and shared-profile writers are not tested.' }
  fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
