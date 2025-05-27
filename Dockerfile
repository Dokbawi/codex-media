FROM node:18-slim

RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --force

COPY . .

RUN npm run build

RUN mkdir -p /app/processing

CMD ["npm", "run", "start:prod"]