#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
neo4j_dir="${KW_NEO4J_HOME:-$PWD/var/neo4j/neo4j-community-2026.10.2}"
if [[ ! -x "$neo4j_dir/bin/neo4j" ]]; then
  printf 'Local Neo4j is missing. Set KW_NEO4J_HOME or start your own Neo4j instance.\n' >&2
  exit 1
fi
if [[ -z "${JAVA_HOME:-}" && "$(uname)" == Darwin ]]; then
  shopt -s nullglob
  runtimes=("$HOME"/Library/Application\ Support/neo4j-desktop/Application/Cache/runtime/*/Contents/Home)
  if (( ${#runtimes[@]} > 0 )); then
    export JAVA_HOME="${runtimes[${#runtimes[@]} - 1]}"
  fi
fi
exec "$neo4j_dir/bin/neo4j" "${1:-console}"
