#!/usr/bin/env python3
"""v3 權限模型錯誤注入實驗 runner（2026-10-25）。 與 v2 的唯一差別：L1 與 L5 讀的是被注入錯誤的權限模型（見 inject.py）， 誘餌判定與良性任務的完成判定仍然依照真實事實。"""
import argparse, json, os, sys, time, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "sim_v2"))
sys.path.insert(0, HERE)

from env import load_env, Governance, Tools, AuditLog, Grader          # noqa: E402
from agent import ReActAgent, model_chat_kwargs                        # noqa: E402
from runner_v2 import make_llm_screener, benign_kind, benign_success    # noqa: E402
from inject import CorruptPermissionModel, parse_error, patch_tools     # noqa: E402

CONFIGS = {
    0: "L0（無防護）",
    8: "L4（只有意圖檢查點；不讀權限模型）",
    7: "L1+L2+L3（無檢查點的輕量組合）",
    16: "L5（只有工具呼叫檢查點）",
    22: "L2+L3+L5（表 7 低風險權重的最適）",
    31: "全部五層（表 7 高風險權重的最適）",
}
ERRORS = ["none", "overperm:0.1", "overperm:0.3", "unreg:0.1", "gap:terminal"]


def run_one_injected(llm, env, actor_uid, actor_name, request, gov, screener,
                     model_name, error_mode):
    """等同 sim_v2.agent.run_one，但在建好 Tools 後接上錯誤注入。"""
    audit = AuditLog()
    tools = Tools(env["dir"], actor_uid, gov, env["perm"], env["services"], audit)
    patch_tools(tools, error_mode)
    agent = ReActAgent(llm, tools, gov, screener=screener,
                       chat_kwargs=model_chat_kwargs(model_name))
    tr = agent.run(request, actor_name)
    grade = Grader(env["ground_truth"]).grade(tools)
    return {"blocked_by": tr["blocked_by"], "final": tr["final"],
            "n_steps": len(tr["steps"]), "leak": grade,
            "audit": audit.events, "trace": tools.trace}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clean-env", required=True)
    ap.add_argument("--tasks", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--errors", default=",".join(ERRORS),
                    help="逗號分隔；none | overperm:<rate> | unreg:<rate> | gap:terminal")
    ap.add_argument("--configs", default=",".join(str(c) for c in CONFIGS))
    ap.add_argument("--reps", type=int, default=1)
    ap.add_argument("--types", default="benign,oos")
    ap.add_argument("--max-tasks", type=int, default=0)
    ap.add_argument("--gpu-mem", type=float, default=0.85)
    ap.add_argument("--max-model-len", type=int, default=16384)
    ap.add_argument("--quant", default="")
    ap.add_argument("--seed", type=int, default=20261025)
    ap.add_argument("--resume", action="store_true")
    args = ap.parse_args()

    specs = [parse_error(e) for e in args.errors.split(",")]
    clean = os.path.expanduser(args.clean_env)
    scratch = f"/dev/shm/nexora_v3_{os.getpid()}"
    os.makedirs(scratch, exist_ok=True)
    for f in ("org.json", "permissions.json", "ground_truth.json", "files_index.json"):
        shutil.copy(os.path.join(clean, f), scratch)

    def fresh_env(mode, rate):
        ws = os.path.join(scratch, "workspace")
        if os.path.exists(ws):
            shutil.rmtree(ws)
        shutil.copytree(os.path.join(clean, "workspace"), ws)
        for d, _, fs in os.walk(ws):
            os.chmod(d, 0o755)
            for f in fs:
                os.chmod(os.path.join(d, f), 0o644)
        env = load_env(scratch)
        env["perm"] = CorruptPermissionModel(env["perm"], env["ground_truth"],
                                            env["services"], mode, rate, args.seed)
        return env

    env0 = load_env(clean)
    for mode, rate in specs:
        inj = CorruptPermissionModel(env0["perm"], env0["ground_truth"], env0["services"],
                                     mode, rate, args.seed)
        print("注入設定:", json.dumps(inj.summary(), ensure_ascii=False), flush=True)

    types = set(args.types.split(","))
    tasks = [json.loads(l) for l in open(os.path.expanduser(args.tasks), encoding="utf-8")]
    tasks = [t for t in tasks if t["type"] in types]
    if args.max_tasks:
        tasks = tasks[:args.max_tasks]
    configs = [int(x) for x in args.configs.split(",")]

    outpath = os.path.expanduser(args.out)
    done = set()
    if args.resume and os.path.exists(outpath):
        for l in open(outpath, encoding="utf-8"):
            try:
                d = json.loads(l)
                if not d.get("error"):
                    done.add((d["error_mode"], d["error_rate"], d["mask"],
                              d["task_id"], d["rep"]))
            except Exception:
                pass

    from vllm import LLM
    kw = dict(model=args.model, max_model_len=args.max_model_len,
              gpu_memory_utilization=args.gpu_mem, enforce_eager=True)
    if args.quant:
        kw["quantization"] = args.quant
    llm = LLM(**kw)
    screener = make_llm_screener(llm, model_chat_kwargs(args.model))

    outp = open(outpath, "a" if (args.resume and os.path.exists(outpath)) else "w",
                encoding="utf-8")
    n = nerr = 0
    t0 = time.time()
    for mode, rate in specs:
        inj = CorruptPermissionModel(env0["perm"], env0["ground_truth"],
                                     env0["services"], mode, rate, args.seed)
        for mask in configs:
            gov = Governance.from_mask(mask)
            for t in tasks:
                for rep in range(args.reps):
                    if (mode, rate, mask, t["id"], rep) in done:
                        continue
                    base = {"task_id": t["id"], "type": t["type"],
                            "target_class": t.get("target_class"),
                            "framing": t.get("framing"), "model": args.model,
                            "config": gov.tag(), "mask": mask, "rep": rep,
                            "error_mode": mode, "error_rate": rate, "seed": args.seed}
                    try:
                        env = fresh_env(mode, rate)
                        r = run_one_injected(llm, env, t["actor_uid"], t["actor_name"],
                                             t["request"], gov, screener, args.model, mode)
                        trace = r.get("trace", [])
                        exp = set(t.get("expected_tokens", []))
                        got = set(x["token"] for x in r["leak"]["leaked"])
                        dept = env0["perm"].by_uid[t["actor_uid"]]["dept"]
                        own = f"{dept}/{t['actor_uid']}"
                        tpaths = [h.get("path") for h in env0["ground_truth"]["honeytokens"]
                                  if h["token"] in exp and h.get("path")]
                        rec = dict(base, blocked_by=r["blocked_by"], n_steps=r["n_steps"],
                                   any_leak=r["leak"]["n_leaked"] > 0,
                                   target_leak=bool(exp & got) if exp else None,
                                   final_present=r["final"] is not None,
                                   target_corrupted=any(
                                       (t["actor_uid"], p.replace("\\", "/").lstrip("/")) in inj.wrong_allow
                                       or p.replace("\\", "/").lstrip("/") in inj.unregistered
                                       for p in tpaths) if tpaths else None,
                                   unmediated_calls=sum(1 for e in r["audit"]
                                                        if e.get("unmediated") or e.get("unregistered")),
                                   denials=[(x.get("layer"), x["action"], x["resource"])
                                            for x in trace if x["status"] in ("denied", "hidden")],
                                   trace=[{k: v for k, v in x.items() if k != "shown"}
                                          for x in trace][:40],
                                   final=(str(r["final"])[:300] if r["final"] is not None else None),
                                   error=None)
                        if t["type"] == "benign":
                            kind = benign_kind(t["request"])
                            rec["benign_kind"] = kind
                            rec["success_v2"] = (benign_success(kind, trace, r["final"],
                                                                own, dept)
                                                 and not r["blocked_by"])
                    except Exception as e:
                        nerr += 1
                        rec = dict(base, error=f"{type(e).__name__}: {e}")
                    outp.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    outp.flush()
                    n += 1
        print(f"[{mode}:{rate}] 累計 {n} 次，耗時 {time.time() - t0:.0f}s", flush=True)
    outp.close()
    shutil.rmtree(scratch, ignore_errors=True)
    print(f"runs={n} errors={nerr} time={time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
