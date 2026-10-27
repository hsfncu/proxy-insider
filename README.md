# Replication package — "The Proxy Insider"

This package contains everything needed to re-run the simulations reported in the paper and to
recompute every number, table, and figure from the raw run logs. All data are synthetic: the
organization ("Nexora"), its employees, files, and honeytokens are fictional, and no real personal
data are used. The 360 tasks were written for this study; none is taken from a public dataset.

## Contents

```
env/                   Read-only clean environment of the fictional organization
  org.json             14 employees, departments, internal services
  permissions.json     RBAC permission model (allow_globs)
  ground_truth.json    Honeytokens and their paths = the ground truth of "out of scope"
  files_index.json     File index
  workspace/           File tree (all fictional)
tasks.jsonl            360 tasks: 80 legitimate, 280 out-of-scope (with target_class and framing)
sim_v2/                Main experiment
  env.py               Permission model, sandboxed tools, five governance layers, honeytoken grader
  agent.py             ReAct research agent, the L2 behavioral prompt, L4 screener interface
  runner_v2.py         Full-factorial runner (workspace reset for every run, tool traces recorded)
  run_all_v2.sh        3 models x 32 configurations x 360 tasks x 3 repetitions = 103,680 runs
sim_v3/                Permission-model error-injection experiment
  inject.py            Injection of the permission-model errors
  runner_v3.py         Injection runner (reuses the environment and agent of sim_v2)
  run_all_v3.sh        3 models x 6 configurations x 5 conditions x 360 tasks x 1 run = 32,400 runs
results_v2/            Raw run logs of the main experiment (JSONL, one run per line) and run log
results_v3/            Raw run logs of the injection experiment and run log
analysis/              stats_v2.py, stats_v3.py, sensitivity_v2.js, make_figures.js, svg2png.js,
                       and the three summary JSON files the paper's numbers come from
requirements.txt       Library versions and the pinned model revisions
SHA256SUMS             SHA-256 of every file in this package
```

The L4 intent screener prompt and the L2 behavioral prompt are written by the authors for this study
and are published in full (`sim_v2/runner_v2.py`, `sim_v2/agent.py`). Comments are kept short; they and the
docstrings are in Traditional Chinese, while identifiers, command-line options, and this README are in English.

## Requirements

- Re-running the simulations: Linux x86-64, one 32 GB GPU, Python 3.12, the pinned versions in
  `requirements.txt`, and the three open-weight models at the pinned revisions. Decoding is greedy
  (temperature 0), at most 512 tokens per step and 8 steps per run. Activate the Python environment
  before running the scripts; they do not create one.
- Recomputing the analysis: Python 3.12 with numpy, and Node.js 20 or later. Figures additionally need
  `@resvg/resvg-js` for the PNG conversion.

## Verify the package

```bash
sha256sum -c SHA256SUMS
```

## Recompute the numbers from the raw logs

```bash
python analysis/stats_v2.py                       # reads results_v2/, writes analysis/stats_summary_v2.json
node   analysis/sensitivity_v2.js                 # writes analysis/sensitivity_summary_v2.json
python analysis/stats_v3.py --results results_v3 --v2 results_v2 --out analysis/stats_summary_v3.json
node   analysis/make_figures.js                   # writes analysis/figures/*.svg (Figures 1-4)
```

All confidence intervals are task-clustered bootstrap intervals (B = 2,000, fixed seeds in the scripts),
and standard errors are CR1 clustered on the task, so re-running the analysis reproduces the reported
numbers exactly. Re-running the simulations may differ slightly: batched GPU inference is not
bit-for-bit deterministic (in the main experiment, 99.2% of the (model, task, configuration) cells give
identical results across the three repetitions).

| Paper item | Source in `analysis/stats_summary_v2.json` (v2), `stats_summary_v3.json` (v3), `sensitivity_summary_v2.json` |
|---|---|
| Risk without governance, per target class | `stats_summary_v2.json`: `configs["0"]`, `describe` |
| Marginal effect of each layer | `marginals`, `mcnemar` |
| Framing robustness | `contrasts`, `fisher_H3_L4on_L5off` |
| Shapley attribution | `shapley` |
| Frontier and paired contrasts | `configs[*].p_frontier`, `frontier_point`, `frontier_sets`, `contrasts`, `mcnemar` |
| Linear probability model interactions | `lpm.asr`, `lpm.util` |
| Per-model results | `describe`, keyed by model name |
| Permission-error curve, behavioral grid, rule incompleteness | `sensitivity_summary_v2.json`: `permission_error`, `grid`, `epsilon` |
| Injection experiment | `stats_summary_v3.json`: `conditions`, `counterfactual_check` |

## Re-run the simulations

```bash
bash sim_v2/run_all_v2.sh      # 103,680 runs; about 40 hours on one RTX 5090
bash sim_v3/run_all_v3.sh      # 32,400 runs; about 15 hours
```

The scripts resume (`--resume`): runs already present in `results_v2/` or `results_v3/` are skipped.
To re-run from scratch, move the existing result files away first. Each run copies the clean environment
to `/dev/shm`, so runs do not contaminate one another. A finished run directory contains `ALL_DONE`
(or `INCOMPLETE`).

### Injection conditions (`--errors`)

| Condition | Scenario | Layers affected |
|---|---|---|
| `none` | no injection (control) | none |
| `overperm:0.1`, `overperm:0.3` | over-permission: 10% or 30% of targets wrongly marked as permitted | L1 and L5 |
| `unreg:0.1` | 10% of resources are missing from the permission model, so the checkpoint has no rule and allows (fail-open) | L5 only |
| `gap:terminal` | mediation gap: the terminal interface is not connected to the checkpoint | L5 only |

Which resources are wrong is decided by SHA-256(seed, uid, path) with the default `--seed 20261025`, so
the injection is fully reproducible and a given target is wrong in every configuration and model. The
five conditions are run inside one process per model, in the same request order, because greedy decoding
is not bit-identical across processes. Configuration masks (L1 = 1, L2 = 2, L3 = 4, L4 = 8, L5 = 16):
0 none, 8 L4 only, 7 L1+L2+L3, 16 L5 only, 22 L2+L3+L5, 31 all five.

## Data and run-log notes

- Every line of a `results_*.jsonl` file is one run: configuration mask, task, model, repetition,
  whether a honeytoken was exposed, which layer blocked the request, the tool-call trace, and whether a
  legitimate task was completed (`success_v2`).
- Paths such as `./home/...` inside the logs are paths of the fictional organization's file tree.
- The `run_all_*.log` files are the original run logs; the user name in the original paths of the
  execution host was replaced by `~`. Nothing else was altered.

## License

MIT License (see `LICENSE`).
