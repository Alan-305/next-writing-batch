FROM node:22-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# Python runtime for Day3/Day4 batch scripts
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --include=dev

COPY requirements.txt ./
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

COPY . .

# NEXT_PUBLIC_* はビルド時にバンドルに埋め込まれる。実値はリポジトリに含めない。
# Cloud Build: cloudbuild.yaml が Secret Manager から firebase-build.env を取得し --secret で渡す。
# ローカル: docker build --secret id=next_public_env,src=./firebase-build.env .
# 中身のテンプレート: firebase-build.env.example
RUN --mount=type=secret,id=next_public_env \
  bash -c 'set -euo pipefail && set -a && source /run/secrets/next_public_env && set +a && npm run build && npm prune --omit=dev'

ENV NODE_ENV=production
ENV PROOFREAD_PYTHON=/opt/venv/bin/python

EXPOSE 3000
CMD ["npm", "run", "start"]
