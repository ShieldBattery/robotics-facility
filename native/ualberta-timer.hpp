// Copyright (c) 2026 ShieldBattery contributors. Licensed under native/LICENSE.
#pragma once
#include <chrono>

namespace ShieldBattery {
// Monotonic elapsed-time clock used to bound bot search work.
class BotTimer {
    using Clock = std::chrono::steady_clock;
    Clock::time_point begin_ = Clock::now();
    Clock::time_point end_ = begin_;
    bool stopped_ = false;
public:
    void start() { begin_ = Clock::now(); stopped_ = false; }
    void stop() { end_ = Clock::now(); stopped_ = true; }
    double getElapsedTimeInMicroSec() {
        return std::chrono::duration<double, std::micro>((stopped_ ? end_ : Clock::now()) - begin_).count();
    }
    double getElapsedTimeInMilliSec() { return getElapsedTimeInMicroSec() / 1000.0; }
    double getElapsedTimeInSec() { return getElapsedTimeInMicroSec() / 1000000.0; }
    double getElapsedTime() { return getElapsedTimeInSec(); }
};
}
namespace BOSS { using Timer = ShieldBattery::BotTimer; }
namespace SparCraft { using Timer = ShieldBattery::BotTimer; }
