# hitokoto-sign-plugin

自动获取一言内容，定时更新 QQ 个性签名和 QQ 空间说说的插件。

## 支持协议端

| 协议端 | 文件 | 签名 | 说说 |
|--------|------|------|------|
| LLOneBot | `app/autosign-llonebot.js` | ✅ | ❌ |
| Napcat | `app/napcat-hitokoto.js` | ✅ | ✅ |

## 安装与更新

### TRSSYz / Yunzai-Bot

```bash
# 直接克隆
git clone --depth=1 https://github.com/YUYUYUYU2147/hitokoto-sign-plugin ./plugins/hitokoto-sign-plugin/

# 国内加速
git clone --depth=1 https://ghproxy.com/https://github.com/YUYUYUYU2147/hitokoto-sign-plugin ./plugins/hitokoto-sign-plugin/
```

将对应协议端的 `.js` 文件放入 TRSSYz 的 `plugins` 目录。

## 配置

首次启动后自动生成 `config.json`，可手动编辑：

```json
{
  "signCron": "0 */6 * * ?",
  "shuoshuoCron": "0 */2 * * ?",
  "enableSignUpdate": true,
  "enableShuoshuoUpdate": true,
  "hitokotoApi": "https://v1.hitokoto.cn",
  "napcatHttp": "http://127.0.0.1:3004/",
  "napcatToken": "你的token",
  "masterQq": "你的QQ号"
}
```

## 指令

| 指令 | 说明 |
|------|------|
| `#nap签名开启/关闭` | 开关签名自动更新 |
| `#nap说说开启/关闭` | 开关说说自动发送 |
| `#nap立即更新签名` | 立即更新签名 |
| `#nap立即更新说说` | 立即发布说说 |
| `#nap设置签名频率 0 */6 * * ?` | 设置签名更新频率 |
| `#nap设置说说频率 0 */2 * * ?` | 设置说说发送频率 |
| `#nap插件状态` | 查看当前配置 |

## 常用 Cron 表达式

| 表达式 | 含义 |
|--------|------|
| `0 */2 * * * ?` | 每2小时 |
| `0 */6 * * * ?` | 每6小时 |
| `0 0 12 * * ?` | 每天12:00 |
| `0 30 9 * * ?` | 每天9:30 |

## 依赖

- TRSSYz 框架
- LLOneBot / Napcat (OneBot11 协议端)
- node-schedule
- node-fetch
- moment
