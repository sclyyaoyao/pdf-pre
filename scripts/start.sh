#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_ROOT"
if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 node，请先安装 Node.js (推荐 18 或 20 版本)。"
  exit 1
fi
exec node src/server.js
