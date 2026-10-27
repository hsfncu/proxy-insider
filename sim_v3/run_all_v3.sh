#!/bin/bash
# v3 權限模型錯誤注入實驗：3 模型 × 6 配置 × 5 條件 × 360 題。
# 五種條件在同一個 process 內依序執行（跨 process 的批次排程會使少數題目的生成結果不同）。
set -u
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BASE" || exit 1
# 執行前請先啟用含 vLLM 0.31.0 的 Python 環境（見 requirements.txt）
R="$BASE/results_v3"; mkdir -p "$R"
rm -f "$R/ALL_DONE" "$R/INCOMPLETE"
LOG="$R/run_all_v3.log"
CONFIGS="0,8,7,16,22,31"
ERRORS="none,overperm:0.1,overperm:0.3,unreg:0.1,gap:terminal"
EXPECT=$((360 * 6 * 5))     # 每個模型應有的筆數 = 10,800

echo "=== RUN_ALL_V3 START $(date) (expect ${EXPECT}/model) ===" >> "$LOG"

run_model () {
  local tag="$1"; shift
  local out="$R/results_${tag}.jsonl"
  echo ">>> [$tag] START $(date)" >> "$LOG"
  python sim_v3/runner_v3.py --clean-env "$BASE/env" --tasks "$BASE/tasks.jsonl" \
    --out "$out" --errors "$ERRORS" --configs "$CONFIGS" --reps 1 --resume "$@" >> "$LOG" 2>&1
  echo ">>> [$tag] DONE $(date) rc=$? lines=$(wc -l < "$out")/${EXPECT}" >> "$LOG"
}

run_model qwen3_8b  --model Qwen/Qwen3-8B         --gpu-mem 0.85
run_model glm4_9b   --model zai-org/GLM-4-9B-0414 --gpu-mem 0.85
run_model phi4_fp8  --model microsoft/phi-4       --gpu-mem 0.90 --quant fp8

ok=1
for tag in qwen3_8b glm4_9b phi4_fp8; do
  f="$R/results_${tag}.jsonl"
  n=$(grep -vc '"error": "' "$f" 2>/dev/null || echo 0)
  [ "$n" -lt "$EXPECT" ] && ok=0 && echo "!!! [$tag] 不完整: ${n}/${EXPECT}" >> "$LOG"
done
echo "=== RUN_ALL_V3 DONE $(date) ===" >> "$LOG"
[ "$ok" -eq 1 ] && touch "$R/ALL_DONE" || touch "$R/INCOMPLETE"
