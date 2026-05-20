FROM node:20-slim

RUN apt-get update && apt-get install -y chromium ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV AI_BACKEND=ollama
ENV OLLAMA_HOST=http://localhost:11434

CMD ["node", "index.js"]
