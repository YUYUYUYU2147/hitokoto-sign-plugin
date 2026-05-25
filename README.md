# napcat-hitokoto

基于 NapCat 协议，自动获取一言内容，定时更新 QQ 个性签名和 QQ 空间说说的 TRSS-Yunzai 插件。

## 介绍 📝

**napcat-hitokoto** 是一个 TRSS-Yunzai 插件，通过 NapCat HTTP API 实现签名自动更新和 QQ 空间说说自动发布。

> 💡 **Tip**
>
> 一言 API: https://v1.hitokoto.cn

> ⚠️ **Warning**
>
> 仅支持 **NapCatQQ** 协议端，依赖 NapCat 的 HTTP 服务。

## 特性

- 定时更新 QQ 个性签名（set_self_longnick + set_qq_profile）
- 定时发表 QQ 空间说说（QZone HTTP API）
- 多 Bot 独立配置，互不干扰
- 执行锁机制，防止重复发送
- 自动获取 Cookie 并计算 g_tk，直接调用 QZone 说说 API

## 安装 🔧

### TRSS-Yunzai 🚀

```bash
# 直接克隆
git clone --depth=1 https://github.com/YUYUYUYU2147/hitokoto-sign-plugin ./plugins/hitokoto-sign-plugin/

# 国内加速
git clone --depth=1 https://ghproxy.com/https://github.com/YUYUYUYU2147/hitokoto-sign-plugin ./plugins/hitokoto-sign-plugin/
```

然后复制文件到 plugins 目录：

```bash
cp plugins/hitokoto-sign-plugin/app/napcat-hitokoto.js plugins/napcat-hitokoto.js
```

无需额外安装依赖（依赖 TRSS-Yunzai 已有的 node-fetch、node-schedule、moment）。

## 前置条件

确保 NapCat 已开启 HTTP 服务：

```json
// NapCat 的 onebot11.json 配置
{
  "http": {
    "enable": true,
    "host": "0.0.0.0",
    "port": 3010
  },
  "token": "你的token"
}
```

## 配置

首次启动后自动在插件目录生成 `config-<QQ号>.json`，每个 Bot 独立配置：

```
plugins/
├── napcat-hitokoto.js
├── config-<QQ号1>.json
├── config-<QQ号2>.json
├── history-<QQ号1>.json
└── history-<QQ号2>.json
```

> 💡 **Tip**
>
> 插件目录通过 `import.meta.url` 自动获取，无需手动指定路径。

配置文件示例 `config-<QQ号>.json`：

```json
{
  "signCron": "0 0 */6 * * ?",
  "shuoshuoCron": "0 0 */2 * * ?",
  "enableSignUpdate": true,
  "enableShuoshuoUpdate": true,
  "hitokotoApi": "https://v1.hitokoto.cn",
  "hitokotoType": "",
  "signPrefix": "",
  "shuoshuoPrefix": "分享一条一言：",
  "napcatHttp": "http://127.0.0.1:3010/",
  "napcatToken": "你的token",
  "masterQq": "你的QQ号",
  "selfQq": ""
}
```

| 字段 | 说明 |
|------|------|
| `signCron` | 签名更新频率（7 位 cron） |
| `shuoshuoCron` | 说说发送频率（7 位 cron） |
| `enableSignUpdate` | 是否启用签名更新 |
| `enableShuoshuoUpdate` | 是否启用说说发送 |
| `hitokotoApi` | 一言 API 地址 |
| `hitokotoType` | 一言类型（空=随机） |
| `signPrefix` / `shuoshuoPrefix` | 签名/说说前缀 |
| `napcatHttp` | NapCat HTTP 服务地址 |
| `napcatToken` | NapCat HTTP 鉴权 token |
| `masterQq` | 主人 QQ 号 |

## 指令

| 指令 | 说明 | 权限 |
|------|------|------|
| `#nap签名开启` / `#nap签名关闭` | 开关签名自动更新 | 主人 |
| `#nap说说开启` / `#nap说说关闭` | 开关说说自动发送 | 主人 |
| `#nap立即更新签名` | 立即更新一次签名 | 主人 |
| `#nap立即更新说说` | 立即发布一条说说 | 主人 |
| `#nap插件状态` | 查看当前 Bot 配置状态 | 主人 |
| `#nap设置签名频率 <cron>` | 设置签名更新频率 | 主人 |
| `#nap设置说说频率 <cron>` | 设置说说发送频率 | 主人 |
| `#nap设置签名前缀<前缀>` | 设置签名前缀 | 主人 |
| `#nap设置说说前缀<前缀>` | 设置说说前缀 | 主人 |

## 常用 Cron 表达式（7位）

| 表达式 | 含义 |
|--------|------|
| `0 0 */2 * * ?` | 每2小时 |
| `0 0 */6 * * ?` | 每6小时 |
| `0 0 12 * * ?` | 每天12:00 |
| `0 30 9 * * ?` | 每天9:30 |
| `0 0 8 * * ?` | 每天8:00 |
| `0 0 0 * * ?` | 每天0:00 |

## 架构说明

### 多 Bot 隔离

每个 Bot 使用独立的配置文件、定时任务和执行锁：

- **独立配置**：`config-<selfQq>.json` — 每个 Bot 的 cron、开关等互不影响
- **独立定时任务**：`this._jobs[<selfQq>]` — 每个 Bot 拥有独立的定时器
- **执行锁**：`this._updating` Set — 同一 Bot 的同一操作不会并发执行（30 秒超时）

### 说说发布流程

```
获取一言内容
  → callNapcat('get_cookies', { domain: 'qzone.qq.com' })
  → 从 Cookie 提取 p_skey，计算 g_tk
  → callNapcat('get_login_info', {}) 获取 Bot QQ 号
  → 直接 POST QZone HTTP API 发表说说
```

### 路径自动检测

插件目录通过 `import.meta.url` 动态获取，无论在 Windows 还是 Linux 上都能正确找到配置文件。

## 故障排查

| 现象 | 可能原因 | 解决 |
|------|----------|------|
| `fetch failed` | NapCat HTTP 端口/地址不对 | 检查 `napcatHttp` 配置，确认 NapCat 端口 |
| `token verify failed` | token 不匹配 | 检查 NapCat `onebot11.json` 中的 token |
| 配置文件未生成 | 路径权限问题 | 确保插件目录可写 |
| 说说重复发送 | 多 Bot 启动时触发多次 init | 已通过执行锁修复 |
| 获取 Cookie 失败 | Bot 未登录 QZone | 确保 Bot 已登录 QQ 且可访问 QZone |

## 贡献者 ✨

<a href="https://github.com/YUYUYUYU2147/hitokoto-sign-plugin/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=YUYUYUYU2147/hitokoto-sign-plugin" />
</a>

## 依赖

- TRSS-Yunzai 框架
- NapCatQQ（HTTP 服务，端口 3010）
- node-schedule（定时任务）
- node-fetch（HTTP 请求）
- moment（时间格式化）
