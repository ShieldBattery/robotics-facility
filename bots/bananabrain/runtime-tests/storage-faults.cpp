// Exercise the packaged storage helper with explicit Windows I/O fault injection.
#define NOMINMAX
#include <windows.h>
#include <array>
#include <atomic>
#include <charconv>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <string>
#include <string_view>

static std::string mode;
static BOOL faultWrite(HANDLE f, LPCVOID data, DWORD size, LPDWORD count, LPOVERLAPPED overlap) {
    if (mode == "disk-full") { *count = 0; SetLastError(ERROR_DISK_FULL); return FALSE; }
    if (mode == "short-write") return WriteFile(f, data, size / 2, count, overlap);
    return WriteFile(f, data, size, count, overlap);
}
static BOOL faultFlush(HANDLE f) {
    if (mode == "flush-failure") { SetLastError(ERROR_DISK_FULL); return FALSE; }
    return FlushFileBuffers(f);
}
static void pauseForTermination() {
    std::puts("crash-boundary"); std::fflush(stdout);
    Sleep(INFINITE);
}
static BOOL faultMove(LPCSTR from, LPCSTR to, DWORD flags) {
    if (mode == "crash-before") pauseForTermination();
    if (mode == "replace-failure") { SetLastError(ERROR_ACCESS_DENIED); return FALSE; }
    const BOOL result = MoveFileExA(from, to, flags);
    if (result && mode == "crash-after") pauseForTermination();
    return result;
}
#define WriteFile faultWrite
#define FlushFileBuffers faultFlush
#define MoveFileExA faultMove
#include "storage.hpp"
#undef WriteFile
#undef FlushFileBuffers
#undef MoveFileExA

static void require(bool value, const char* message) {
    if (!value) { std::cerr << message << '\n'; std::exit(1); }
}
int main(int argc, char** argv) {
    require(argc == 3, "Expected mode and profile marker");
    mode = argv[1];
    const std::string marker = argv[2];
    CreateDirectoryA("bwapi-data", nullptr);
    CreateDirectoryA("bwapi-data/write", nullptr);
    if (mode == "crash-before" || mode == "crash-after") {
        SbStorage::write("history.txt", marker);
        return 2; // Parent must terminate this child at the requested boundary.
    }
    if (mode == "faults") {
        mode.clear();
        require(SbStorage::write("history.txt", marker), "Initial save failed");
        for (const char* fault : {"disk-full", "short-write", "flush-failure", "replace-failure"}) {
            mode = fault;
            require(!SbStorage::write("history.txt", "incomplete replacement"), "Fault accepted");
            std::string restored;
            require(SbStorage::read("write", "history.txt", restored) == SbStorage::Read::Loaded && restored == marker,
                "Failed save changed previous history");
        }
        mode.clear();
        require(SbStorage::write("history.txt", marker + "-recovered"), "Recovery save failed");
    } else if (mode == "concurrent") {
        mode.clear();
        for (int i = 0; i < 100; ++i) {
            require(SbStorage::write("history.txt", marker + '-' + std::to_string(i)), "Isolated concurrent save failed");
            std::string restored;
            require(SbStorage::state("history.txt", restored) == SbStorage::Read::Loaded &&
                restored == marker + '-' + std::to_string(i), "Profile contamination");
        }
    } else if (mode == "recover") {
        mode.clear();
        std::string restored;
        require(SbStorage::state("history.txt", restored) == SbStorage::Read::Loaded && restored == marker,
            "Interrupted replacement exposed partial history");
        require(SbStorage::write("history.txt", marker + "-recovered"), "Post-crash save failed");
    } else require(false, "Unknown mode");
    std::puts("storage-check-passed");
}
