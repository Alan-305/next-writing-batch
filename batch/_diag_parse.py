"""一時診断: 生出力をパーサに通し、content_comment が壊れるか確認する。"""
from __future__ import annotations

import os
import sys

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

from nl_essay_feedback import parse_free_writing_feedback

# _diag_raw_call.py の RAW OUTPUT をここに貼ってもよいが、
# テスト性のため再度 API を叩く。
import os as _os
for line in open(os.path.join(os.path.dirname(_THIS_DIR), ".env.local"), encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    _os.environ.setdefault(k.strip(), v.strip())

from anthropic import Anthropic
from nl_essay_feedback import build_nl_essay_prompt

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

prompt = build_nl_essay_prompt(question=SAMPLE_QUESTION, user_answer=SAMPLE_ANSWER, multipart=False)
client = Anthropic(api_key=_os.environ["NEXT_WRITING_BATCH_KEY"].strip())
res = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=8192,
    temperature=0.25,
    messages=[{"role": "user", "content": prompt}],
)
parts = []
for blk in res.content:
    if getattr(blk, "type", None) == "text":
        parts.append(getattr(blk, "text", ""))
raw_text = "".join(parts).strip()

print(f"[diag] raw_text chars={len(raw_text)}")

(
    evaluation,
    general_comment,
    explanation,
    final_version,
    content_comment,
    grammar_comment,
    content_deduction,
    grammar_deduction,
) = parse_free_writing_feedback(raw_text)

print(f"[diag] evaluation={evaluation!r}")
print(f"[diag] general_comment chars={len(general_comment)}")
print(f"[diag] explanation chars={len(explanation)}")
print(f"[diag] final_version chars={len(final_version)}")
print(f"[diag] grammar_comment chars={len(grammar_comment)}")
print(f"[diag] content_deduction={content_deduction} grammar_deduction={grammar_deduction}")
print(f"[diag] content_comment chars={len(content_comment)}")
print("===== content_comment START =====")
print(content_comment)
print("===== content_comment END =====")
