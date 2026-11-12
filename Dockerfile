FROM node:20-alpine
RUN apk add --no-cache tzdata
ENV TZ=Europe/Berlin
WORKDIR /app
COPY server/package.json ./
RUN npm install --omit=dev
COPY server/server.js ./
COPY public ./public
ENV DATA_DIR=/data
VOLUME /data
EXPOSE 3000
CMD ["node", "server.js"]
