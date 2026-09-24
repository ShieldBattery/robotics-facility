param([Parameter(Mandatory = $true)][string]$JavaHome)
$ErrorActionPreference = 'Stop'
$archiveRoot = (Get-Location).Path
$outputPath = Join-Path $archiveRoot 'rebuilt'
if (Test-Path -LiteralPath $outputPath) { throw 'rebuilt already exists; choose a fresh extraction.' }
New-Item -ItemType Directory -Path (Join-Path $outputPath 'classes') | Out-Null
$classesPath = Join-Path $outputPath 'classes'
$dependencyPaths = @(
  (Join-Path $archiveRoot 'bin/lib/jna-5.18.1.jar'),
  (Join-Path $archiveRoot 'bin/lib/jna-platform-5.18.1.jar'),
  (Join-Path $archiveRoot 'source/build-dependencies/annotations-26.1.0.jar'),
  (Join-Path $archiveRoot 'source/build-dependencies/lombok-1.18.48.jar')
)
$locked = (Get-Content -LiteralPath 'source/jvm/infested-artosis-dependencies.json' -Raw | ConvertFrom-Json).artifacts
foreach ($file in $dependencyPaths) {
  $artifact = $locked | Where-Object { $_.name -eq (Split-Path -Leaf $file) }
  if ((Get-Item -LiteralPath $file).Length -ne $artifact.sizeBytes -or
      (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $artifact.sha256) {
    throw "Dependency bytes differ: $file"
  }
}
$sourceFiles = @((Get-ChildItem -LiteralPath 'source/infested-artosis/src/main/java' -Recurse -Filter '*.java').FullName)
$sourceFiles += @((Get-ChildItem -LiteralPath 'source/jbwapi/src/main/java' -Recurse -Filter '*.java').FullName)
$assSources = @(
  'org/bk/ass/sim/Agent.java',
  'org/bk/ass/sim/AgentUtil.java',
  'org/bk/ass/sim/AttackerBehavior.java',
  'org/bk/ass/sim/BWMirrorAgentFactory.java',
  'org/bk/ass/sim/DamageType.java',
  'org/bk/ass/sim/Evaluator.java',
  'org/bk/ass/sim/HealerBehavior.java',
  'org/bk/ass/sim/RepairerBehavior.java',
  'org/bk/ass/sim/RetreatBehavior.java',
  'org/bk/ass/sim/Simulator.java',
  'org/bk/ass/sim/SplashType.java',
  'org/bk/ass/sim/SuiciderBehavior.java',
  'org/bk/ass/sim/UnitSize.java',
  'org/bk/ass/sim/Weapon.java',
  'org/bk/ass/info/BWMirrorUnitInfo.java',
  'org/bk/ass/collection/UnorderedCollection.java',
  'org/bk/ass/collection/FastArrayFill.java',
  'org/bk/ass/PositionOutOfBoundsException.java'
)
foreach ($name in $assSources) { $sourceFiles += Join-Path $archiveRoot ('source/ass/src/main/java/' + $name) }
$argumentPath = Join-Path $outputPath 'sources.args'
$lines = $sourceFiles | ForEach-Object { '"' + $_.Replace('\', '/').Replace('"', '\"') + '"' }
[System.IO.File]::WriteAllLines($argumentPath, $lines, (New-Object System.Text.UTF8Encoding($false)))
& (Join-Path $JavaHome 'bin/javac.exe') -encoding UTF-8 -source 8 -target 8 -Xlint:-options `
  -cp ($dependencyPaths -join ';') -processorpath $dependencyPaths[3] `
  -processor 'lombok.launch.AnnotationProcessorHider$AnnotationProcessor' `
  -d $classesPath ("@$argumentPath")
if ($LASTEXITCODE -ne 0) { throw "javac exited $LASTEXITCODE" }
# Retain the reviewed runtime manifest when assembling the rebuilt classes.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead((Join-Path $archiveRoot 'bin/InfestedArtosis.jar'))
try {
  $entry = $archive.GetEntry('META-INF/MANIFEST.MF')
  [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $outputPath 'MANIFEST.MF'))
} finally { $archive.Dispose() }
& (Join-Path $JavaHome 'bin/jar.exe') --create --file (Join-Path $outputPath 'InfestedArtosis.jar') `
  --manifest (Join-Path $outputPath 'MANIFEST.MF') -C $classesPath .
if ($LASTEXITCODE -ne 0) { throw "jar exited $LASTEXITCODE" }
Write-Output 'Compiled the packaged sources without running the bot.'
