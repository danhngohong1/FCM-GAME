FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /srv

# Server không có thư viện phụ thuộc, chỉ cần package.json và server.js
COPY package.json server.js ./
COPY app ./app
COPY design ./design
COPY assets ./assets

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server.js"]
