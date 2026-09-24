param(
    [string]$SourceDir,
    [string]$JdkDir = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
if (-not $SourceDir) {
    $SourceDir = Join-Path $repo '.build/infested-artosis-patch-work/src/main/java/learning'
}
$jar = Join-Path $repo '.build/infested-dependency-research/lombok-1.18.48.jar'
$expected = '85477a4655ebb2c074a9099cfb749be454449fee564d4282610df1b85f7c508b'
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $jar).Hash.ToLowerInvariant() -ne $expected) {
    throw 'Reviewed Lombok cache hash mismatch'
}
$javac = Join-Path $JdkDir 'bin/javac.exe'
$java = Join-Path $JdkDir 'bin/java.exe'
$runRoot = Join-Path $repo ('.build/infested-artosis-patch-work/.harness-runs/' + [guid]::NewGuid().ToString('N'))
$classes = Join-Path $runRoot 'classes'
New-Item -ItemType Directory -Force -Path $classes | Out-Null
$sources = @(
    (Join-Path $SourceDir 'GameRecord.java'),
    (Join-Path $SourceDir 'LearningHistory.java'),
    (Join-Path $SourceDir 'LearningHistoryRepository.java'),
    (Join-Path $PSScriptRoot 'LearningHistoryHarness.java')
)
& $javac -encoding UTF-8 -source 8 -target 8 -cp $jar -processorpath $jar -processor 'lombok.launch.AnnotationProcessorHider$AnnotationProcessor' -d $classes $sources
if ($LASTEXITCODE -ne 0) { throw 'Learning history harness compilation failed' }

function Run-Scenario([string]$name, [string]$profile) {
    Push-Location $profile
    try {
        & $java -cp $classes learning.LearningHistoryHarness $name
        if ($LASTEXITCODE -ne 0) { throw "Learning history scenario failed: $name" }
    } finally {
        Pop-Location
    }
}

$first = Join-Path $runRoot 'profile-a'
$second = Join-Path $runRoot 'profile-b'
$linkProfile = Join-Path $runRoot 'profile-junction'
$limitsProfile = Join-Path $runRoot 'profile-limits'
$randomProfile = Join-Path $runRoot 'profile-random'
New-Item -ItemType Directory -Force -Path $first, $second, $linkProfile, $limitsProfile, $randomProfile | Out-Null
Run-Scenario 'history' $first
Run-Scenario 'history' $second
Run-Scenario 'limits' $limitsProfile
Run-Scenario 'random' $randomProfile
$outside = Join-Path $linkProfile 'outside'
$data = Join-Path $linkProfile 'bwapi-data'
New-Item -ItemType Directory -Force -Path $outside, $data | Out-Null
Set-Content -LiteralPath (Join-Path $outside 'sentinel') -Value 'keep' -NoNewline
New-Item -ItemType Junction -Path (Join-Path $data 'write') -Target $outside | Out-Null
Run-Scenario 'links' $linkProfile
Write-Output "PASS profile isolation and junction refusal ($runRoot)"

