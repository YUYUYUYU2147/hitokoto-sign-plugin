/**
 * 插件：自动一言签名与说说（Napcat）
 * 功能：定时获取一言内容，自动更新QQ签名和发送说说
 * 作者：Assistant
 * 版本：1.0.0
 */

import plugin from '../../lib/plugins/plugin.js'
import schedule from 'node-schedule'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import moment from 'moment'

// 定义插件目录（自动获取当前文件所在目录）
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dirPath = __dirname.replace(/\\/g, '/') + '/'

// 确保插件目录存在
if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true })
}

// 默认配置
const defaultConfig = {
  signCron: '0 0 */6 * * ?',
  shuoshuoCron: '0 0 */2 * * ?',
  enableSignUpdate: true,
  enableShuoshuoUpdate: true,
  hitokotoApi: '',
  hitokotoType: '',
  signPrefix: '',
  shuoshuoPrefix: '分享一条一言：',
  napcatHttp: '',
  napcatToken: '',
  masterQq: '',
  selfQq: ''
}

// 每个 Bot 独立配置
function getConfigPath(selfQq) {
  return path.join(dirPath, `config-${selfQq}.json`)
}

function loadConfig(selfQq) {
  const configPath = getConfigPath(selfQq)
  try {
    if (fs.existsSync(configPath)) {
      return { ...defaultConfig, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) }
    }
  } catch (e) {}
  const cfg = { ...defaultConfig, selfQq }
  try { fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8') } catch (e) {}
  return cfg
}

function saveConfig(selfQq, config) {
  try { fs.writeFileSync(getConfigPath(selfQq), JSON.stringify(config, null, 2), 'utf8') } catch (e) {}
}

// 兼容旧版 config.json
const legacyConfigPath = path.join(dirPath, 'config.json')
if (fs.existsSync(legacyConfigPath)) {
  try {
    const legacy = JSON.parse(fs.readFileSync(legacyConfigPath, 'utf8'))
    if (legacy.selfQq) {
      saveConfig(legacy.selfQq, { ...defaultConfig, ...legacy })
      fs.renameSync(legacyConfigPath, legacyConfigPath + '.bak')
      console.log('[Napcat-Hitokoto] 已迁移旧配置到 config-' + legacy.selfQq + '.json')
    }
  } catch (e) {}
}

// 全局单例：确保定时任务只初始化一次
let _globalJobs = null
let _globalUpdating = null
let _globalBotUinCache = null
let _globalInitDone = false

export class NapcatHitokotoPlugin extends plugin {
  constructor() {
    super({
      name: 'Napcat-Hitokoto',
      dsc: '定时获取一言内容，通过Napcat协议更新签名与说说',
      event: 'message',
      priority: 5001,
      rule: [
        { reg: '^#nap(签名|说说)(开启|关闭)$', fnc: 'toggleFeature' },
        { reg: '^#nap立即更新(签名|说说)$', fnc: 'updateNow' },
        { reg: '^#nap插件状态$', fnc: 'showStatus' },
        { reg: '^#nap设置(签名|说说)频率 (.+)$', fnc: 'setCron' },
        { reg: '^#nap设置(签名|说说)前缀(.*)$', fnc: 'setPrefix' }
      ]
    })
    // 使用全局单例，防止多次实例化导致重复任务
    if (!_globalJobs) _globalJobs = {}
    if (!_globalUpdating) _globalUpdating = new Set()
    if (!_globalBotUinCache) _globalBotUinCache = {}
    this._jobs = _globalJobs
    this._updating = _globalUpdating
    this._botUinCache = _globalBotUinCache
    // 只初始化一次定时任务
    if (!_globalInitDone) {
      _globalInitDone = true
      setTimeout(() => this._initSchedules(), 3000)
    }
  }

  /** 扫描已有配置文件，恢复定时任务 */
  _initSchedules() {
    try {
      const files = fs.readdirSync(dirPath).filter(f => f.startsWith('config-') && f.endsWith('.json'))
      for (const f of files) {
        const selfQq = f.replace('config-', '').replace('.json', '')
        // 跳过已存在任务的 Bot，防止重复创建
        if (this._jobs[selfQq]?.signJob || this._jobs[selfQq]?.shuoshuoJob) {
          console.log(`[Napcat-Hitokoto][${selfQq}] 定时任务已存在，跳过恢复`)
          continue
        }
        const cfg = loadConfig(selfQq)
        if (cfg.enableSignUpdate || cfg.enableShuoshuoUpdate) {
          this.refreshSchedule(selfQq, cfg)
          console.log(`[Napcat-Hitokoto][${selfQq}] 已恢复定时任务`)
        }
      }
    } catch (e) {
      console.error('[Napcat-Hitokoto] 初始化调度失败', e)
    }
  }

  getConfig(e) {
    const selfQq = e?.bot?.self_id || e?.self_id || ''
    return loadConfig(selfQq)
  }

  getSelfQq(e) {
    return e?.bot?.self_id || e?.self_id || ''
  }

  refreshSchedule(selfQq, cfg) {
    if (!selfQq) return
    if (!this._jobs) this._jobs = {}
    if (this._jobs[selfQq]?.signJob) { this._jobs[selfQq].signJob.cancel() }
    if (this._jobs[selfQq]?.shuoshuoJob) { this._jobs[selfQq].shuoshuoJob.cancel() }
    this._jobs[selfQq] = {}

    if (cfg.enableSignUpdate) {
      this._jobs[selfQq].signJob = schedule.scheduleJob(cfg.signCron, () => this.updateSign(selfQq, cfg))
      console.log(`[Napcat-Hitokoto][${selfQq}] 签名任务已启动: ${cfg.signCron}`)
    }
    if (cfg.enableShuoshuoUpdate) {
      this._jobs[selfQq].shuoshuoJob = schedule.scheduleJob(cfg.shuoshuoCron, () => this.updateShuoshuo(selfQq, cfg))
      console.log(`[Napcat-Hitokoto][${selfQq}] 说说任务已启动: ${cfg.shuoshuoCron}`)
    }
  }

  async getHitokoto(cfg) {
    try {
      let url = cfg.hitokotoApi
      if (cfg.hitokotoType) {
        url += `?c=${cfg.hitokotoType}`
      }
      const response = await fetch(url)
      const data = await response.json()
      // 兼容两种格式：标准一言API(hitokoto/from/from_who) 和 和风API(text)
      const content = data.hitokoto || data.text || ''
      const from = data.from || '网络'
      const from_who = data.from_who || null
      return {
        content,
        from,
        from_who,
        full: content && from ? `${content} —— ${from_who ? from_who + ' 《' + from + '》' : '《' + from + '》'}` : content
      }
    } catch (e) {
      console.error('[Napcat-Hitokoto] 获取一言内容失败', e)
      return {
        content: '人生最曼妙的风景，是内心的淡定与从容',
        from: '佚名',
        from_who: null,
        full: '人生最曼妙的风景，是内心的淡定与从容 —— 《佚名》'
      }
    }
  }

  async updateSign(selfQq, cfg, e = null) {
    if (!cfg) cfg = loadConfig(selfQq)
    const lockKey = `${selfQq}_sign`
    if (this._updating.has(lockKey)) {
      console.log(`[Napcat-Hitokoto][${selfQq}] 签名更新进行中，跳过`)
      return
    }
    this._updating.add(lockKey)
    try {
      const hitokoto = await this.getHitokoto(cfg)
      const signText = hitokoto.content
      const res1 = await this.callNapcat('set_self_longnick', { longNick: signText }, cfg)
      console.log(`[Napcat][${selfQq}] set_self_longnick:`, JSON.stringify(res1))
      const res2 = await this.callNapcat('set_qq_profile', { nickname: '', personal_note: signText }, cfg)
      console.log(`[Napcat][${selfQq}] set_qq_profile:`, JSON.stringify(res2))
      if (e) e.reply(signText)
      this.logHistory('sign', hitokoto, selfQq)
    } catch (err) {
      console.error(`[Napcat][${selfQq}] 更新签名失败:`, err.message || err)
      if (e) e.reply('更新签名失败：' + (err.message || err))
    } finally {
      setTimeout(() => this._updating.delete(lockKey), 30000)
    }
  }

  async updateShuoshuo(selfQq, cfg, e = null) {
    if (!cfg) cfg = loadConfig(selfQq)
    const lockKey = `${selfQq}_shuoshuo`
    if (this._updating.has(lockKey)) {
      console.log(`[Napcat-Hitokoto][${selfQq}] 说说发送进行中，跳过`)
      return
    }
    this._updating.add(lockKey)
    try {
      const hitokoto = await this.getHitokoto(cfg)
      const content = hitokoto.content
      const result = await this.publishQzone(content, cfg)
      console.log(`[Napcat][${selfQq}] QZone发布结果:`, JSON.stringify(result))
      if (e) {
        if (result.code === 0 || result.note) {
          e.reply(content)
        } else {
          e.reply(`❌ 说说发布失败：${result.message || JSON.stringify(result)}`)
        }
      }
      this.logHistory('shuoshuo', hitokoto, selfQq)
    } catch (err) {
      console.error(`[Napcat][${selfQq}] 发送说说失败:`, err.message || err)
      if (e) e.reply('发送说说失败：' + (err.message || err))
    } finally {
      setTimeout(() => this._updating.delete(lockKey), 30000)
    }
  }

  /** 计算 QZone g_tk */
  calcGTK(skey) {
    let hash = 5381
    for (let i = 0; i < skey.length; i++) {
      hash += (hash << 5) + skey.charCodeAt(i)
    }
    return hash & 0x7fffffff
  }

  /** 通过 QZone HTTP API 发布空间说说 */
  async publishQzone(content, cfg) {
    if (!cfg) cfg = defaultConfig
    // 1. 获取 QZone 域名的 Cookie
    const cookieRes = await this.callNapcat('get_cookies', { domain: 'qzone.qq.com' }, cfg)
    if (cookieRes.retcode !== 0 || !cookieRes.data?.cookies) {
      throw new Error('获取QZone Cookie失败: ' + JSON.stringify(cookieRes))
    }
    const cookies = cookieRes.data.cookies

    // 2. 从 Cookie 中提取 p_skey，计算 g_tk
    const pSkeyMatch = cookies.match(/p_skey=([^;]+)/)
    if (!pSkeyMatch) throw new Error('Cookie中未找到p_skey')
    const gtk = this.calcGTK(pSkeyMatch[1])

    // 3. 获取 Bot QQ 号（按 cfg 缓存）
    let uin = this._botUinCache[cfg.napcatHttp]
    if (!uin) {
      const infoRes = await this.callNapcat('get_login_info', {}, cfg)
      if (infoRes.retcode === 0 && infoRes.data?.user_id) {
        uin = this._botUinCache[cfg.napcatHttp] = infoRes.data.user_id
      } else {
        throw new Error('获取Bot QQ号失败')
      }
    }

    // 4. 调用 QZone 发表说说 API
    const body = new URLSearchParams({
      con: content,
      hostuin: String(uin),
      format: 'fs',
      syn_tweet_version: '1',
      paramstr: '1',
      feedversion: '1',
      ver: '1',
      ugc_right: '1',
      to_sign: '0',
      code_version: '1',
      qzreferrer: `https://user.qzone.qq.com/${uin}`
    }).toString()

    const url = `https://user.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_publish_v6?g_tk=${gtk}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies
      },
      body
    })
    const text = await res.text()
    const match = text.match(/_Callback\(([\s\S]*)\)/)
    if (match) {
      try {
        return JSON.parse(match[1])
      } catch {
        return { code: 0, raw: text }
      }
    }
    try {
      return JSON.parse(text)
    } catch {
      if (text.includes('html') || text.includes('<!DOCTYPE')) {
        return { code: 0, note: 'HTML响应，可能已发布成功' }
      }
      return { code: -1, message: '无法解析响应: ' + text.slice(0, 200) }
    }
  }

  async callNapcat(action, params, cfg) {
    if (!cfg) cfg = defaultConfig
    const headers = { 'Content-Type': 'application/json' }
    if (cfg.napcatToken) {
      headers['Authorization'] = `Bearer ${cfg.napcatToken}`
    }
    const url = cfg.napcatHttp + action
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(params) })
    return res.json()
  }

  logHistory(type, hitokoto, selfQq) {
    const historyPath = path.join(dirPath, `history-${selfQq}.json`)
    let history = []
    if (fs.existsSync(historyPath)) {
      try {
        history = JSON.parse(fs.readFileSync(historyPath, 'utf8'))
      } catch (e) {
        console.error('[Napcat-Hitokoto] 读取历史记录失败', e)
      }
    }
    history.push({
      type,
      content: hitokoto.content,
      from: hitokoto.from,
      from_who: hitokoto.from_who,
      time: moment().format('YYYY-MM-DD HH:mm:ss')
    })
    if (history.length > 100) {
      history = history.slice(-100)
    }
    try {
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8')
    } catch (e) {
      console.error('[Napcat-Hitokoto] 保存历史记录失败', e)
    }
  }

  async toggleFeature(e) {
    if (!e.isMaster) return e.reply('只有主人才能操作哦~')
    const selfQq = this.getSelfQq(e)
    const cfg = this.getConfig(e)
    const m = e.msg.match(/^#nap(签名|说说)(开启|关闭)$/)
    const command = m[1]
    const action = m[2]
    if (command === '签名') cfg.enableSignUpdate = action === '开启'
    else cfg.enableShuoshuoUpdate = action === '开启'
    saveConfig(selfQq, cfg)
    this.refreshSchedule(selfQq, cfg)
    e.reply(`${command}自动更新已${action}`)
  }

  async updateNow(e) {
    if (!e.isMaster) return e.reply('仅主人可用')
    const selfQq = this.getSelfQq(e)
    const cfg = this.getConfig(e)
    const type = e.msg.match(/^#nap立即更新(签名|说说)$/)[1]
    if (type === '签名') {
      await this.updateSign(selfQq, cfg, e)
    } else {
      await this.updateShuoshuo(selfQq, cfg, e)
    }
  }

  async showStatus(e) {
    if (!e.isMaster) return e.reply('只有主人才能操作哦~')
    const selfQq = this.getSelfQq(e)
    const cfg = this.getConfig(e)
    e.reply(`Napcat-Hitokoto 插件状态 [${selfQq}]：
签名：${cfg.enableSignUpdate ? '✅' : '❌'} | ${cfg.signCron} | 前缀:${cfg.signPrefix}
说说：${cfg.enableShuoshuoUpdate ? '✅' : '❌'} | ${cfg.shuoshuoCron} | 前缀:${cfg.shuoshuoPrefix}
一言API：${cfg.hitokotoApi} | 类型：${cfg.hitokotoType || '随机'}`)
  }

  async setCron(e) {
    if (!e.isMaster) return e.reply('只有主人才能操作哦~')
    const selfQq = this.getSelfQq(e)
    const cfg = this.getConfig(e)
    const match = e.msg.match(/^#nap设置(签名|说说)频率 (.+)$/)
    const type = match[1]
    const cronExp = match[2].trim()
    try { schedule.scheduleJob(cronExp, () => {}) } catch {
      return e.reply('cron格式无效，请重新输入')
    }
    if (type === '签名') cfg.signCron = cronExp
    else cfg.shuoshuoCron = cronExp
    saveConfig(selfQq, cfg)
    this.refreshSchedule(selfQq, cfg)
    e.reply(`[${selfQq}] ${type}频率已设为：${cronExp}`)
  }

  async setPrefix(e) {
    if (!e.isMaster) return e.reply('只有主人才能操作哦~')
    const selfQq = this.getSelfQq(e)
    const cfg = this.getConfig(e)
    const m = e.msg.match(/^#nap设置(签名|说说)前缀(.*)$/)
    const type = m[1], prefix = m[2]
    if (type === '签名') cfg.signPrefix = prefix
    else cfg.shuoshuoPrefix = prefix
    saveConfig(selfQq, cfg)
    e.reply(`[${selfQq}] ${type}前缀已设为：${prefix}`)
  }
}
