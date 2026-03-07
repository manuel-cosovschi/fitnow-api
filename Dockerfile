FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies (production only)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy source
COPY src/ ./src/
COPY sql/ ./sql/

# Create uploads dir
RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["node", "src/server.js"]
