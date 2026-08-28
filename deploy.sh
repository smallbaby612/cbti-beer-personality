#!/bin/bash
# CBTI「测啤气」一键部署脚本
# 适用：腾讯云/阿里云/华为云 轻量应用服务器（Ubuntu 20.04/22.04）
# 用法：sudo bash deploy.sh 你的看板口令

set -e

TOKEN="${1:-cbti-admin-2026}"
REPO="https://github.com/smallbaby612/cbti-beer-personality.git"

echo "===== 1/4 安装 Docker ====="
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker && systemctl start docker
else
  echo "Docker 已安装，跳过"
fi

echo "===== 2/4 拉取代码 ====="
if [ -d /opt/cbti ]; then
  cd /opt/cbti && git pull
else
  git clone "$REPO" /opt/cbti
  cd /opt/cbti
fi

echo "===== 3/4 构建镜像 ====="
docker build -t cbti-app .

echo "===== 4/4 启动服务 ====="
docker stop cbti 2>/dev/null || true
docker rm cbti 2>/dev/null || true
docker run -d \
  --name cbti \
  --restart unless-stopped \
  -p 80:3000 \
  -e ADMIN_TOKEN="$TOKEN" \
  -e DATA_DIR=/app/data \
  -v cbti-data:/app/data \
  cbti-app

echo ""
echo "======================================"
echo "  部署完成！"
echo "  测试页面：http://服务器IP/"
echo "  数据看板：http://服务器IP/dashboard"
echo "  看板口令：$TOKEN"
echo "======================================"
