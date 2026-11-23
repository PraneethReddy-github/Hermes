FROM docker.io/library/node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 ships prebuilds; skipping install scripts avoids a node-gyp (python) build.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev

# Same base image: native modules (better-sqlite3, @node-rs/argon2) built above run here unchanged.
FROM docker.io/library/node:22-bookworm-slim
WORKDIR /app
ENV TZ=UTC HERMES_DATA_DIR=/data NODE_ENV=production PORT=3000 BODY_SIZE_LIMIT=3M
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
# uid 1000 is the node image's built-in user; rename it.
RUN usermod -l hermes node && groupmod -n hermes node \
	&& mkdir /data && chown hermes:hermes /data
USER hermes
VOLUME /data
EXPOSE 3000
CMD ["node", "build"]
