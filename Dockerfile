# Dependencias
FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm install

# Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3003

# Copiamos solo los node_modules de la etapa anterior
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
EXPOSE 3003
CMD ["npm", "start"]