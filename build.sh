#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/build_extension"
PACKAGE_JSON="$SCRIPT_DIR/package.json"

VERSION_OVERRIDE=""

usage() {
	echo "Usage: $0 [--version X.Y.Z]"
	echo ""
	echo "Options:"
	echo "  --version  Override extension version only for this build"
	echo "  -h, --help Show this help message"
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--version)
			if [[ -z "${2:-}" ]]; then
				echo "Error: --version requires a value"
				usage
				exit 1
			fi
			VERSION_OVERRIDE="$2"
			shift 2
			;;
		-h|--help)
			usage
			exit 0
			;;
		*)
			echo "Error: Unknown option '$1'"
			usage
			exit 1
			;;
	esac
done

if [[ -n "$VERSION_OVERRIDE" ]] && [[ ! "$VERSION_OVERRIDE" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]]; then
	echo "Error: Invalid version '$VERSION_OVERRIDE'. Expected format like 0.2.0"
	exit 1
fi

ORIGINAL_VERSION="$(node -e "const pkg=require(process.argv[1]); process.stdout.write(pkg.version);" "$PACKAGE_JSON")"

restore_original_version() {
	if [[ -n "$VERSION_OVERRIDE" ]]; then
		node -e "const fs=require('fs'); const p=process.argv[1]; const v=process.argv[2]; const pkg=JSON.parse(fs.readFileSync(p,'utf8')); pkg.version=v; fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\\n');" "$PACKAGE_JSON" "$ORIGINAL_VERSION"
	fi
}

trap restore_original_version EXIT

if [[ -n "$VERSION_OVERRIDE" ]]; then
	echo "Using build version override: $VERSION_OVERRIDE"
	node -e "const fs=require('fs'); const p=process.argv[1]; const v=process.argv[2]; const pkg=JSON.parse(fs.readFileSync(p,'utf8')); pkg.version=v; fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\\n');" "$PACKAGE_JSON" "$VERSION_OVERRIDE"
fi

# Clean output directory
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Install dependencies
echo "Installing dependencies..."
npm --prefix "$SCRIPT_DIR" install

# Bundle TypeScript with esbuild
echo "Building extension..."
npm --prefix "$SCRIPT_DIR" run build -- --minify

# Package as VSIX
echo "Packaging VSIX..."
npx --yes @vscode/vsce package --allow-missing-repository --readme-path "README.md" --out "$OUTPUT_DIR/" --baseImagesUrl "https://github.com/jaeyeon302/PLECS-diff/raw/main/"


VSIX_FILE=$(ls "$OUTPUT_DIR"/*.vsix 2>/dev/null | head -1)
echo ""
echo "Build complete: $VSIX_FILE"
echo "Install with: code --install-extension $VSIX_FILE"
