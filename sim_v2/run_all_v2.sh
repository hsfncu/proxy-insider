#!/bin/bash
# v2 全因子實驗：3 模型 × 32 配置 × 360 題 × 3 次重複。
set -u
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BASE" || exit 1
# 執行前請先啟用含 vLLM 0.31.0 的 Python 環境（見 requirements.txt）
R="$BASE/results_v2"; mkdir -p "$R"
rm -f "$R/ALL_DONE" "$R/INCOMPLETE"
LOG="$R/run_all_v2.log"
EXPECT=$((360 * 32 * 3))
echo "=== RUN_ALL_V2 START $(date) (expect ${EXPECT}/model) ===" >> "$LOG"
run_model () {
  local tag="$1"; shift
  echo ">>> [$tag] START $(date)" >> "$LOG"
  python sim_v2/runner_v2.py --clean-env "$BASE/env" \
    --tasks "$BASE/tasks.jsonl" --out "$R/results_${tag}.jsonl" \
    --configs all --reps 3 --resume "$@" >> "$LOG" 2>&1
  echo ">>> [$tag] DONE $(date) rc=$? lines=$(wc -l < "$R/results_${tag}.jsonl")/${EXPECT}" >> "$LOG"
}
run_model qwen3_8b   --model Qwen/Qwen3-8B         --gpu-mem 0.85
run_model glm4_9b    --model zai-org/GLM-4-9B-0414 --gpu-mem 0.85
run_model phi4_fp8   --model microsoft/phi-4       --gpu-mem 0.90 --quant fp8
ok=1
for tag in qwen3_8b glm4_9b phi4_fp8; do
  n=$(grep -vc '"error": "' "$R/results_${tag}.jsonl" 2>/dev/null || echo 0)
  [ "$n" -lt "$EXPECT" ] && ok=0 && echo "!!! [$tag] 不完整: ${n}/${EXPECT}" >> "$LOG"
done
echo "=== RUN_ALL_V2 DONE $(date) ===" >> "$LOG"
[ "$ok" -eq 1 ] && touch "$R/ALL_DONE" || touch "$R/INCOMPLETE"
