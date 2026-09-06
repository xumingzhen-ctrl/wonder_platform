#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "==> 正在汇总分红数据集..."
python3 scripts/build_dataset.py

echo "==> 正在编译生成静态页面..."
python3 scripts/build_site.py

echo "==> 编译完成！产出："
ls -lh site/
