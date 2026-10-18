#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
archive="Scientific-Revolution-0.1.0-mac-universal.zip"
destination="$HOME/Applications/Scientific-Revolution-0.1.0"
if [ ! -f "$archive" ]; then
  echo "未找到 Mac 应用 ZIP，请保留 macOS 文件夹中的完整文件。"
  exit 1
fi
if [ -e "$destination" ]; then
  echo "目标目录已存在：$destination。请先检查已有版本；本脚本不会覆盖它。"
  exit 1
fi
/usr/bin/shasum -a 256 -c SHA256SUMS.txt
mkdir -p "$HOME/Applications"
staging=$(mktemp -d "$HOME/Applications/.Scientific-Revolution.XXXXXX")
trap 'rmdir "$staging" 2>/dev/null || true' EXIT
/usr/bin/ditto -x -k "$archive" "$staging"
app="$staging/科学革命.app"
if [ ! -d "$app" ]; then
  echo "未找到科学革命.app，解包内容保留在：$staging"
  exit 1
fi
/usr/bin/codesign --verify --deep --strict "$app"
mv "$staging" "$destination"
echo "应用已准备：$destination/科学革命.app"
echo "请在 Finder 中打开它；首次启动按启动说明处理系统提示。"
echo "若提示找不到视频，选择同时含 content.json 和 视频 的出版物根目录。"
