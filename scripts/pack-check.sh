#!/usr/bin/env sh
set -eu

# Pack once and share the tarball between both checkers. npm 10 still runs `prepare` here despite --ignore-scripts.
export npm_config_ignore_scripts=true
package_dir=$(mktemp -d "${TMPDIR:-/tmp}/pack-check.XXXXXX")
trap 'rm -rf "$package_dir"' EXIT
trap 'exit 1' HUP INT TERM
npm pack --ignore-scripts --pack-destination "$package_dir"
publint --strict "$package_dir"/*.tgz
attw "$package_dir"/*.tgz
