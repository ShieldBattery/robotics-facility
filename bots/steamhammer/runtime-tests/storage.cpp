#include "File.h"
#include "Logistic.h"

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <cassert>
#include <fstream>
#include <sstream>
#include <string>

static void put(const char * path, const std::string & contents)
{
    std::ofstream out(path, std::ios::binary);
    out << contents;
    assert(out.good());
}

int main(int argc, char ** argv)
{
    assert(CreateDirectoryA("bwapi-data", nullptr) || GetLastError() == ERROR_ALREADY_EXISTS);
    assert(CreateDirectoryA("bwapi-data/AI", nullptr) || GetLastError() == ERROR_ALREADY_EXISTS);
    assert(CreateDirectoryA("bwapi-data/AI/prepared", nullptr) || GetLastError() == ERROR_ALREADY_EXISTS);
    assert(CreateDirectoryA("bwapi-data/read", nullptr) || GetLastError() == ERROR_ALREADY_EXISTS);
    if (argc > 1 && std::string(argv[1]) == "junction")
    {
        std::string contents;
        assert(readLearningFile("eval_TvZ.txt", contents) == LearningReadResult::Rejected);
        assert(!writeLearningFile("eval_TvZ.txt", "unsafe"));
        return 0;
    }
    assert(CreateDirectoryA("bwapi-data/write", nullptr) || GetLastError() == ERROR_ALREADY_EXISTS);
    if (argc > 1 && std::string(argv[1]) == "reset")
    {
        std::string prior;
        assert(readLearningFile("eval_TvZ.txt", prior) == LearningReadResult::Loaded);
        assert(prior == "baseline");
        return 0;
    }
    std::string contents;
    put("bwapi-data/AI/prepared/eval_TvZ.txt", "prepared\r\n");
    assert(readLearningFile("eval_TvZ.txt", contents) == LearningReadResult::Loaded);
    assert(contents == "prepared\n");
    put("bwapi-data/read/eval_TvZ.txt", "baseline");
    assert(readLearningFile("eval_TvZ.txt", contents) == LearningReadResult::Loaded);
    assert(contents == "baseline");
    assert(writeLearningFile("eval_TvZ.txt", "first"));
    assert(readLearningFile("eval_TvZ.txt", contents) == LearningReadResult::Loaded);
    assert(contents == "first");
    assert(writeLearningFile("eval_TvZ.txt", "second"));
    assert(readLearningFile("eval_TvZ.txt", contents) == LearningReadResult::Loaded);
    assert(contents == "second");
    assert(!writeLearningFile("../escape.txt", "bad"));
    assert(readLearningFile("../escape.txt", contents) == LearningReadResult::Rejected);
    assert(!writeLearningFile("eval_TvZ.txt", std::string(MaxLearningFileBytes + 1, 'x')));
    assert(readLearningFile("eval_TvZ.txt", contents) == LearningReadResult::Loaded);
    assert(contents == "second");
    put("bwapi-data/write/eval_PvZ.txt", std::string(MaxLearningFileBytes + 1, 'x'));
    assert(readLearningFile("eval_PvZ.txt", contents) == LearningReadResult::Rejected);
    assert(writeLearningFile("om_6162.txt", "opponent A"));
    assert(writeLearningFile("om_6364.txt", "opponent B"));
    assert(readLearningFile("om_6162.txt", contents) == LearningReadResult::Loaded);
    assert(contents == "opponent A");
    assert(readLearningFile("om_6364.txt", contents) == LearningReadResult::Loaded);
    assert(contents == "opponent B");

    RC::Logistic model(3, 0.1);
    std::istringstream good("2 0.1 0.2 0.3\n");
    model.read(good);
    std::istringstream malformed("2 0.1 0.2 0.3 0.4\n");
    bool rejected = false;
    try { model.read(malformed); } catch (const std::runtime_error &) { rejected = true; }
    assert(rejected);
    std::istringstream badValue("2 0.1 bad 0.3\n");
    rejected = false;
    try { model.read(badValue); } catch (const std::runtime_error &) { rejected = true; }
    assert(rejected);
    return 0;
}
