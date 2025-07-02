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

# Compile only the target service's TypeScript code
RUN npx tsc --project services/websocket-server/tsconfig.json


# Stage 2: The Production Image
# This stage creates the final, lean image with only what's needed for runtime.
FROM node:20-slim

WORKDIR /app

# Copy the service's package.json to install only its production dependencies
COPY --from=builder /app/services/websocket-server/package.json ./package.json
RUN npm install --production

# Copy the compiled code from the builder stage
COPY --from=builder /app/services/websocket-server/dist/ ./dist/

# Expose the port the service runs on
EXPOSE 3001

# Define the command to run the compiled application
CMD ["node", "dist/index.js"] 