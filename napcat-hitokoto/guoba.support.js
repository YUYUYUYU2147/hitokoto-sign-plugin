import fs from 'node:fs'
import path from 'node:path'

const dirPath = path.join(process.cwd(), 'plugins/napcat-hitokoto/')

function listBots() {
  try {
    return fs.readdirSync(dirPath)
      .filter(f => f.startsWith('config-') && f.endsWith('.json'))
      .map(f => f.replace('config-', '').replace('.json', ''))
  } catch { return [] }
}

function loadAll() {
  const bots = listBots()
  const merged = {}
  for (const qq of bots) {
    try {
      const raw = fs.readFileSync(path.join(dirPath, `config-${qq}.json`), 'utf8')
      merged[qq] = JSON.parse(raw)
    } catch {}
  }
  return merged
}

export const supportGuoba = () => {
  const bots = listBots()

  const schemas = [
    { component: 'SOFT_GROUP_BEGIN', label: 'Napcat-Hitokoto' },
    { field: 'enableSignUpdate', label: '自动更新签名', component: 'Switch' },
    { field: 'enableShuoshuoUpdate', label: '自动发送说说', component: 'Switch' },
    { component: 'Divider', label: '定时频率' },
    { field: 'signCron', label: '签名更新频率', helpMessage: 'Cron 表达式', component: 'EasyCron' },
    { field: 'shuoshuoCron', label: '说说发送频率', helpMessage: 'Cron 表达式', component: 'EasyCron' },
    { component: 'Divider', label: '一言API' },
    { field: 'hitokotoApi', label: '一言API地址', component: 'Input', componentProps: { placeholder: 'http://113.31.103.19:8848' } },
    { field: 'hitokotoType', label: '一言类型', helpMessage: '留空为随机，可选 a/b/c/d/e/f/g/h/i/j/k', component: 'Input', componentProps: { placeholder: '留空随机' } },
    { component: 'Divider', label: '前缀设置' },
    { field: 'signPrefix', label: '签名前缀', component: 'Input', componentProps: { placeholder: '可选，添加到一言前' } },
    { field: 'shuoshuoPrefix', label: '说说前缀', component: 'Input', componentProps: { placeholder: '分享一条一言：' } },
    { component: 'Divider', label: '主人设置' },
    { field: 'masterQq', label: '主人QQ', component: 'Input', componentProps: { placeholder: '1390963734' } },
  ]

  for (const qq of bots) {
    schemas.push(
      { component: 'Divider', label: `Bot ${qq} 连接设置` },
      { field: `bot_${qq}.napcatHttp`, label: `Napcat HTTP地址`, helpMessage: qq, component: 'Input', componentProps: { placeholder: 'http://127.0.0.1:3010/' } },
      { field: `bot_${qq}.napcatToken`, label: `Napcat Token`, helpMessage: qq, component: 'InputPassword' },
    )
  }

  return {
    pluginInfo: {
      name: 'napcat-hitokoto',
      title: 'Napcat-Hitokoto',
      description: '定时获取一言内容，通过Napcat协议更新签名与说说',
      author: '@Assistant',
      link: '',
      isV3: true,
      isV2: false,
      showInMenu: 'auto',
    },
    configInfo: {
      schemas,
      getConfigData() {
        const all = loadAll()
        const qqs = Object.keys(all)
        const data = {}
        if (!qqs.length) return data
        const cfg = all[qqs[0]]
        data.enableSignUpdate = !!cfg.enableSignUpdate
        data.enableShuoshuoUpdate = !!cfg.enableShuoshuoUpdate
        data.signCron = cfg.signCron || '0 0 */6 * * ?'
        data.shuoshuoCron = cfg.shuoshuoCron || '0 0 */2 * * ?'
        data.hitokotoApi = cfg.hitokotoApi || 'http://113.31.103.19:8848'
        data.hitokotoType = cfg.hitokotoType || ''
        data.signPrefix = cfg.signPrefix || ''
        data.shuoshuoPrefix = cfg.shuoshuoPrefix || '分享一条一言：'
        data.masterQq = cfg.masterQq || ''
        for (const qq of qqs) {
          data[`bot_${qq}.napcatHttp`] = all[qq].napcatHttp || ''
          data[`bot_${qq}.napcatToken`] = all[qq].napcatToken || ''
        }
        return data
      },
      setConfigData(data, { Result }) {
        const all = loadAll()
        for (const qq of Object.keys(all)) {
          const cfg = all[qq]
          const sharedKeys = ['enableSignUpdate', 'enableShuoshuoUpdate', 'signCron', 'shuoshuoCron', 'hitokotoApi', 'hitokotoType', 'signPrefix', 'shuoshuoPrefix', 'masterQq']
          for (const k of sharedKeys) {
            if (k in data && k in cfg) cfg[k] = data[k]
          }
          if (`bot_${qq}.napcatHttp` in data) cfg.napcatHttp = data[`bot_${qq}.napcatHttp`]
          if (`bot_${qq}.napcatToken` in data) cfg.napcatToken = data[`bot_${qq}.napcatToken`]
          try { fs.writeFileSync(path.join(dirPath, `config-${qq}.json`), JSON.stringify(cfg, null, 2)) } catch {}
        }
        return Result.ok({}, `已保存 ${Object.keys(all).length} 个Bot的配置`)
      },
    },
  }
}
