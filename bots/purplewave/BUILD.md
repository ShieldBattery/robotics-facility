# PurpleWave build

Install an x64 Java 21 JDK, Node 24, pnpm, and Git. Fetch the exact sources with
`pnpm sources`, then run `node tools/build-purplewave.mjs purplewave-sb-2 <java-home>`.
The recipe verifies every Maven Central dependency against `jvm/dependencies.json`;
pre-populate `.build/java-dependencies` with those exact jars for an offline build.
No Maven plugins or upstream launch scripts run.

The build compiles the pinned JBWAPI, JBWEB, JavaJPS, and mjson Java sources,
then PurpleWave's Scala macros and main sources. It produces a thin executable JAR
and unmodified runtime jars in `bin/lib`. The JAR manifest opens `java.nio` for
JBWAPI's existing shared-memory access when launched with `java -jar`.

Use `node tools/package-purplewave.mjs .build/purplewave-sb-2 purplewave-sb-2 --review`
for a review-only archive. Publication requires approved source/distribution review
and omitting `--review`. The outer package includes patched source, source pins,
patches, the recipe and build provenance, and license/modification notices.

Source edits must be maintained as hashed patches; pristine `.sources` checkouts
are never edited. Recipe inputs must be committed before building.

This build uses Scala 2.12.20 and JNA 5.18.1 on Java 21 rather than the upstream
Scala 2.12.18/JNA 5.1.0/32-bit Java 8 recipe. Commons Lang remains 3.8.1.
It uses a fixed, quiet configuration with no visualizer or chat mode.

The runtime requests `-Xms128m -Xmx1024m` before `-jar` to bound the heap without
reserving a gigabyte at startup. These are JVM arguments; the bot has no
application arguments. JNA and the JVM also use memory outside the Java heap.
