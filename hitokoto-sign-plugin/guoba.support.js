import fs from 'node:fs'
import path from 'node:path'

const dirPath = path.join(process.cwd(), 'plugins/hitokoto-sign-plugin/')

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
    { component: 'SOFT_GROUP_BEGIN', label: '一言签名与说说' },
    { field: 'enabled', label: '启用插件', component: 'Switch' },
    { field: 'enableSignUpdate', label: '自动更新签名', component: 'Switch' },
    { field: 'enableShuoshuoUpdate', label: '自动发送说说', component: 'Switch' },
    { component: 'Divider', label: '定时频率' },
    { field: 'signCron', label: '签名更新频率', helpMessage: 'Cron 表达式', component: 'EasyCron' },
    { field: 'shuoshuoCron', label: '说说发送频率', helpMessage: 'Cron 表达式', component: 'EasyCron' },
    { component: 'Divider', label: '一言API' },
    { field: 'hitokotoApi', label: '一言API地址', component: 'Input', componentProps: { placeholder: 'https://v1.hitokoto.cn' } },
    { field: 'hitokotoType', label: '一言类型', helpMessage: '留空为随机，可选 a/b/c/d/e/f/g/h/i/j/k', component: 'Input', componentProps: { placeholder: '留空随机' } },
    { component: 'Divider', label: '说说模式' },
    { field: 'shuoshuoMode', label: '发送模式', component: 'Select', componentProps: { options: [{ label: '私聊主人', value: 'private' }, { label: 'Qzone空间（自动降级私聊）', value: 'qzone' }] } },
    { component: 'Divider', label: '前缀设置' },
    { field: 'signPrefix', label: '签名前缀', component: 'Input', componentProps: { placeholder: '可选，添加到一言前' } },
    { field: 'shuoshuoPrefix', label: '说说前缀', component: 'Input', componentProps: { placeholder: '分享一条一言：' } },
    { component: 'Divider', label: '主人设置' },
    { field: 'masterQq', label: '主人QQ', component: 'Input', componentProps: { placeholder: '1390963734' } },
  ]

  for (const qq of bots) {
    schemas.push(
      { component: 'Divider', label: `Bot ${qq} 连接设置` },
      { field: `bot_${qq}.llonebotHttp`, label: `LLOneBot HTTP地址`, helpMessage: qq, component: 'Input', componentProps: { placeholder: 'http://127.0.0.1:3001' } },
      { field: `bot_${qq}.llonebotToken`, label: `LLOneBot Token`, helpMessage: qq, component: 'InputPassword' },
    )
  }

  return {
    pluginInfo: {
      name: 'hitokoto-sign-plugin',
      title: '一言签名与说说',
      description: '定时获取一言内容，自动更新QQ签名和发送说说',
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
        data.enabled = cfg.enabled !== false
        data.enableSignUpdate = !!cfg.enableSignUpdate
        data.enableShuoshuoUpdate = !!cfg.enableShuoshuoUpdate
        data.signCron = cfg.signCron || '0 0 */6 * * *'
        data.shuoshuoCron = cfg.shuoshuoCron || '0 0 * * * *'
        data.hitokotoApi = cfg.hitokotoApi || 'https://v1.hitokoto.cn'
        data.hitokotoType = cfg.hitokotoType || ''
        data.shuoshuoMode = cfg.shuoshuoMode || 'private'
        data.signPrefix = cfg.signPrefix || ''
        data.shuoshuoPrefix = cfg.shuoshuoPrefix || '分享一条一言：'
        data.masterQq = cfg.masterQq || ''
        for (const qq of qqs) {
          data[`bot_${qq}.llonebotHttp`] = all[qq].llonebotHttp || ''
          data[`bot_${qq}.llonebotToken`] = all[qq].llonebotToken || ''
        }
        return data
      },
      setConfigData(data, { Result }) {
        const all = loadAll()
        for (const qq of Object.keys(all)) {
          const cfg = all[qq]
          const sharedKeys = ['enabled', 'enableSignUpdate', 'enableShuoshuoUpdate', 'signCron', 'shuoshuoCron', 'hitokotoApi', 'hitokotoType', 'shuoshuoMode', 'signPrefix', 'shuoshuoPrefix', 'masterQq']
          for (const k of sharedKeys) {
            if (k in data && k in cfg) cfg[k] = data[k]
          }
          if (`bot_${qq}.llonebotHttp` in data) cfg.llonebotHttp = data[`bot_${qq}.llonebotHttp`]
          if (`bot_${qq}.llonebotToken` in data) cfg.llonebotToken = data[`bot_${qq}.llonebotToken`]
          try { fs.writeFileSync(path.join(dirPath, `config-${qq}.json`), JSON.stringify(cfg, null, 2)) } catch {}
        }
        return Result.ok({}, `已保存 ${Object.keys(all).length} 个Bot的配置`)
      },
    },
  }
}
