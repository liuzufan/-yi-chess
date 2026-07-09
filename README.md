# 弈 · 棋道

> 五子棋 / 围棋 / 象棋 三合一棋类游戏，内置国际顶尖 AI 算法

## 特性

- **三种棋类**：五子棋（连五为胜）、围棋（围地争雄）、象棋（楚河汉界）
- **四档难度**：入门 / 进阶 / 高手 / 大师
- **顶尖 AI**：
  - 五子棋：PVS 搜索 + VCF/VCT 威胁搜索 + 迭代加深 + 置换表 + 杀手着法
  - 围棋：MCTS 蒙特卡洛树搜索 + RAVE + 3x3 模式匹配 + 征子检测
  - 象棋：PVS + 置换表 + MVV-LVA 排序 + 静态搜索 + 25 路开局库
- **先手选择**：玩家可选先手或后手
- **实时胜率**：AI 思考时显示胜率评估
- **棋谱回放**：保存对局记录，支持回放查看
- **悔棋功能**：支持撤回上一步
- **响应式设计**：适配桌面和移动端
- **中式美学**：宣纸质感的棋盘、毛笔字风格棋子

## 在线试玩

- **Cloudflare Pages**: [https://yi-chess.pages.dev](https://yi-chess.pages.dev)
- **itch.io**: 待上线

## 本地运行

直接用浏览器打开 `弈.html` 即可，无需安装任何依赖。

或启动本地服务器：

```bash
# Python
python -m http.server 8765

# Node.js
npx serve
```

然后访问 `http://localhost:8765/弈.html`

## 项目结构

```
├── 弈.html                 # 游戏主文件（单文件，包含全部代码）
├── cloudflare-deploy/       # Cloudflare Pages 部署包
│   ├── index.html
│   ├── _headers
│   ├── _redirects
│   └── deploy.bat           # 一键部署脚本
├── wechat-minigame/         # 微信小游戏版
│   ├── game.js              # 主逻辑（1929行）
│   ├── game.json
│   └── project.config.json
├── itch-io-deploy/          # itch.io 上传包
│   ├── index.html
│   ├── cover.jpg
│   └── yi-chess-itchio.zip
└── deploy-guide/            # 部署上线指南
    └── deploy-guide.html
```

## 技术栈

- 纯原生 HTML / CSS / JavaScript（无框架依赖）
- Canvas 2D 绘图
- Web Storage API（localStorage 存储棋谱）
- AI 算法：PVS、MCTS、Alpha-Beta 剪枝、Zobrist 哈希、置换表

## 部署

### Cloudflare Pages

```bash
cd cloudflare-deploy
wrangler pages project create yi-chess --production-branch main
wrangler pages deploy . --project-name yi-chess --branch main
```

### 微信小游戏

1. 下载 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 导入 `wechat-minigame` 文件夹
3. 替换 `project.config.json` 中的 AppID
4. 预览测试后上传发布

### itch.io

1. 注册 [itch.io](https://itch.io/register) 账号
2. 上传 `itch-io-deploy/yi-chess-itchio.zip`
3. 设置为 HTML 游戏，发布

## License

MIT License - 可自由使用、修改、分发
