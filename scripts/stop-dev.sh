#!/bin/sh
# Next 開発サーバーなどが掴んでいるよく使うポートを解放（Mac の lsof 想定）
for p in 3000 3001 3007 3010; do
  pids=$(lsof -t -i:"$p" 2>/dev/null | tr "\n" " ")
  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null || true
    echo "[stop] freed port $p"
  fi
done
echo "[stop] done"
