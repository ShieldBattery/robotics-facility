# Marine Hell build and review package

Use an x64 JDK 21, Node 24.12+, pnpm, and Git. Fetch the locked `marine-hell` and
`jbwapi` sources with `pnpm sources`, then build into a new directory:

```powershell
node tools/build-marine-hell.ts marine-hell-check-3 "C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot"
```

The build produces `bin/MarineHell.jar` with main class `TestBot1` and the
locked JNA 5.18.1 and JNA Platform 5.18.1 jars in `bin/lib`. JBWAPI's
`sun.misc.Unsafe` import requires `javac -source 8 -target 8`, matching the
reviewed PurpleWave recipe. Marine Hell itself compiles with `javac --release
8` against those classes. Both emit Java 8 class files. This establishes a
bytecode target, not tested compatibility with a Java 8 runtime. The first
package selects x64 Java 21, matching the build and intended game tests.

Dependencies are checked by size and SHA-256 against `jvm/dependencies.json`.
Prepopulate `.build/java-dependencies` with those exact jars for an offline
build. The recipe neither runs Maven, Gradle, upstream scripts, nor the bot.
Each build goes into a new named directory under `.build`; its
`build-info.json` records recipe input hashes, source pins and patched Git
trees, toolchain details, dependencies, and output hashes. `recipeDirty: true`
marks a build that cannot be packaged. The pristine `.sources` checkouts are
never edited.

After the build recipe, package recipe, notices, and source lock are committed,
make a fresh clean build and create a review-only archive:

```powershell
node tools/package-marine-hell.ts .build/marine-hell-check-3 marine-hell-sb-1 --review
```

The packager verifies the committed recipe inputs, patched source trees,
locked runtime jars, original license notices, and archive contents. A review
archive keeps source and local-distribution approval pending. Normal packaging
without `--review` requires both approvals in the current candidate metadata.
The package selects x64 Java 21, sets `-Xms32m -Xmx512m`, and uses
`work/tmp` for JNA and Java temporary files. ShieldBattery gives each
installed instance its own writable working copy. The BWAPI host bridge
supplies native IPC; this package does not include `BWAPI.dll` or the
upstream BWMirror/JNI, GMP, and MPFR binaries. Runtime behavior, effects, and
human difficulty remain subject to the checks in `docs/marine-hell-admission.md`.

The review archive also carries enough patched Java source and dependency
jars for an offline rebuild without C++ headers or native compilation. From
an extracted archive in PowerShell with an x64 JDK 21, run:

```powershell
$jdk = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot'
New-Item -ItemType Directory -Force rebuilt/classes | Out-Null
$deps = ((Resolve-Path bin/lib/jna-5.18.1.jar).Path + ';' +
         (Resolve-Path bin/lib/jna-platform-5.18.1.jar).Path)
Get-ChildItem source/jbwapi/src/main/java -Recurse -Filter *.java |
  ForEach-Object { '"' + $_.FullName.Replace('\', '/') + '"' } |
  Set-Content -Encoding Ascii rebuilt/jbwapi.args
& "$jdk/bin/javac.exe" -encoding UTF-8 -source 8 -target 8 -Xlint:-options `
  -cp $deps -d rebuilt/classes '@rebuilt/jbwapi.args'
& "$jdk/bin/javac.exe" -encoding UTF-8 --release 8 -Xlint:-options `
  -cp ((Resolve-Path rebuilt/classes).Path + ';' + $deps) -d rebuilt/classes `
  source/marine-hell/src/TestBot1.java
& "$jdk/bin/jar.exe" --create --file rebuilt/MarineHell.jar `
  --main-class TestBot1 -C rebuilt/classes .
```

This rebuild checks the source and Java dependencies without executing the
bot. The convenience `jar` command creates a different manifest from the
locked recipe, so byte-for-byte comparison requires `tools/build-marine-hell.ts`
with the pinned Git sources and its deterministic JAR writer. For a controlled
bridge test, use the instance name assigned by the ShieldBattery host and
launch from the extracted `work` directory:

```powershell
$archiveRoot = (Get-Location).Path
$env:SB_BWAPI_INSTANCE = '<instance name assigned by the host>'
Push-Location work
try {
  & "$jdk/bin/java.exe" --add-opens=java.base/java.nio=ALL-UNNAMED `
    -Xms32m -Xmx512m -Djava.io.tmpdir=tmp -Djna.tmpdir=tmp `
    -cp "$archiveRoot/rebuilt/MarineHell.jar;$archiveRoot/bin/lib/*" TestBot1
} finally {
  Pop-Location
}
```

Use the recipe revision recorded in a published package when reproducing that release.
The TypeScript recipes on `main` require a fresh build directory and a new release ID;
older `.mjs` build records and published archives are not rewritten by this migration.
