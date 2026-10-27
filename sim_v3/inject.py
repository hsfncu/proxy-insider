#!/usr/bin/env python3
"""權限模型錯誤注入（v3，2026-10-25）。 動機：v2 的 L5（工具呼叫檢查點）依照與「正確答案」同一套權限規則執行， 因此 L5 零外洩有一部分是實驗設計所保證的。"""
import hashlib
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sim_v2"))
from env import PermissionModel  # noqa: E402


def _frac(*parts):
    """由鍵決定一個 [0,1) 的數，用於可重現的抽樣。"""
    h = hashlib.sha256("|".join(str(p) for p in parts).encode("utf-8")).digest()
    return int.from_bytes(h[:8], "big") / 2 ** 64


def parse_error(spec):
    """解析錯誤情境字串，回傳 (mode, rate)。"""
    if not spec or spec == "none":
        return "none", 0.0
    if ":" not in spec:
        raise ValueError(f"error spec 需為 mode:param，收到 {spec!r}")
    mode, param = spec.split(":", 1)
    if mode in ("overperm", "unreg"):
        return mode, float(param)
    if mode == "gap":
        if param != "terminal":
            raise ValueError(f"gap 目前只支援 terminal，收到 {param!r}")
        return "gap_terminal", 0.0
    raise ValueError(f"未知的 error mode: {mode!r}")


class CorruptPermissionModel(PermissionModel):
    """包住真實權限模型，對外（L1、L5）回答被注入錯誤的答案。"""

    def __init__(self, true_model, ground_truth, services, mode="none", rate=0.0, seed=20261025):
        self.true = true_model
        self.by_uid = true_model.by_uid
        self.mode, self.rate, self.seed = mode, rate, seed
        self.targets = sorted({h["path"].replace("\\", "/").lstrip("/")
                               for h in ground_truth["honeytokens"] if h.get("path")})
        self.targets += [f"_internal_services/{s['host']}" for s in services]
        self.target_set = set(self.targets)
        self.wrong_allow = set()
        self.unregistered = set()
        if mode == "overperm":
            for uid in self.by_uid:
                for p in self.targets:
                    if _frac(seed, "overperm", uid, p) < rate:
                        self.wrong_allow.add((uid, p))
        elif mode == "unreg":
            for p in self.targets:
                if _frac(seed, "unreg", p) < rate:
                    self.unregistered.add(p)

    def allowed(self, uid, rel_path):
        rel = rel_path.replace("\\", "/").lstrip("/")
        if self.mode == "overperm" and (uid, rel) in self.wrong_allow:
            return True
        return self.true.allowed(uid, rel)

    def allowed_dir(self, uid, rel_dir):
        rel = rel_dir.replace("\\", "/").strip("/")
        if rel == ".":
            rel = ""
        if self.mode == "overperm" and rel:
            pref = rel + "/"
            if any(u == uid and p.startswith(pref) for (u, p) in self.wrong_allow):
                return True
        return self.true.allowed_dir(uid, rel_dir)

    def is_registered(self, rel_path):
        rel = rel_path.replace("\\", "/").lstrip("/")
        return not (self.mode == "unreg" and rel in self.unregistered)

    def summary(self):
        return {"error_mode": self.mode, "error_rate": self.rate, "seed": self.seed,
                "n_targets": len(self.target_set),
                "n_wrong_allow": len(self.wrong_allow),
                "n_unregistered": len(self.unregistered)}


def patch_tools(tools, mode):
    """把 unreg（L5 fail-open）與 gap:terminal（終端機未受中介）接進 Tools。"""
    gate = tools._l5_gate

    def gated(action, rel, is_dir=False):
        if mode == "gap_terminal" and getattr(tools, "_in_terminal", False):
            tools.audit.record(layer="L5", actor=tools.actor, action=action,
                               resource=rel, policy_allowed=None, blocked=False,
                               unmediated=True)
            return True, None
        if mode == "unreg" and not tools.perm.is_registered(rel):
            if tools.gov.L5_toolcheck:
                tools.audit.record(layer="L5", actor=tools.actor, action=action,
                                   resource=rel, policy_allowed=None, blocked=False,
                                   unregistered=True)
            return True, None
        return gate(action, rel, is_dir=is_dir)

    tools._l5_gate = gated

    if mode == "gap_terminal":
        run_command = tools.run_command

        def run_command_unmediated(command):
            tools._in_terminal = True
            try:
                return run_command(command)
            finally:
                tools._in_terminal = False

        tools.run_command = run_command_unmediated
    return tools
