# UAlbertaBot sb.3: Terran MarineRush

Adds a native Terran 1v1 opponent to the experimental local-play catalog. The bot
uses a fixed MarineRush opening and does not learn between games. Human skill is
uncalibrated; the historical SSCAIT rating is not this package's human rating.

The ZIP includes corresponding source, verified rebuild/relink instructions,
license notices, and the modification disclosure. Runtime checks cover x86 and
x64 SC:R, independent concurrent instances, synchronized gameplay, normal shutdown,
and bot replay suppression. See [the detailed source and release review](../ualbertabot-source-review.md)
for hashes, exact sessions and remaining limitations, including the one initial
observer startup stall that did not recur in subsequent tests.

Changes from upstream: quiet fixed configuration, disabled result storage and
chat configuration setters, single-match process lifecycle, isolated BWAPI
instance discovery, static C runtime, and independently implemented monotonic timer.
This package does not approve public ladder/competition participation.
