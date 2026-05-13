"""一時診断: 同じ答案を 5 回 Sonnet 4.6 に投げて content_comment の質を比較。"""
from __future__ import annotations

import os
import sys

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)
for line in open(os.path.join(os.path.dirname(_THIS_DIR), ".env.local"), encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    os.environ.setdefault(k.strip(), v.strip())

from anthropic import Anthropic
from nl_essay_feedback import build_nl_essay_prompt, parse_free_writing_feedback

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
client = Anthropic(api_key=os.environ["NEXT_WRITING_BATCH_KEY"].strip())

for i in range(5):
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
    raw = "".join(parts).strip()
    (_, _, _, _, content_comment, _, _, _) = parse_free_writing_feedback(raw)
    has_hint = "【ヒント】" in content_comment
    has_3 = "③" in content_comment
    has_2 = "②" in content_comment
    has_1 = "①" in content_comment
    stop = getattr(res, "stop_reason", None)
    usage = getattr(res, "usage", None)
    out_tok = getattr(usage, "output_tokens", None)
    print(
        f"#{i+1} stop={stop} out_tok={out_tok} cc_chars={len(content_comment)} "
        f"①={has_1} ②={has_2} ③={has_3} 【ヒント】={has_hint}"
    )
