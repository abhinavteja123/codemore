"""False-positive fixture for core-security-path-traversal.

Every path component is a module-level UPPER_CASE constant or a string
literal — no untrusted input, so the rule must NOT fire (v1.3.0
constant-only narrowing; real-world FP shape from the AImentor scan).
"""
import json
import os

FIGURES_DIR = "figures"


def dump_fig2(data):
    with open(os.path.join(FIGURES_DIR, "fig2_bkt_data.json"), "w") as f:
        json.dump(data, f)


def load_fig3():
    with open(os.path.join(FIGURES_DIR, "fig3_reward_data.json")) as f:
        return json.load(f)
