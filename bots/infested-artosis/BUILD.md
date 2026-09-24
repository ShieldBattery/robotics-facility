# Infested Artosis build

Requires Node 24.12+, pnpm, Git, and an x64 JDK 21. Fetch source-lock.json with
`pnpm sources`, then build from a committed recipe into a fresh directory:

```powershell
node tools/build-infested-artosis.ts infested-check-1 "C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot"
node tools/package-infested-artosis.ts .build/infested-check-1 infested-artosis-sb-1 --review
```

The recipe directly compiles the pinned bot and patched JBWAPI plus 18 explicitly
selected ASS simulator sources. It does not run upstream Maven/Gradle scripts,
include BWAPI4J, or load the upstream BWAPI.dll. JBWAPI uses sun.misc.Unsafe, so
compilation targets Java 8 bytecode with `-source 8 -target 8`; the package selects
Java 21 x64 as its supported runtime. A bytecode target is not runtime certification.

JNA/JNA Platform 5.18.1 are runtime dependencies. Lombok 1.18.48 is the sole explicit
annotation processor; annotations 26.1.0 is compile-only. All four artifacts are
locked by URL, size, and SHA-256 in jvm/infested-artosis-dependencies.json. Prepopulate
.build/java-dependencies with those exact jars to build without downloading.

build-info.json records recipe input hashes, source pins and prepared trees,
toolchain, dependency roles, and produced files. Dirty builds cannot be packaged.
The review package keeps distribution/source approval pending until game tests and
artifact review are complete. A working directory and source review are not an OS
sandbox.

The package includes patched sources, original license notices, modifications,
and both compile-time jars under source/build-dependencies. From the root of a
freshly extracted package, rebuild offline without running the bot:

```powershell
& ./source/bots/infested-artosis/rebuild.ps1 -JavaHome "C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot"
```

The script verifies dependency hashes and uses the same source subset and processor.
It emits rebuilt/classes and rebuilt/InfestedArtosis.jar; the JDK ZIP writer differs
from the recipe's deterministic writer, so compare class bytes rather than the ZIP
hash. For launch, keep bin/lib beside the bot JAR and use the assigned
SB_BWAPI_INSTANCE with the per-instance work directory; do not launch a second
writer in the same profile.

Java and JNA temporary files live in work/tmp. Learning reads its existing history
from work/bwapi-data/write, falling back to packaged read inputs for a fresh profile.
Compatible updates reuse that profile; Reset learning restores the empty packaged
baseline. Concurrent instances use separate working copies. See RELEASE.txt for
modification and dependency-license disclosures.
