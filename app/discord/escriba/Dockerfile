FROM node:20-alpine AS build

RUN apk add --no-cache python3 make g++ libsodium-dev

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime

RUN apk add --no-cache libsodium

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN apk add --no-cache python3 make g++ libsodium-dev \
  && npm ci --omit=dev \
  && apk del python3 make g++ libsodium-dev

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
