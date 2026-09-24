param([Parameter(Mandatory=$true)][string]$SourceDirectory)
$ErrorActionPreference = 'Stop'
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw 'MSVC Build Tools not found' }
$source = (Resolve-Path -LiteralPath $SourceDirectory).Path
$test = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$tempRoot = Join-Path $env:TEMP ('steamhammer-runtime-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
  $binary = Join-Path $tempRoot 'storage.exe'
  $vcvars = Join-Path $vs 'VC\Auxiliary\Build\vcvars64.bat'
  $build = 'call "' + $vcvars + '" >nul && cl /nologo /EHsc /std:c++17 /W4 /I"' + (Join-Path $source 'Steamhammer\Source') + '" /I"' + (Join-Path $source 'RC\Source') + '" "' + (Join-Path $test 'storage.cpp') + '" "' + (Join-Path $source 'Steamhammer\Source\File.cpp') + '" "' + (Join-Path $source 'RC\Source\Logistic.cpp') + '" "' + (Join-Path $source 'RC\Source\Common.cpp') + '" "' + (Join-Path $source 'RC\Source\BitVector.cpp') + '" /link /OUT:"' + $binary + '"'
  Push-Location $tempRoot
  try {
    cmd /d /s /c $build
    if ($LASTEXITCODE -ne 0) { throw 'MSVC compile failed' }
    & $binary
    if ($LASTEXITCODE -ne 0) { throw 'storage regression failed' }
    $sibling = Join-Path $tempRoot 'sibling-profile'
    New-Item -ItemType Directory -Path $sibling | Out-Null
    Push-Location $sibling
    try {
      & $binary
      if ($LASTEXITCODE -ne 0) { throw 'sibling-profile regression failed' }
    } finally { Pop-Location }
    Remove-Item -LiteralPath (Join-Path $tempRoot 'bwapi-data\write') -Recurse -Force
    New-Item -ItemType Directory -Path (Join-Path $tempRoot 'bwapi-data\write') | Out-Null
    & $binary reset
    if ($LASTEXITCODE -ne 0) { throw 'reset regression failed' }
    if ((Get-Content -Raw -LiteralPath (Join-Path $sibling 'bwapi-data\write\eval_TvZ.txt')) -ne 'second') { throw 'sibling profile was altered' }
  } finally { Pop-Location }
  $junctionRoot = Join-Path $tempRoot 'junction-case'
  $outside = Join-Path $tempRoot 'outside'
  New-Item -ItemType Directory -Path $junctionRoot,$outside | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $junctionRoot 'bwapi-data') | Out-Null
  New-Item -ItemType Junction -Path (Join-Path $junctionRoot 'bwapi-data\write') -Target $outside | Out-Null
  Push-Location $junctionRoot
  try {
    & $binary junction
    if ($LASTEXITCODE -ne 0) { throw 'junction regression failed' }
  } finally { Pop-Location }
  Write-Host 'Steamhammer storage regressions passed.'
} finally {
  $resolved = [IO.Path]::GetFullPath($tempRoot)
  $prefix = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
  if (-not $resolved.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe cleanup path' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
