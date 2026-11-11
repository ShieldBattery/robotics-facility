#include "storage.hpp"
#include <filesystem>
#include <fstream>
#include <vector>
#include <map>
#include <set>
#include <tuple>
#include <climits>
#include <stdexcept>
#include <algorithm>
#include <cmath>
#include <random>

namespace fs = std::filesystem;
void check(bool ok) { if (!ok) throw std::runtime_error("storage regression failed"); }
void put(const std::string& name, const std::string& data) {
    std::ofstream f(name, std::ios::binary); f << data; check(f.good());
}
std::string row(int duration) {
    return "2026-10-26 00:00:00,4,1,2,map.scx,PvT_9/9proxygate,none,T_wallin," +
        std::to_string(duration) + ",-1,-1,-1,1\n";
}

// Exact patched method bodies are generated from the supplied prepared source.
// Model stubs keep parser tests independent of a game and BWAPI installation.
#include "banana-storage.inc"

int main(int argc, char** argv) {
    if (argc > 1 && std::string(argv[1]) == "hardlink") {
        std::string s;
        check(SbStorage::read("write", "sentinel.txt", s) == SbStorage::Read::Rejected);
        check(SbStorage::write("sentinel.txt", "replacement"));
        check(SbStorage::read("write", "sentinel.txt", s) == SbStorage::Read::Loaded && s == "replacement");
        return 0;
    }
    if (argc > 1 && std::string(argv[1]) == "seeds") {
        size_t files = 0;
        for (const auto& f : fs::directory_iterator("bwapi-data/AI")) {
            const std::string name = f.path().filename().string();
            if (name.find("Results_") != 0 && name.find("OptimalMining_") != 0) continue;
            std::string data;
            check(SbStorage::read("AI", name, data) == SbStorage::Read::Loaded);
            std::set<std::string> rows;
            check(SbStorage::lines(data, [&](auto line) { rows.insert(std::string(line)); return true; }));
            if (name.find("Results_") == 0) {
                ResultStore r; r.read_file(data); check(r.results_.size() == rows.size());
            } else {
                mapHashValue = name.substr(14, 40);
                WorkerManager m; m.init_optimal_mining_data();
                size_t count = 0; for (const auto& entry : m.optimal_mining_map_) count += entry.second.size();
                check(count == rows.size());
            }
            ++files;
        }
        check(files == 11);
        std::cout << "All 11 original training/mining files parsed.\n";
        return 0;
    }
    if (argc > 1 && std::string(argv[1]) == "junction") {
        std::string s;
        check(SbStorage::read("write", "sentinel.txt", s) == SbStorage::Read::Rejected);
        check(!SbStorage::write("sentinel.txt", "bad"));
        return 0;
    }
    for (const char* d : {"AI", "read", "write"}) fs::create_directories(std::string("bwapi-data/") + d);
    check(SbStorage::encode("Ordinary name") == "Ordinary name");
    check(SbStorage::encode("a/b") == "a%2Fb");
    check(SbStorage::encode("a%2Fb") == "a%252Fb");
    check(SbStorage::encode("a:b\\c") == "a%3Ab%5Cc");
    check(SbStorage::encode(std::string(65, 'a')).empty());
    for (const char* name : {"../escape", "a/b", "a:b", "NUL.txt", "CON .txt", "CON", "x.", "x "})
        check(!SbStorage::filename(name));
    std::string data;
    check(SbStorage::state("missing.txt", data) == SbStorage::Read::Missing);
    put("bwapi-data/read/state.txt", "baseline");
    check(SbStorage::state("state.txt", data) == SbStorage::Read::Loaded && data == "baseline");
    check(SbStorage::write("state.txt", "newer"));
    check(SbStorage::state("state.txt", data) == SbStorage::Read::Loaded && data == "newer");
    HANDLE locked = CreateFileA("bwapi-data/write/state.txt", GENERIC_READ, FILE_SHARE_READ,
        nullptr, OPEN_EXISTING, 0, nullptr);
    check(locked != INVALID_HANDLE_VALUE);
    check(!SbStorage::write("state.txt", "replacement must fail"));
    check(CloseHandle(locked) != 0);
    check(SbStorage::read("write", "state.txt", data) == SbStorage::Read::Loaded && data == "newer");
    check(!SbStorage::write("state.txt", std::string(SbStorage::MaxBytes + 1, 'x')));
    for (const auto& p : fs::directory_iterator("bwapi-data/write"))
        check(p.path().filename().string().find(".tmp-") == std::string::npos);
    put("bwapi-data/write/state.txt", std::string(SbStorage::MaxBytes + 1, 'x'));
    check(SbStorage::state("state.txt", data) == SbStorage::Read::Rejected && data.empty());
    int n = 0;
    check(!SbStorage::integer("999999999999999999999", n, 0, INT_MAX));
    check(!SbStorage::integer("1junk", n, 0, INT_MAX));
    check(!SbStorage::lines(std::string(4097, 'x'), [](auto) { return true; }));
    check(!SbStorage::lines(std::string(SbStorage::MaxRecords + 1, '\n'), [](auto) { return true; }));
    check(!SbStorage::lines(std::string("x\0y", 3), [](auto) { return true; }));

    ResultStore valid;
    valid.read_file(row(101)); check(valid.results_.size() == 1 && valid.results_[0].duration == 101);
    for (const auto& bad : {std::string(",broken\n"), std::string("bad\n"),
         row(1) + ",broken\n", std::string(5000, 'x'),
         std::string("date,4,1,2,map,opening,none,none,999999999999999999,-1,-1,-1,1\n")}) {
        ResultStore malformed; malformed.read_file(bad); check(malformed.results_.empty());
    }
    opponent = "Fixture";
    put("bwapi-data/AI/Results_Fixture.txt", row(100));
    put("bwapi-data/read/Results_Fixture.txt", row(101));
    put("bwapi-data/write/Results_Fixture.txt", row(202));
    ResultStore prior; prior.init();
    check(prior.results_.size() == 2 && prior.prepared_result_count_ == 1 && prior.results_.back().duration == 202);
    prior.results_.back().map = "map,\n.scx";
    prior.store();
    ResultStore reload; reload.init();
    check(reload.results_.size() == 2 && reload.results_.back().map == "map__.scx");
    opponent = "x\\..\\..\\escaped";
    ResultStore encoded; encoded.init_filenames(); encoded.store();
    check(fs::exists("bwapi-data/write/Results_x%5C..%5C..%5Cescaped.txt"));
    check(!fs::exists("bwapi-data/escaped.txt"));

    const std::string mining = "OptimalMining_" + std::string(40, 'a') + ".txt";
    put("bwapi-data/read/" + mining, "1,2,3,4,5,6\n");
    put("bwapi-data/write/" + mining, "2,3,4,5,6,7\n");
    WorkerManager m; m.init_optimal_mining_data();
    check(m.optimal_mining_map_.size() == 1 && m.optimal_mining_map_.begin()->first.x == 2);
    m.store_optimal_mining_data();
    for (const char* bad : {"not-a-number\n", "1,2,3,4,5,99999999999999999\n", "256,2,3,4,5,6\n", "1,2,-1,4,5,6\n"}) {
        put("bwapi-data/write/" + mining, bad);
        WorkerManager invalid; invalid.init_optimal_mining_data(); check(invalid.optimal_mining_map_.empty());
    }
    put("bwapi-data/AI/Configuration.txt", "tournament=false\ndraw=true\nPvT_opening=bad\n");
    put("bwapi-data/read/Configuration.txt", "tournament=false\ndraw=true\n");
    put("bwapi-data/read/schnail.env", "");
    Configuration c; c.init();
    check(c.tournament() && !c.draw_enabled() && c.human_opponent() && !c.ucb1() && c.PvT_opening().empty());
    // Synthetic fixtures exercise policy persistence; these are not saved game results.
    configuration.init();
    opponent = "HumanOpeningFixture";
    const std::vector<std::string> openings = {"PvT_2gatedt", "PvT_1gatedtexpo", "PvT_12nexus"};
    std::map<std::string, int> counts;
    for (int round = 0; round < 12; ++round) {
        ResultStore persisted; persisted.init();
        check(persisted.results_.size() == static_cast<size_t>(round));
        const std::string selected = persisted.pick_strategy(openings);
        check(std::find(openings.begin(), openings.end(), selected) != openings.end());
        if (round < static_cast<int>(openings.size())) check(counts[selected] == 0);
        ++counts[selected];
        Result fixture{};
        fixture.timestamp = "synthetic-fixture-" + std::to_string(round);
        fixture.start_positions = 4; fixture.start_clock_position = 1; fixture.opponent_clock_position = 2;
        fixture.map = "fixture.scx"; fixture.strategy = selected;
        fixture.late_game_strategy = fixture.opponent_strategy = "none";
        fixture.duration = round + 1;
        fixture.opponent_dark_templar_frame = fixture.opponent_mutalisk_frame = fixture.opponent_lurker_frame = -1;
        fixture.is_win = true;
        persisted.results_.push_back(fixture); persisted.store();
    }
    check(counts.size() == openings.size());
    for (const auto& opening : openings) check(counts[opening] == 4);
    ResultStore final_reload; final_reload.init(); check(final_reload.results_.size() == 12);
    std::cout << "Human-opponent UCB1 explored all three openings before repeating, and balanced 12 persisted synthetic wins.\n";
    std::cout << "BananaBrain storage regressions passed.\n";
}
