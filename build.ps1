<#
.SYNOPSIS
Builds the PLECS Diff Viewer extension into a VSIX package.

.DESCRIPTION
This script is the Windows equivalent of build.sh.
It installs dependencies, builds the code, and packages it using vsce.

.PARAMETER version
Override extension version only for this build (e.g., 0.2.0)
#>
param (
    [string]$version = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
$outputDir = Join-Path $scriptDir "build_extension"
$packageJsonPath = Join-Path $scriptDir "package.json"
$backupJsonPath = Join-Path $scriptDir "package.json.bak"

if ($version -and $version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$') {
    Write-Error "Invalid version '$version'. Expected format like 0.2.0"
    exit 1
}

try {
    if ($version) {
        Write-Host "Using build version override: $version"
        Copy-Item $packageJsonPath $backupJsonPath -Force
        # Update version using node to preserve formatting
        node -e "const fs=require('fs'); const p=process.argv[1]; const v=process.argv[2]; const pkg=JSON.parse(fs.readFileSync(p,'utf8')); pkg.version=v; fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');" "$packageJsonPath" "$version"
    }

    # Clean output directory
    if (Test-Path $outputDir) {
        Remove-Item -Path $outputDir -Recurse -Force
    }
    New-Item -Path $outputDir -ItemType Directory -Force | Out-Null

    # Install dependencies
    Write-Host "Installing dependencies..."
    & npm --prefix "$scriptDir" install

    # Bundle TypeScript with esbuild
    Write-Host "Building extension..."
    & npm --prefix "$scriptDir" run build -- --minify

    # Package as VSIX
    Write-Host "Packaging VSIX..."
    
    # Needs npx.cmd on windows
    & npx.cmd --yes @vscode/vsce package --allow-missing-repository --readme-path "README.md" --out "$outputDir/" --baseImagesUrl "https://github.com/jaeyeon302/PLECS-diff/raw/main/"


    $vsixFile = Get-ChildItem -Path "$outputDir\*.vsix" | Select-Object -First 1
    if ($vsixFile) {
        Write-Host "`nBuild complete: build_extension/$($vsixFile.Name)"
        Write-Host "Install with: code --install-extension build_extension/$($vsixFile.Name)"
    }
}
finally {
    if (Test-Path $backupJsonPath) {
        Move-Item $backupJsonPath $packageJsonPath -Force
    }
}
