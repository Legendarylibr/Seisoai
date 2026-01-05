# Backend Dockerfile - Multi-stage build for minimal image size
# Final image: ~180MB (optimized from ~500MB+ single-stage)

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:22-alpine AS deps

WORKDIR /deps

# Install build dependencies for native modules (bcrypt, etc.)
RUN apk add --no-cache python3 make g++

# Copy root package files
COPY package*.json ./

# Copy backend package files
COPY backend/package*.json ./backend/

# Install root dependencies (production only)
RUN npm ci --omit=dev --ignore-scripts --prefer-offline

# Install backend dependencies
WORKDIR /deps/backend
RUN npm ci --omit=dev --prefer-offline

# Clean up
RUN npm cache clean --force

# ============================================
# Stage 2: Build Frontend
# ============================================
FROM node:22-alpine AS frontend-builder

WORKDIR /build

# Copy package files
COPY package*.json ./

# Install ALL dependencies (need devDeps for build)
RUN npm ci --ignore-scripts --prefer-offline

# Copy frontend source
COPY index.html ./
COPY vite.config.ts tsconfig.json tsconfig.node.json postcss.config.js tailwind.config.ts ./
COPY src ./src
COPY public ./public

# Build frontend
ENV NODE_ENV=production
RUN npm run build

# ============================================
# Stage 3: Production Runtime
# ============================================
FROM node:22-alpine AS production

# Metadata
LABEL maintainer="Seiso AI Team"
LABEL version="1.0"
LABEL description="Seiso AI Backend - Optimized production image"

# Install runtime dependencies only
RUN apk add --no-cache \
    ffmpeg \
    dumb-init \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy production dependencies from deps stage
COPY --from=deps /deps/node_modules ./node_modules
COPY --from=deps /deps/backend/node_modules ./backend/node_modules

# Copy backend source
COPY backend ./backend
COPY serve-real-backend.ts ./
COPY package*.json ./

# Copy built frontend
COPY --from=frontend-builder /build/dist ./dist

# Create logs directory
RUN mkdir -p backend/logs \
    && chown -R node:node /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3001

# Security: Run as non-root user
USER node

EXPOSE 3001

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -q --spider http://localhost:3001/api/health || exit 1

# Start the application
CMD ["node", "--import", "tsx", "serve-real-backend.ts"]

