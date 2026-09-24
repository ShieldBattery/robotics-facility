# Steamhammer 5.3.6 source import

Author archive: https://satirist.org/downloads/starcraft/steamhammer/5.3.6/Steamhammer_source.zip
SHA-256: d7ccc9f54cb8a9b1d11befc136272646767a7fd494dd937924a82e03581ad522

The enclosing Steamhammer_source/ directory is stripped. Original files retain
exact bytes, except Steamhammer/Source/Timer.hpp is omitted because its embedded
notice does not establish redistribution permission. ShieldBattery builds use
an independent monotonic timer supplied with the downstream build recipe.

Four supplementary license texts accompany the original author's notices:
BWAPI LGPLv3 and the GPLv3 text it incorporates, RapidJSON MIT, and msinttypes
BSD-3-Clause. The BWAPILIB directory is the author's unused copy. ShieldBattery
builds instead link their separately pinned BWAPI 4.4 source and include its
corresponding source, ordered patches, and complete rebuild/relink instructions.

Runtime/configuration adaptations are downstream patches in robotics-facility,
not modifications hidden in this source import. The source branch is a
ShieldBattery-maintained snapshot, not the author's Git repository.
