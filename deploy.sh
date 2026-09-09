#!/bin/bash
# CBTI「测啤气」一键部署脚本（国内服务器·免Docker版）
# 直接安装 Node.js 运行，避开 Docker 国内网络问题
# 用法：sudo bash deploy.sh 看板口令 [对外端口，默认80]
# 示例：sudo bash deploy.sh cbti2026ok 3000

set -e

TOKEN="${1:-cbti-admin-2026}"
PORT="${2:-80}"
REPO="https://github.com/smallbaby612/cbti-beer-personality.git"

echo "===== 1/4 安装 Node.js（国内镜像源）====="
if ! command -v node &> /dev/null; then
  curl -fsSL https://registry.npmmirror.com/-/binary/node/v20.18.1/node-v20.18.1-linux-x64.tar.gz -o /tmp/node.tar.gz
  mkdir -p /usr/local/node && tar -xzf /tmp/node.tar.gz -C /usr/local/node --strip-components=1
  ln -sf /usr/local/node/bin/node /usr/local/bin/node
  ln -sf /usr/local/node/bin/npm /usr/local/bin/npm
  ln -sf /usr/local/node/bin/npx /usr/local/bin/npx
  node -v && npm -v
else
  echo "Node.js 已安装：$(node -v)，跳过"
fi

echo "===== 2/4 拉取代码 ====="
if [ -d /opt/cbti ]; then
  cd /opt/cbti && git pull
else
  git clone "$REPO" /opt/cbti
  cd /opt/cbti
fi

echo "===== 3/4 安装依赖 ====="
npm config set registry https://registry.npmmirror.com
npm install --omit=dev

echo "===== 4/4 启动服务 ====="
mkdir -p /opt/cbti/data
# 停止旧进程
pkill -f "node /opt/cbti/server.js" 2>/dev/null || true
pkill -f "node server.js" 2>/dev/null || true
# 后台启动
ADMIN_TOKEN="$TOKEN" PORT="$PORT" DATA_DIR=/opt/cbti/data nohup node server.js > /opt/cbti/app.log 2>&1 &
# 写入开机自启
cat > /etc/systemd/system/cbti.service <<EOF
[Unit]
Description=CBTI Beer Personality Test
After=network.target

[Service]
WorkingDirectory=/opt/cbti
Environment=ADMIN_TOKEN=$TOKEN
Environment=PORT=$PORT
Environment=DATA_DIR=/opt/cbti/data
ExecStart=/usr/local/bin/node /opt/cbti/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable cbti

IP=$(curl -s ifconfig.me 2>/dev/null || echo "服务器IP")
SUFFIX=""
[ "$PORT" != "80" ] && SUFFIX=":${PORT}"

echo ""
echo "======================================"
echo "  部署完成！"
echo "  测试页面：http://${IP}${SUFFIX}/"
echo "  数据看板：http://${IP}${SUFFIX}/dashboard"
echo "  看板口令：$TOKEN"
echo "  日志查看：tail -f /opt/cbti/app.log"
echo "======================================"
