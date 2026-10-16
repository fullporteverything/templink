FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3100 DATA_DIR=/data
COPY --from=build /app ./
VOLUME /data
EXPOSE 3100
CMD ["npm", "start"]
