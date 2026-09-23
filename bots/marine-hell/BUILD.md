# Marine Hell build

This recipe builds the pinned, patched single-file Marine Hell bot with the
reviewed JBWAPI 1.5.1 source. Use an x64 JDK 9 or newer (the compiler targets
Java 8), Node 24, and Git. Fetch the locked `marine-hell` and `jbwapi` sources
with `pnpm sources`, then run:

```powershell
node tools/build-marine-hell.mjs marine-hell-check-1 "C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot"
```

The output name must be a new directory under `.build`. `bin/MarineHell.jar`
is executable with `java -jar`; its manifest names `TestBot1` and points to the
locked JNA 5.18.1 and JNA Platform 5.18.1 jars in `bin/lib`. The x64 Java
runtime must be at least Java 8. The recipe verifies dependency size and
SHA-256 against `jvm/dependencies.json`, using `.build/java-dependencies` as
a cache; prepopulate it with those exact jars for an offline build. It compiles the patched JBWAPI source with `javac -source 8 -target 8`,
matching the reviewed PurpleWave recipe: JBWAPI imports `sun.misc.Unsafe`, which
`--release 8` hides. It then compiles Marine Hell with `javac --release 8`
against those classes. Both produce Java 8 class files. It does not run Maven,
Gradle, upstream scripts, or the bot.

`build-info.json` records recipe input hashes, source pins and patched Git
trees, JDK details, dependency records, and executable/runtime JAR hashes. A
`recipeDirty` value of `true` means recipe inputs differed from the current
repository commit during the build; such output is for review only. The
prepared source checkouts and all compilation products stay in the new output
directory. Neither pristine `.sources` nor the review patchwork is edited.

The ShieldBattery BWAPI bridge supplies the native IPC endpoint; this Java bot
build does not copy upstream BWMirror or its JNI DLLs, nor the `BWAPI.dll` files
found in other source trees. The JBWAPI connector uses JNA and may extract its
own native support to the JVM temporary directory at runtime. Keep the bot's
working directory isolated when testing it. This recipe is a build checkpoint,
not source or local-distribution approval. Before packaging, review the exact
source and dependency notices, document the port and modifications, and run
real x86/x64 bridge matches, repeat/concurrent-instance tests, and effects
tracing. See `docs/marine-hell-admission.md` for the current evidence and
remaining checks.
