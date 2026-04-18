FROM node:20-alpine

WORKDIR /app

# 为了能处理可能存在的 workspace 依赖，我们将 package.json 复制过来
COPY package.json ./

# 由于没有 lock 文件会重新解析依赖，这里直接 install
RUN npm install

# 复制所有源代码
COPY . .

# 禁用导出静态文件模式，因为我们有 Next.js API Routes (insurance-inquiry)
ENV NODE_ENV=production
RUN npx next build

EXPOSE 3000

CMD ["npx", "next", "start"]
