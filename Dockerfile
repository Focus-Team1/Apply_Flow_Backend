FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate --schema=src/prisma/schema.prisma && npm run build
ENV NODE_ENV=production
EXPOSE 5000
CMD ["sh","-c","npx prisma migrate deploy --schema=src/prisma/schema.prisma && node dist/server.js"]
