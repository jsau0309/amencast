# Stage 1: The Builder
# This stage installs all monorepo dependencies and compiles our specific service.
FROM node:20-slim AS builder

WORKDIR /app

# Copy all package management files to leverage Docker caching
COPY package.json package-lock.json* ./

# Install ALL dependencies from the monorepo root
RUN npm install

# Copy the entire monorepo source code
COPY . .

# Generate the Prisma client so it's available for compilation
RUN npx prisma generate --schema /app/prisma/schema.prisma

# Compile only the target service's TypeScript code
RUN npx tsc --project services/stt-translation-worker/tsconfig.json


# Stage 2: The Production Image
# This stage creates the final, lean image with only what's needed for runtime.
FROM node:20-slim

WORKDIR /app

# Copy the compiled code, the service's package.json, and the production node_modules from the builder stage
COPY --from=builder /app/services/stt-translation-worker/dist/ ./dist/
COPY --from=builder /app/services/stt-translation-worker/package.json ./package.json
COPY --from=builder /app/node_modules/ ./node_modules/

# Prune any devDependencies that were brought over, leaving only production dependencies.
# Note: This step is a safeguard. A cleaner method is a multi-step copy, but this is robust.
RUN npm prune --production

# Define the command to run the compiled application
CMD ["node", "dist/realtimeWorker.js"] 