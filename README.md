# hitokoto-sign-plugin

自动获取一言内容，定时更新 QQ 个性签名和 QQ 空间说说的插件。

## 介绍 📝

**hitokoto-sign-plugin** 是一个 TRSSYz 的扩展插件，提供一言签名自动更新和 QQ 空间说说自动发布功能。

> 💡 **Tip**
>
> 一言 API: https://v1.hitokoto.cn

> ⚠️ **Warning**
>
> 仅支持 LLOneBot / NapCatQQ 等 OneBot11 协议端

## 支持协议端

| 协议端 | 文件 | 签名 | 说说 |
|--------|------|------|------|
| LLOneBot | `app/hitokoto-sign-plugin.js` | ✅ | ✅ (自动降级私聊) |
| Napcat | `app/napcat-hitokoto.js` | ✅ | ✅ |

## 安装与更新 🔧

### TRSSYz 🚀

```bash
# 直接克隆
git clone --depth=1 https://github.com/YUYUYUYU2147/hitokoto-sign-plugin ./plugins/hitokoto-sign-plugin/

# 国内加速
git clone --depth=1 https://ghproxy.com/https://github.com/YUYUYUYU2147/hitokoto-sign-plugin ./plugins/hitokoto-sign-plugin/
```

将对应协议端的 `.js` 文件放入 TRSSYz 的 `plugins` 目录。

## 安装依赖 📦

```bash
pnpm install --filter=hitokoto-sign-plugin
```

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

### Napcat（签名+说说）

| 指令 | 说明 |
|------|------|
| `#nap签名开启/关闭` | 开关签名自动更新 |
| `#nap说说开启/关闭` | 开关说说自动发送 |
| `#nap立即更新签名` | 立即更新签名 |
| `#nap立即更新说说` | 立即发布说说 |
| `#nap设置签名频率 0 */6 * * ?` | 设置签名更新频率 |
| `#nap设置说说频率 0 */2 * * ?` | 设置说说发送频率 |
| `#nap插件状态` | 查看当前配置 |

### LLOneBot（签名+说说）

> ⚠️ **Note**
>
> LLOneBot 不支持直接发 QQ 空间说说，说说会自动降级为私聊发送给主人。

| 指令 | 说明 |
|------|------|
| `#一言帮助` | 显示帮助 |
| `#一言签名开启/关闭` | 开关签名自动更新 |
| `#一言说说开启/关闭` | 开关说说自动发送 |
| `#一言立即更新签名` | 立即更新签名 |
| `#一言立即更新说说` | 立即发布说说 |
| `#一言插件状态` | 查看当前配置 |
| `#一言说说模式 qzone/private` | 设置说说模式 |
| `#设置签名前缀xxx` | 设置签名前缀 |
| `#设置说说前缀xxx` | 设置说说前缀 |
| `#设置签名时间 0 0 */6 * * *` | 设置签名 Cron（6位） |
| `#设置说说时间 0 0 * * * *` | 设置说说 Cron（6位） |
| `#一言全量扫描` | 扫描协议方法 |
| `#一言扫描协议` | 扫描协议层 |

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

## 贡献者 ✨

<a href="https://github.com/YUYUYUYU2147/hitokoto-sign-plugin/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=YUYUYUYU2147/hitokoto-sign-plugin" />
</a>

## 资源 📚

- [一言 API 文档](https://developer.hitokoto.cn/)
