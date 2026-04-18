# 阶段一：构建 Vite 静态资源
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# 阶段二：使用 Nginx 提供静态服务并反向代理 API
FROM nginx:alpine

# 复制刚才构建好的前端产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 覆盖默认的 Nginx 配置，使用我们写好的支持代理的配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
