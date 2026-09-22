# 0001 Encode ZZZKBot persistence names

Date: 2026-09-21  
Downstream author: ShieldBattery contributors  
Base source: `7183e37b6b416ea53c1040c83e639a3a3c395eed`

ZZZKBot used raw self and opponent player names in its optional configuration and learned-history filenames. It also wrote raw player and map strings into tab-delimited history records. This patch percent-encodes unsafe filename bytes and escapes record delimiters/control bytes while leaving ordinary ASCII filenames and records unchanged.

The patch adds only an inline C++ helper header and calls it from the existing persistence sites. It does not alter strategy selection, BWAPI IPC, networking, process launching, or the read/write promotion protocol. The source remains licensed under LGPL-3.0-or-later; package releases must retain the upstream notices and provide the exact modified source and modification disclosure required by the catalog licensing policy.

Validation: `bots/zzzkbot/tests/persistence-encoding-test.cpp` compiled and passed against the prepared patched header. The patch passed `git apply --check --index` against the pinned clean source.

Upstream submission status: not submitted.