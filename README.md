# CBTI「测啤气」啤酒人格测试

啤酒人格测试 H5 应用 + 数据统计看板。用户完成测试生成专属啤酒人格（16型），后台自动记录行为数据，管理端可查看实时统计并导出报表。

## 文件说明

| 文件 | 说明 |
|---|---|
| `index.html` | 测试主页面（单文件，含全部题目/结果/分享逻辑与埋点代码）⚠️ 因体积较大（约21MB），需通过 GitHub 网页「Add file → Upload files」上传，或本地 git push |
| `server.js` | 后端服务：埋点接收、统计API、CSV导出（Express，零原生依赖） |
| `dashboard.html` | 数据看板页面（需口令访问） |
| `package.json` | 依赖声明（仅 express） |
| `Dockerfile` | 容器化部署配置 |

## 本地/服务器运行

```bash
npm install
ADMIN_TOKEN=你的看板口令 node server.js
# 访问 http://localhost:3000  （测试页）
# 访问 http://localhost:3000/dashboard （数据看板）
```

## Docker 部署（推荐，公司服务器/云主机通用）

```bash
docker build -t cbti-app .
docker run -d -p 3000:3000 \
  -e ADMIN_TOKEN=你的看板口令 \
  -v cbti-data:/app/data \
  --name cbti cbti-app
```

> 数据文件为 `cbti_events.jsonl`，建议挂载卷持久化。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 3000 | 服务端口 |
| `ADMIN_TOKEN` | cbti-admin-2026 | 看板访问口令，**生产环境务必修改** |

## 数据看板

- 地址：`/dashboard`，输入口令进入
- 指标：访问量、访客数、开始/完成/分享、开始率、完成率、分享率
- 维度：每日趋势、渠道来源对比、答题漏斗、16型人格分布、产品推荐排行
- 导出：趋势/渠道/人格三组数据均可按时间段导出 CSV（Excel 可直接打开）

## 渠道二维码

生成二维码时在网址后加 `?ch=渠道名` 即可区分来源，例如：

- `https://你的域名/?ch=pack` （1L罐联包包装）
- `https://你的域名/?ch=store` （终端打卡区物料）
- `https://你的域名/?ch=wechat` （朋友圈/公众号）

## 数据合规

仅采集匿名行为数据（随机访客ID、答题行为、结果类型），不采集姓名、手机号等任何个人信息。
