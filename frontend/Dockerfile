# ── Stage 1: Build the React app ──────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# REACT_APP_API_URL is baked in at build time
ARG REACT_APP_API_URL=http://localhost:8000
ENV REACT_APP_API_URL=$REACT_APP_API_URL

RUN npm run build

# ── Stage 2: Serve with nginx ──────────────────────────
FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html

# Handle React Router — all routes go to index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
