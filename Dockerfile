# Runs the whole of AuzMeet — Next.js and the signaling server — in one
# long-lived process, which is what WebRTC signaling requires.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY package.json next.config.mjs server.js signaling-server.js ./
COPY signaling ./signaling
EXPOSE 3000
# Override with `npm run signaling` to run signaling only.
CMD ["node", "server.js"]
