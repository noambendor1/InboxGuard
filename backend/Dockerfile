# Multi-stage build: compile TypeScript, then run only the compiled output
# with production dependencies in a slim runtime image.

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist

# Cloud Run sets PORT automatically; 8080 is the documented default.
ENV PORT=8080
EXPOSE 8080

USER node

CMD ["node", "dist/index.js"]
