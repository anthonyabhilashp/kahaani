# Multi-stage build for Next.js app
FROM node:20-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install -U yt-dlp --break-system-packages

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
FROM base AS deps
COPY package*.json ./
COPY scripts/ ./scripts/
RUN npm install --only=production

# Build stage
FROM base AS builder
COPY package*.json ./
COPY scripts/ ./scripts/
RUN npm install
COPY . .

# Run font setup
RUN bash scripts/setup-fonts.sh || true

# Build Next.js app
# Use build args for NEXT_PUBLIC_* vars (baked into client-side JS)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

# Production stage
FROM node:20-slim AS runner
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install -U yt-dlp --break-system-packages

# Copy fonts from builder
COPY --from=builder /app/fonts /app/fonts
RUN fc-cache -f -v

# Set environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy built app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/next.config.js ./next.config.js

# Expose port
EXPOSE 3000

# Start app
CMD ["npm", "start"]
