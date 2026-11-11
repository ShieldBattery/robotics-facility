// Copyright (c) 2026 ShieldBattery contributors. Licensed under native/LICENSE.
#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <array>
#include <atomic>
#include <charconv>
#include <iostream>
#include <string>
#include <string_view>

// Fixed relative storage roots; callers still need an exclusive working profile.
namespace SbStorage {
constexpr size_t MaxBytes = 8 * 1024 * 1024;
constexpr size_t MaxRecords = 100000;
inline void warn() { std::cerr << "Bot storage: invalid data or failed save; previous files retained.\n"; }

inline std::string encode(std::string_view name) {
    if (name.empty() || name.size() > 64) return {};
    std::string out;
    for (unsigned char c : name) {
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
            (c >= '0' && c <= '9') || c == '_' || c == '-' || c == '.' || c == ' ') out += c;
        else { out += '%'; out += "0123456789ABCDEF"[c >> 4]; out += "0123456789ABCDEF"[c & 15]; }
    }
    return out;
}
inline bool filename(std::string_view name) {
    if (name.empty() || name.size() > 200 || name.back() == '.' || name.back() == ' ') return false;
    for (unsigned char c : name)
        if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
              (c >= '0' && c <= '9') || c == '_' || c == '-' || c == '.' || c == ' ' || c == '%')) return false;
    std::string stem(name.substr(0, name.find('.')));
    while (!stem.empty() && stem.back() == ' ') stem.pop_back();
    for (char& c : stem) if (c >= 'a' && c <= 'z') c -= 'a' - 'A';
    return stem != "CON" && stem != "PRN" && stem != "AUX" && stem != "NUL" &&
        !(stem.size() == 4 && (stem.substr(0, 3) == "COM" || stem.substr(0, 3) == "LPT") && stem[3] >= '1' && stem[3] <= '9');
}
enum class Read { Missing, Loaded, Rejected };
struct Directory {
    HANDLE root = INVALID_HANDLE_VALUE, child = INVALID_HANDLE_VALUE;
    bool missing = false;
    Directory(const char* folder) {
        if (std::string_view(folder) != "AI" && std::string_view(folder) != "read" && std::string_view(folder) != "write") return;
        root = open("bwapi-data");
        if (root != INVALID_HANDLE_VALUE) child = open((std::string("bwapi-data/") + folder).c_str());
    }
    HANDLE open(const char* path) {
        HANDLE h = CreateFileA(path, FILE_READ_ATTRIBUTES, FILE_SHARE_READ | FILE_SHARE_WRITE,
            nullptr, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
        if (h == INVALID_HANDLE_VALUE) { missing = GetLastError() == ERROR_FILE_NOT_FOUND || GetLastError() == ERROR_PATH_NOT_FOUND; return h; }
        BY_HANDLE_FILE_INFORMATION info{};
        if (!GetFileInformationByHandle(h, &info) || !(info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) ||
            (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT)) { CloseHandle(h); return INVALID_HANDLE_VALUE; }
        return h;
    }
    bool valid() const { return root != INVALID_HANDLE_VALUE && child != INVALID_HANDLE_VALUE; }
    Directory(const Directory&) = delete;
    ~Directory() { if (child != INVALID_HANDLE_VALUE) CloseHandle(child); if (root != INVALID_HANDLE_VALUE) CloseHandle(root); }
};
inline Read read(const char* folder, const std::string& name, std::string& contents) {
    contents.clear();
    if (!filename(name)) return Read::Rejected;
    Directory dir(folder);
    if (!dir.valid()) return dir.missing ? Read::Missing : Read::Rejected;
    const std::string path = std::string("bwapi-data/") + folder + '/' + name;
    HANDLE f = CreateFileA(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
    if (f == INVALID_HANDLE_VALUE) return GetLastError() == ERROR_FILE_NOT_FOUND ? Read::Missing : Read::Rejected;
    BY_HANDLE_FILE_INFORMATION info{};
    bool ok = GetFileType(f) == FILE_TYPE_DISK && GetFileInformationByHandle(f, &info) && info.nNumberOfLinks == 1 &&
        !(info.dwFileAttributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT)) &&
        info.nFileSizeHigh == 0 && info.nFileSizeLow <= MaxBytes;
    std::string data;
    if (ok) {
        data.resize(info.nFileSizeLow);
        DWORD count = 0;
        ok = ReadFile(f, data.data(), static_cast<DWORD>(data.size()), &count, nullptr) && count == data.size();
    }
    CloseHandle(f);
    if (!ok) return Read::Rejected;
    contents = std::move(data);
    return Read::Loaded;
}
inline Read state(const std::string& name, std::string& contents, bool baseline = false) {
    for (const char* folder : {"write", "read", "AI"}) {
        if (!baseline && std::string_view(folder) == "AI") break;
        const auto result = read(folder, name, contents);
        if (result != Read::Missing) return result;
    }
    return Read::Missing;
}
inline bool write(const std::string& name, const std::string& contents) {
    if (!filename(name) || contents.size() > MaxBytes) return false;
    Directory dir("write");
    if (!dir.valid()) return false;
    const std::string target = "bwapi-data/write/" + name;
    const DWORD attrs = GetFileAttributesA(target.c_str());
    if (attrs != INVALID_FILE_ATTRIBUTES && (attrs & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT))) return false;
    if (attrs == INVALID_FILE_ATTRIBUTES && GetLastError() != ERROR_FILE_NOT_FOUND) return false;
    static std::atomic<unsigned long> sequence{0};
    const std::string temp = target + ".tmp-" + std::to_string(GetCurrentProcessId()) + '-' + std::to_string(sequence++);
    HANDLE f = CreateFileA(temp.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (f == INVALID_HANDLE_VALUE) return false;
    DWORD count = 0;
    bool ok = WriteFile(f, contents.data(), static_cast<DWORD>(contents.size()), &count, nullptr) && count == contents.size();
    ok = ok && FlushFileBuffers(f);
    ok = CloseHandle(f) && ok;
    if (ok) ok = MoveFileExA(temp.c_str(), target.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) != 0;
    if (!ok) DeleteFileA(temp.c_str());
    return ok;
}
template<class Callback> bool lines(const std::string& data, Callback callback) {
    if (data.size() > MaxBytes || data.find('\0') != std::string::npos) return false;
    size_t start = 0, count = 0;
    while (start < data.size()) {
        size_t end = data.find('\n', start);
        if (end == std::string::npos) end = data.size();
        auto line = std::string_view(data).substr(start, end - start);
        if (!line.empty() && line.back() == '\r') line.remove_suffix(1);
        if (++count > MaxRecords || line.size() > 4096 || (!line.empty() && !callback(line))) return false;
        start = end + 1;
    }
    return true;
}
template<size_t N> bool fields(std::string_view line, std::array<std::string, N>& out) {
    for (size_t i = 0; i < N; ++i) {
        const auto comma = line.find(',');
        if ((i + 1 == N) != (comma == std::string_view::npos)) return false;
        const auto field = line.substr(0, comma);
        if (field.empty() || field.size() > 511) return false;
        for (unsigned char c : field) if (c < 32 || c == 127) return false;
        out[i] = field;
        if (comma != std::string_view::npos) line.remove_prefix(comma + 1);
    }
    return true;
}
inline bool integer(const std::string& s, int& value, int low, int high) {
    const auto parsed = std::from_chars(s.data(), s.data() + s.size(), value);
    return parsed.ec == std::errc{} && parsed.ptr == s.data() + s.size() && value >= low && value <= high;
}
inline std::string csv(std::string value) {
    for (char& c : value) if (static_cast<unsigned char>(c) < 32 || c == 127 || c == ',') c = '_';
    return value;
}
}
