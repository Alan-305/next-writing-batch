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

RUN npm run build \
  && npm prune --omit=dev

ENV NODE_ENV=production
ENV PROOFREAD_PYTHON=/opt/venv/bin/python

EXPOSE 3000
CMD ["npm", "run", "start"]
