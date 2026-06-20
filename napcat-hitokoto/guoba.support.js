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

function saveAll(data) {
  const bots = listBots()
  for (const qq of bots) {
    try {
      const p = path.join(dirPath, `config-${qq}.json`)
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
      for (const k of Object.keys(data)) {
        if (k in cfg) cfg[k] = data[k]
      }
      fs.writeFileSync(p, JSON.stringify(cfg, null, 2))
    } catch {}
  }
}

export const supportGuoba = () => ({
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
    schemas: [
      {
        component: 'SOFT_GROUP_BEGIN',
        label: 'Napcat-Hitokoto',
      },
      {
        field: 'enableSignUpdate',
        label: '自动更新签名',
        component: 'Switch',
      },
      {
        field: 'enableShuoshuoUpdate',
        label: '自动发送说说',
        component: 'Switch',
      },
      {
        component: 'Divider',
        label: '定时频率',
      },
      {
        field: 'signCron',
        label: '签名更新频率',
        helpMessage: 'Cron 表达式',
        component: 'EasyCron',
      },
      {
        field: 'shuoshuoCron',
        label: '说说发送频率',
        helpMessage: 'Cron 表达式',
        component: 'EasyCron',
      },
      {
        component: 'Divider',
        label: '一言API',
      },
      {
        field: 'hitokotoApi',
        label: '一言API地址',
        component: 'Input',
        componentProps: { placeholder: 'http://113.31.103.19:8848' },
      },
      {
        field: 'hitokotoType',
        label: '一言类型',
        helpMessage: '留空为随机，可选 a/b/c/d/e/f/g/h/i/j/k',
        component: 'Input',
        componentProps: { placeholder: '留空随机' },
      },
      {
        component: 'Divider',
        label: '前缀设置',
      },
      {
        field: 'signPrefix',
        label: '签名前缀',
        component: 'Input',
        componentProps: { placeholder: '可选，添加到一言前' },
      },
      {
        field: 'shuoshuoPrefix',
        label: '说说前缀',
        component: 'Input',
        componentProps: { placeholder: '分享一条一言：' },
      },
      {
        component: 'Divider',
        label: '连接设置',
      },
      {
        field: 'napcatHttp',
        label: 'Napcat HTTP地址',
        component: 'Input',
        componentProps: { placeholder: 'http://127.0.0.1:3010/' },
      },
      {
        field: 'napcatToken',
        label: 'Napcat Token',
        component: 'InputPassword',
      },
      {
        field: 'masterQq',
        label: '主人QQ',
        component: 'Input',
        componentProps: { placeholder: '1390963734' },
      },
    ],
    getConfigData() {
      const all = loadAll()
      const qqs = Object.keys(all)
      if (!qqs.length) return {}
      const cfg = all[qqs[0]]
      return {
        enableSignUpdate: !!cfg.enableSignUpdate,
        enableShuoshuoUpdate: !!cfg.enableShuoshuoUpdate,
        signCron: cfg.signCron || '0 0 */6 * * ?',
        shuoshuoCron: cfg.shuoshuoCron || '0 0 */2 * * ?',
        hitokotoApi: cfg.hitokotoApi || 'http://113.31.103.19:8848',
        hitokotoType: cfg.hitokotoType || '',
        signPrefix: cfg.signPrefix || '',
        shuoshuoPrefix: cfg.shuoshuoPrefix || '分享一条一言：',
        napcatHttp: cfg.napcatHttp || 'http://127.0.0.1:3010/',
        napcatToken: cfg.napcatToken || '',
        masterQq: cfg.masterQq || '',
      }
    },
    setConfigData(data, { Result }) {
      saveAll(data)
      return Result.ok({}, `已同步更新 ${listBots().length} 个Bot的配置`)
    },
  },
})
