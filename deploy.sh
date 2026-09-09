#!/bin/bash
# CBTI「测啤气」一键部署脚本（国内服务器优化版）
# 适用：腾讯云/阿里云/华为云 轻量应用服务器（Ubuntu 20.04/22.04，大陆地域）
# 用法：sudo bash deploy.sh 看板口令 [对外端口，默认80]
# 示例：sudo bash deploy.sh mytoken 3000

set -e

TOKEN="${1:-cbti-admin-2026}"
PORT="${2:-80}"
REPO="https://github.com/smallbaby612/cbti-beer-personality.git"

echo "===== 1/5 安装 Docker（国内镜像源）====="
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh -s -- --mirror Aliyun || {
    echo "Aliyun 镜像失败，尝试手动 apt 安装..."
    apt-get update -qq
    apt-get install -y -qq docker.io
  }
  systemctl enable docker && systemctl start docker
else
  echo "Docker 已安装，跳过"
fi

echo "===== 2/5 配置 Docker 镜像加速 ====="
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.m.daocloud.io",
    "https://dockerproxy.net"
  ]
}
EOF
systemctl daemon-reload 2>/dev/null || true
systemctl restart docker

echo "===== 3/5 拉取代码 ====="
if [ -d /opt/cbti ]; then
  cd /opt/cbti && git pull || { cd / && rm -rf /opt/cbti && git clone "$REPO" /opt/cbti && cd /opt/cbti; }
else
  git clone "$REPO" /opt/cbti
  cd /opt/cbti
fi

echo "===== 4/5 构建镜像 ====="
docker build -t cbti-app .

echo "===== 5/5 启动服务 ====="
docker stop cbti 2>/dev/null || true
docker rm cbti 2>/dev/null || true
docker run -d \
  --name cbti \
  --restart unless-stopped \
  -p ${PORT}:3000 \
  -e ADMIN_TOKEN="$TOKEN" \
  -e DATA_DIR=/app/data \
  -v cbti-data:/app/data \
  cbti-app

IP=$(curl -s ifconfig.me 2>/dev/null || echo "服务器IP")
SUFFIX=""
[ "$PORT" != "80" ] && SUFFIX=":${PORT}"

echo ""
echo "======================================"
echo "  部署完成！"
echo "  测试页面：http://${IP}${SUFFIX}/"
echo "  数据看板：http://${IP}${SUFFIX}/dashboard"
echo "  看板口令：$TOKEN"
echo "======================================"
