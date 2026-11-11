// Tests exact prepared bot method bodies against small model stubs, using installed MSVC.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const [sourceDirectory, outputDirectory] = process.argv.slice(2)
if (!sourceDirectory || !outputDirectory) throw new Error('Usage: node run.cjs <prepared-source> <new-test-directory>')
const source = path.resolve(sourceDirectory, 'src/Source')
const root = path.resolve(__dirname, '../../..')
const output = path.resolve(outputDirectory)
// The test directory is disposable, but this runner never removes an existing tree.
fs.mkdirSync(output)
const read = name => fs.readFileSync(path.join(source, name), 'utf8')
const between = (s, a, b) => {
  const start = s.indexOf(a), end = s.indexOf(b, start)
  if (start < 0 || end < 0) throw new Error('Expected bot method boundary missing')
  return s.slice(start, end)
}
const r = read('Results.cpp'), w = read('Worker.cpp')
const constants = read('Results.h').split('\n').filter(line => /static constexpr (double|int) /.test(line)).join('\n')
const miningStart = w.indexOf('namespace {\nstd::string mining_filename()')
if (miningStart < 0) throw new Error('Expected mining storage boundary missing')
const inc = read('Results.h').split('class ResultStore')[0] + `
static std::string opponent = "Fixture";
class ResultStore { public:
 char ai_filename_[512]{}, read_filename_[512]{}, write_filename_[512]{};
 std::vector<Result> results_; size_t prepared_result_count_ = 0;
 static std::string determine_name() { return opponent; }
 void init(); void init_filenames(); void read_prepared_results(); void read_results();
 void read_file(const std::string&); void store();
 std::string pick_strategy(std::vector<std::string>);
 std::string pick_strategy_greedy(const std::vector<std::string>&);
 std::string pick_strategy_ucb1(const std::vector<std::string>&);
 static std::string pick_at_random(const std::vector<std::string>&);
 ${constants}
};
struct FastPosition { int x,y; FastPosition(int a,int b):x(a),y(b){} };
struct FastTilePosition : FastPosition { using FastPosition::FastPosition; bool operator<(const FastTilePosition& b) const { return std::tie(x,y)<std::tie(b.x,b.y); } };
struct WorkerPositionAndVelocity { FastPosition position; int velocity_x,velocity_y;
 bool operator<(const WorkerPositionAndVelocity& b) const { return std::tie(position.x,position.y,velocity_x,velocity_y)<std::tie(b.position.x,b.position.y,b.velocity_x,b.velocity_y); }
};
static std::string mapHashValue(40, 'a');
struct FakeGame { std::string mapHash() { return mapHashValue; } int mapWidth() { return 256; } int mapHeight() { return 256; } } game;
static FakeGame* Broodwar = &game;
class WorkerManager { public: std::map<FastTilePosition,std::set<WorkerPositionAndVelocity>> optimal_mining_map_; void init_optimal_mining_data(); void store_optimal_mining_data(); };
` + read('Configuration.h').replace(' : public Singleton<Configuration>', '') + `
static Configuration configuration;
static std::mt19937& random_generator() { static std::mt19937 engine(17); return engine; }
template <class C, class V> bool contains(const C& collection, const V& value) { return collection.find(value) != collection.end(); }
` +
  between(r, 'void ResultStore::init()', 'std::string ResultStore::pick_strategy(') +
  between(r, 'std::string ResultStore::pick_strategy(', 'void ResultStore::apply_result(') +
  between(r, 'void ResultStore::store()', 'std::string ResultStore::determine_name()') +
  w.slice(miningStart) +
  read('Configuration.cpp').replace('#include "BananaBrain.h"', '')
fs.writeFileSync(path.join(output, 'banana-storage.inc'), inc)
fs.writeFileSync(path.join(output, 'CMakeLists.txt'), `cmake_minimum_required(VERSION 3.21)
project(BananaStorageTests LANGUAGES CXX)
add_executable(storage-tests "${path.join(__dirname, 'storage.cpp').replaceAll('\\', '/')}")
target_include_directories(storage-tests PRIVATE "${path.join(root, 'native').replaceAll('\\', '/')}" "${output.replaceAll('\\', '/')}")
target_compile_features(storage-tests PRIVATE cxx_std_17)
set_property(TARGET storage-tests PROPERTY MSVC_RUNTIME_LIBRARY MultiThreaded)
`)
const run = (cmd, args, cwd = output) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 })
run('cmake', ['-S', '.', '-B', 'build', '-G', 'Visual Studio 17 2022', '-A', 'Win32'])
run('cmake', ['--build', 'build', '--config', 'Release'])
const binary = path.join(output, 'build/Release/storage-tests.exe')
run(binary, [])
const corpus = path.join(output, 'corpus')
fs.mkdirSync(path.join(corpus, 'bwapi-data/read'), { recursive: true })
fs.mkdirSync(path.join(corpus, 'bwapi-data/write'))
fs.cpSync(path.resolve(sourceDirectory, 'AI'), path.join(corpus, 'bwapi-data/AI'), { recursive: true })
run(binary, ['seeds'], corpus)
const outside = path.join(output, 'outside'), junction = path.join(output, 'junction')
fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'sentinel.txt'), 'unchanged')
fs.mkdirSync(path.join(junction, 'bwapi-data'), { recursive: true })
fs.symlinkSync(outside, path.join(junction, 'bwapi-data/write'), 'junction')
run(binary, ['junction'], junction)
if (fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8') !== 'unchanged') throw new Error('Junction escaped')
const hardlink = path.join(output, 'hardlink')
fs.mkdirSync(path.join(hardlink, 'bwapi-data/write'), { recursive: true })
fs.linkSync(path.join(outside, 'sentinel.txt'), path.join(hardlink, 'bwapi-data/write/sentinel.txt'))
run(binary, ['hardlink'], hardlink)
if (fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8') !== 'unchanged') throw new Error('Hardlink escaped')
const rootJunction = path.join(output, 'root-junction'), outsideData = path.join(output, 'outside-data')
fs.mkdirSync(rootJunction); fs.mkdirSync(path.join(outsideData, 'write'), { recursive: true })
fs.writeFileSync(path.join(outsideData, 'write/sentinel.txt'), 'unchanged')
fs.symlinkSync(outsideData, path.join(rootJunction, 'bwapi-data'), 'junction')
run(binary, ['junction'], rootJunction)
if (fs.readFileSync(path.join(outsideData, 'write/sentinel.txt'), 'utf8') !== 'unchanged') throw new Error('Root junction escaped')
console.log('Junction containment passed; fixtures retained at ' + output)
