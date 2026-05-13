"""一時診断スクリプト：本番と同じプロンプトで Sonnet 4.6 を直接叩き、生出力を表示する。
使い終わったら削除してよい。
"""
from __future__ import annotations

import os
import sys

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

# .env.local の値を読み込む（NEXT_WRITING_BATCH_KEY を取りに行く）
for line in open(os.path.join(os.path.dirname(_THIS_DIR), ".env.local"), encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    os.environ.setdefault(k.strip(), v.strip())

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
print(f"[diag] prompt_chars={len(prompt)}")

client = Anthropic(api_key=os.environ["NEXT_WRITING_BATCH_KEY"].strip())
res = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=8192,
    temperature=0.25,
    messages=[{"role": "user", "content": prompt}],
)

stop_reason = getattr(res, "stop_reason", None)
usage = getattr(res, "usage", None)
in_tok = getattr(usage, "input_tokens", None)
out_tok = getattr(usage, "output_tokens", None)
parts = []
for blk in res.content:
    if getattr(blk, "type", None) == "text":
        parts.append(getattr(blk, "text", ""))
text_out = "".join(parts)

print(f"[diag] stop_reason={stop_reason} input_tokens={in_tok} output_tokens={out_tok} text_chars={len(text_out)}")
print("===== RAW OUTPUT START =====")
print(text_out)
print("===== RAW OUTPUT END =====")
