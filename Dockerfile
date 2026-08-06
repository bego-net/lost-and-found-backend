# Node.js 18 slim image
FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose backend port
EXPOSE 5000

ENV NODE_ENV=production

CMD ["node", "server.js"]
