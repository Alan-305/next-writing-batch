"""一時診断: proofread_one を実行し、保存される explanation 全文を表示する。"""
from __future__ import annotations

import os
import sys

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

# .env.local
for line in open(os.path.join(os.path.dirname(_THIS_DIR), ".env.local"), encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    os.environ.setdefault(k.strip(), v.strip())

from gemini_proofread import proofread_one

SAMPLE_QUESTION = (
    "In about 80 words, describe one environmental problem in your community "
    "and propose a realistic solution."
)
SAMPLE_ANSWER = (
    "There is a serious environmental problem in my town. Many people throw "
    "away plastic bottles in the street. It makes the street very dirty and "
    "animals can eat the plastic and die. I think the goverment should make "
    "more trash cans in the park and street. Also we should teach children "
    "about recycling at school. If everyone work together, we can solve this "
    "problem. We must protect our environment for the next generation."
)

out = proofread_one(
    task_id="diag",
    student_id="diag",
    student_name="diag",
    original_essay=SAMPLE_ANSWER,
    question=SAMPLE_QUESTION,
    multipart=False,
    max_retries=2,
)

print(f"[diag] evaluation={out.evaluation!r}")
print(f"[diag] content_comment chars={len(out.content_comment)}")
print(f"[diag] grammar_comment chars={len(out.grammar_comment)}")
print(f"[diag] explanation chars={len(out.explanation)}")
print(f"[diag] content_deduction={out.content_deduction} grammar_deduction={out.grammar_deduction}")
print("===== content_comment =====")
print(out.content_comment)
print("===== explanation (UI displays this) =====")
print(out.explanation)
