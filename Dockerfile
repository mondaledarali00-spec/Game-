# GymFlow payment bridge — the only server this app needs.
#   docker build -t gymflow-bridge .
#   docker run -d --name gymflow -p 8787:8787 --env-file backend/.env -v gymflow-data:/data gymflow-bridge
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    DATA_DIR=/data

# The bridge has zero npm dependencies — only the source is needed.
COPY package.json ./
COPY backend ./backend
COPY webapp ./webapp
COPY docs ./docs

RUN mkdir -p /data && addgroup -S gym && adduser -S gym -G gym && chown -R gym:gym /data /app
USER gym

EXPOSE 8787
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/server.mjs"]
