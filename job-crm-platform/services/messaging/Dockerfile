FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/sessions
EXPOSE 3001
CMD ["node", "src/index.js"]
