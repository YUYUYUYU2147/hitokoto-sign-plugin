/**
 * 插件：自动一言签名与说说 v3.1
 * 支持多开 Bot，每个 Bot 独立配置
 * 签名：通过 OneBot11 set_qq_profile 更新
 * 说说：尝试通过 icqq 原生协议发送到 QQ 空间
 */

import plugin from '../../lib/plugins/plugin.js'
import schedule from 'node-schedule'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'

const dirPath = path.join(process.cwd(), 'plugins/hitokoto-sign-plugin/')
if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })

const defaultConfig = {
  signCron: '0 0 */6 * * *',
  shuoshuoCron: '0 0 * * * *',
  enableSignUpdate: true,
  enableShuoshuoUpdate: true,
  hitokotoApi: 'https://v1.hitokoto.cn',
  hitokotoType: '',
  signPrefix: '',
  shuoshuoPrefix: '分享一条一言：',
  llonebotHttp: 'http://113.31.103.19:3001',
  llonebotToken: '775825',
  selfQq: '',
  masterQq: '1390963734',
  shuoshuoMode: 'private',
  enabled: true  // 是否启用此Bot的插件功能
}

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

const legacyConfigPath = path.join(dirPath, 'config.json')
if (fs.existsSync(legacyConfigPath)) {
  try {
    const legacy = JSON.parse(fs.readFileSync(legacyConfigPath, 'utf8'))
    if (legacy.selfQq) {
      saveConfig(legacy.selfQq, { ...defaultConfig, ...legacy })
      fs.renameSync(legacyConfigPath, legacyConfigPath + '.bak')
      console.log('[一言] 已迁移旧配置到 config-' + legacy.selfQq + '.json')
    }
  } catch (e) {}
}

async function callLLOneBot(action, params, config) {
  const headers = { 'Content-Type': 'application/json' }
  if (config.llonebotToken) headers['Authorization'] = `Bearer ${config.llonebotToken}`
  const res = await fetch(`${config.llonebotHttp}/${action}`, {
    method: 'POST', headers,
    body: JSON.stringify(params)
  })
  return res.json()
}

async function callMilkyAPI(endpoint, params, config) {
  const headers = { 'Content-Type': 'application/json' }
  if (config.llonebotToken) headers['Authorization'] = `Bearer ${config.llonebotToken}`
  const res = await fetch(`${config.llonebotHttp}${endpoint}`, {
    method: 'POST', headers,
    body: JSON.stringify(params)
  })
  return res.json()
}

function collectAllMethods(obj, label, depth = 0, maxDepth = 4, visited = new Set()) {
  if (!obj || typeof obj !== 'object' || depth > maxDepth) return []
  if (visited.has(obj)) return []
  visited.add(obj)
  const results = []
  try {
    const keys = new Set()
    try { Object.keys(obj).forEach(k => keys.add(k)) } catch (e) {}
    try { Object.getOwnPropertyNames(obj).forEach(k => keys.add(k)) } catch (e) {}
    try {
      const proto = Object.getPrototypeOf(obj)
      if (proto && proto !== Object.prototype && !visited.has(proto))
        Object.getOwnPropertyNames(proto).forEach(k => keys.add(k))
    } catch (e) {}
    for (const key of keys) {
      if (['constructor', '__proto__', 'prototype', 'length', 'name', 'caller', 'arguments',
           'toString', 'toJSON', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
           'propertyIsEnumerable'].includes(key)) continue
      const fullPath = `${label}.${key}`
      let val
      try { val = obj[key] } catch (e) { continue }
      if (typeof val === 'function') {
        results.push({ path: fullPath, type: 'function' })
      } else if (val && typeof val === 'object' && !Array.isArray(val)) {
        results.push({ path: fullPath, type: 'object' })
        if (depth < maxDepth) {
          results.push(...collectAllMethods(val, fullPath, depth + 1, maxDepth, visited))
        }
      }
    }
  } catch (e) {}
  return results
}

function categorizeMethods(methods) {
  const qzoneKeywords = /qzone|shuoshuo|feed|mood|zone|space|说说|空间/i
  const sendKeywords = /send|publish|post|write|create|add|insert|update|set|doCard|doLike|doComment/i
  const profileKeywords = /profile|sign|签名|nick|备注|头像|avatar/i
  const oidbKeywords = /oidb|Oidb|OIDB|protobuf|pbSend|pkg/i
  const httpKeywords = /http|request|fetch|api|rest/i
  const qzone = [], send = [], profile = [], oidb = [], http = [], other = []
  for (const m of methods) {
    const k = m.path
    if (qzoneKeywords.test(k)) qzone.push(m)
    else if (oidbKeywords.test(k)) oidb.push(m)
    else if (profileKeywords.test(k)) profile.push(m)
    else if (httpKeywords.test(k) && sendKeywords.test(k)) http.push(m)
    else if (sendKeywords.test(k)) send.push(m)
    else other.push(m)
  }
  return { qzone, send, profile, oidb, http, other }
}

export class HitokotoSignPlugin extends plugin {
  constructor() {
    super({
      name: '一言签名与说说',
      dsc: '定时获取一言内容，自动更新QQ签名和发送说说',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#一言帮助$', fnc: 'showHelp' },
        { reg: '^#一言签名(开启|关闭)$', fnc: 'toggleFeature' },
        { reg: '^#一言说说(开启|关闭)$', fnc: 'toggleFeature' },
        { reg: '^#一言立即更新签名$', fnc: 'updateNow' },
        { reg: '^#一言立即更新说说$', fnc: 'updateNow' },
        { reg: '^#一言插件状态$', fnc: 'showStatus' },
        { reg: '^#设置签名前缀(.+)$', fnc: 'setPrefix' },
        { reg: '^#设置说说前缀(.+)$', fnc: 'setPrefix' },
        { reg: '^#一言全量扫描$', fnc: 'fullScan' },
        { reg: '^#一言扫描协议$', fnc: 'scanProtocol' },
        { reg: '^#一言说说模式(.+)$', fnc: 'setShuoshuoMode' },
        { reg: '^#设置签名时间\\s+(.+)$', fnc: 'setSignCron' },
        { reg: '^#设置说说时间\\s+(.+)$', fnc: 'setShuoshuoCron' }
      ]
    })
    this._botRef = null
    this._fullMethodsCache = null
    this._jobs = {}
    this._updating = new Set()  // 防止同一Bot重复执行
  }

  getConfig(e) {
    const selfQq = e?.bot?.self_id || e?.self_id || ''
    return loadConfig(selfQq)
  }

  refreshSchedule(selfQq, config) {
    if (!selfQq) return
    if (this._jobs[selfQq]?.signJob) { this._jobs[selfQq].signJob.cancel() }
    if (this._jobs[selfQq]?.shuoshuoJob) { this._jobs[selfQq].shuoshuoJob.cancel() }
    this._jobs[selfQq] = {}
    if (config.enableSignUpdate) {
      this._jobs[selfQq].signJob = schedule.scheduleJob(config.signCron, () => this.updateSign(selfQq, config))
    }
    if (config.enableShuoshuoUpdate) {
      this._jobs[selfQq].shuoshuoJob = schedule.scheduleJob(config.shuoshuoCron, () => this.updateShuoshuo(selfQq, config))
    }
  }

  async getHitokoto(cfg) {
    try {
      let url = cfg.hitokotoApi
      if (cfg.hitokotoType) url += `?c=${cfg.hitokotoType}`
      const res = await fetch(url)
      const data = await res.json()
      return {
        content: data.hitokoto, from: data.from, from_who: data.from_who,
        full: `${data.hitokoto} —— ${data.from_who ? data.from_who + ' 《' + data.from + '》' : '《' + data.from + '》'}`
      }
    } catch (e) {
      return { content: '人生最曼妙的风景，是内心的淡定与从容', from: '佚名', from_who: null,
        full: '人生最曼妙的风景，是内心的淡定与从容 —— 《佚名》' }
    }
  }

  async updateSign(selfQq, cfg) {
    if (!cfg) cfg = loadConfig(selfQq)
    try {
      const hitokoto = await this.getHitokoto(cfg)
      const signText = `${cfg.signPrefix}${hitokoto.content}`
      let currentNick = selfQq
      try {
        const info = await callLLOneBot('get_login_info', {}, cfg)
        if (info && info.data && info.data.nickname) currentNick = info.data.nickname
      } catch (e) {}
      await callLLOneBot('set_qq_profile', { nickname: currentNick, personal_note: signText }, cfg)
      this.logHistory('sign', hitokoto, selfQq)
    } catch (e) {
      console.error(`[一言][${selfQq}] 签名更新失败:`, e.message || e)
    }
  }

  async updateShuoshuo(selfQq, cfg) {
    if (!cfg) cfg = loadConfig(selfQq)
    const hitokoto = await this.getHitokoto(cfg)
    const content = `${cfg.shuoshuoPrefix}${hitokoto.full}`
    if (cfg.shuoshuoMode === 'private') {
      await this.sendPrivateShuoshuo(content, cfg)
    } else {
      const sent = await this.trySendQzoneViaIcq(content)
      if (!sent) {
        console.log(`[一言][${selfQq}] Qzone发送失败，降级为私聊`)
        await this.sendPrivateShuoshuo(content, cfg)
      }
    }
    this.logHistory('shuoshuo', hitokoto, selfQq)
  }

  async trySendQzoneViaIcq(content) {
    if (!this._botRef) return false
    try {
      const icqq = this._botRef.fl
      if (icqq) {
        const possibleMethods = [
          'publishQzoneFeed', 'sendQzoneFeed', 'qzonePublish', 'publishFeed',
          'sendFeed', 'writeMood', 'sendMood', 'publishMood',
          'qzone_send', 'sendQzone', 'postQzone', 'addFeed',
          'createFeed', 'publishShuoshuo', 'sendShuoshuo'
        ]
        for (const methodName of possibleMethods) {
          try {
            if (typeof icqq[methodName] === 'function') {
              console.log(`[一言] 找到方法: fl.${methodName}，尝试调用...`)
              const result = await icqq[methodName](content)
              console.log(`[一言] fl.${methodName} 返回:`, JSON.stringify(result))
              return true
            }
          } catch (e) {
            console.log(`[一言] fl.${methodName} 调用失败:`, e.message)
          }
        }
        if (typeof icqq.sendOidb === 'function') {
          for (const cmd of [0x972, 0xb77, 0x8b5, 0x8a4]) {
            try {
              console.log(`[一言] 尝试 OIDB 命令: 0x${cmd.toString(16)}`)
              const body = this.buildQzoneFeedBody(content)
              if (body) {
                const result = await icqq.sendOidb(`OidbSvc.0x${cmd.toString(16)}`, body)
                console.log(`[一言] sendOidb 0x${cmd.toString(16)} 返回:`, JSON.stringify(result))
                return true
              }
            } catch (e) {
              console.log(`[一言] sendOidb 0x${cmd.toString(16)} 失败:`, e.message)
            }
          }
        }
        for (const mName of ['sendPacket', 'send', 'pkg', 'sendRaw', 'sendPb']) {
          try {
            if (typeof icqq[mName] === 'function') {
              console.log(`[一言] 找到底层发送方法: fl.${mName}`)
            }
          } catch (e) {}
        }
        for (const subKey of ['qzone', 'Qzone', 'qz', 'feed', 'shuoshuo', 'mood']) {
          try {
            const sub = icqq[subKey]
            if (sub && typeof sub === 'object') {
              console.log(`[一言] 找到子模块: fl.${subKey}`)
              for (const actKey of Object.keys(sub)) {
                if (typeof sub[actKey] === 'function') {
                  console.log(`[一言] 子模块方法: fl.${subKey}.${actKey}`)
                }
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      console.error('[一言] trySendQzoneViaIcq 出错:', e.message)
    }
    return false
  }

  buildQzoneFeedBody(content) {
    try {
      const bot = this._botRef
      if (bot.fl && typeof bot.fl.encodeProtobuf === 'function') {
        const body = bot.fl.encodeProtobuf({
          1: { 1: content, 2: { 1: 0 } },
          2: 0
        })
        return body
      }
      return null
    } catch (e) {
      return null
    }
  }

  async sendPrivateShuoshuo(content, cfg) {
    if (!this._botRef) return
    try {
      if (this._botRef.adapter?.sendFriendMsg) {
        await this._botRef.adapter.sendFriendMsg(cfg.masterQq, content)
      } else {
        await callLLOneBot('send_private_msg', {
          user_id: cfg.masterQq,
          message: content
        }, cfg)
      }
    } catch (e) {
      console.error('[一言] 私聊发送失败:', e.message)
    }
  }

  logHistory(type, hitokoto, selfQq) {
    const hp = path.join(dirPath, `history-${selfQq}.json`)
    let h = []
    if (fs.existsSync(hp)) try { h = JSON.parse(fs.readFileSync(hp, 'utf8')) } catch (e) {}
    h.push({ type, content: hitokoto.content, from: hitokoto.from,
      from_who: hitokoto.from_who, time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) })
    if (h.length > 100) h = h.slice(-100)
    try { fs.writeFileSync(hp, JSON.stringify(h, null, 2), 'utf8') } catch (e) {}
  }

  async fullScan(e) {
    if (!e.isMaster) return e.reply('仅主人可用')
    const targets = []
    if (e.bot) {
      targets.push({ name: 'e.bot', obj: e.bot })
      if (e.bot.fl) targets.push({ name: 'e.bot.fl (icqq)', obj: e.bot.fl })
      if (e.bot.adapter) targets.push({ name: 'e.bot.adapter', obj: e.bot.adapter })
    }
    if (typeof Bot !== 'undefined') {
      targets.push({ name: 'Bot', obj: Bot })
      if (Bot.fl) targets.push({ name: 'Bot.fl (icqq)', obj: Bot.fl })
    }
    const lines = []
    for (const t of targets) {
      const methods = collectAllMethods(t.obj, t.name, 0, 3)
      const cats = categorizeMethods(methods)
      lines.push(`\n=== ${t.name} ===`)
      lines.push(`总方法数: ${methods.length}`)
      if (cats.qzone.length > 0) {
        lines.push(`\n🔴 Qzone/空间/说说 (${cats.qzone.length}):`)
        cats.qzone.forEach(m => lines.push(`  ${m.path}`))
      }
      if (cats.oidb.length > 0) {
        lines.push(`\n🟡 OIDB/Protobuf (${cats.oidb.length}):`)
        cats.oidb.forEach(m => lines.push(`  ${m.path}`))
      }
      if (cats.send.length > 0) {
        lines.push(`\n🟢 发送/发布类 (${cats.send.length}):`)
        cats.send.forEach(m => lines.push(`  ${m.path}`))
      }
      if (cats.profile.length > 0) {
        lines.push(`\n🔵 资料/签名 (${cats.profile.length}):`)
        cats.profile.forEach(m => lines.push(`  ${m.path}`))
      }
    }
    this._fullMethodsCache = targets
    await e.reply(lines.join('\n').substring(0, 3500) || '未找到任何方法')
  }

  async scanProtocol(e) {
    if (!e.isMaster) return e.reply('仅主人可用')
    const lines = []
    if (e.bot && e.bot.fl) {
      const fl = e.bot.fl
      lines.push('=== e.bot.fl (icqq Client) 属性列表 ===')
      try {
        const allKeys = Object.getOwnPropertyNames(fl)
        for (const key of allKeys) {
          if (key === 'constructor' || key === '__proto__') continue
          try {
            const val = fl[key]
            const type = typeof val
            if (type === 'function') {
              lines.push(`  📌 ${key}() - 函数`)
            } else if (type === 'object' && val !== null) {
              try {
                const subKeys = Object.getOwnPropertyNames(val)
                  .filter(k => typeof val[k] === 'function' && k !== 'constructor')
                if (subKeys.length > 0) {
                  lines.push(`  📦 ${key}: { ${subKeys.join(', ')} }`)
                } else if (subKeys.length === 0 && Object.keys(val).length > 0) {
                  lines.push(`  📦 ${key}: { ${Object.keys(val).join(', ')} }`)
                }
              } catch (e2) {
                lines.push(`  📦 ${key}: <${type}>`)
              }
            } else if (val !== null) {
              lines.push(`  🔹 ${key}: ${type}`)
            }
          } catch (e) {
            lines.push(`  ❓ ${key}: <error>`)
          }
        }
      } catch (e) {
        lines.push(`  扫描失败: ${e.message}`)
      }
      lines.push(`\n=== icqq 检查 ===`)
      try {
        const packagePath = path.join(process.cwd(), 'node_modules/icqq/package.json')
        if (fs.existsSync(packagePath)) {
          const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
          lines.push(`  icqq 版本: ${pkg.version}`)
        } else {
          lines.push(`  icqq 包路径不存在: ${packagePath}`)
        }
        const mm = path.join(process.cwd(), 'node_modules/icqq')
        if (fs.existsSync(mm)) {
          const icqqFiles = fs.readdirSync(mm).filter(f => f.includes('qzone') || f.includes('Qzone'))
          if (icqqFiles.length > 0) {
            lines.push(`  Qzone 相关文件: ${icqqFiles.join(', ')}`)
          }
          const libPath = path.join(mm, 'lib')
          if (fs.existsSync(libPath)) {
            const libFiles = fs.readdirSync(libPath)
            const qzoneInLib = libFiles.filter(f => /qzone|Qzone|feed/i.test(f))
            if (qzoneInLib.length > 0) {
              lines.push(`  lib/ 中 Qzone 文件: ${qzoneInLib.join(', ')}`)
            }
            const allFiles = libFiles.join(', ')
            lines.push(`  lib/ 全部文件: ${allFiles.substring(0, 500)}`)
          }
        }
      } catch (e) {
        lines.push(`  检查包失败: ${e.message}`)
      }
    }
    await e.reply(lines.join('\n').substring(0, 3500))
  }

  async showHelp(e) {
    if (!e.isMaster) return e.reply('仅主人可用')
    const selfQq = e.bot?.self_id || e.self_id || ''
    const cfg = this.getConfig(e)
    if (!cfg.enabled) return
    e.reply(`一言签名 & 说说插件 v3.1
==============
当前Bot：${selfQq}
签名更新：${cfg.enableSignUpdate ? '✅' : '❌'}
说说发送：${cfg.enableShuoshuoUpdate ? '✅' : '❌'}
说说模式：${cfg.shuoshuoMode === 'qzone' ? 'Qzone空间(自动降级)' : '私聊主人'}

指令：
#一言签名开启/关闭
#一言说说开启/关闭
#一言立即更新签名
#一言立即更新说说
#一言插件状态
#一言说说模式 qzone/private
#设置签名前缀xxx
#设置说说前缀xxx
#设置签名时间 cron表达式——如 #设置签名时间 0 0 */6 * * *
#设置说说时间 cron表达式——如 #设置说说时间 0 0 * * * *
常用Cron：每小时=0 0 * * * * | 每6小时=0 0 */6 * * * | 每天12点=0 0 12 * * *`)
  }

  async toggleFeature(e) {
    if (!e.isMaster) return e.reply('仅主人可用')
    const selfQq = e.bot?.self_id || e.self_id || ''
    const cfg = this.getConfig(e)
    if (!cfg.enabled) return
    const m = e.msg.match(/^#(一言签名|一言说说)(开启|关闭)$/)
    if (!m) return e.reply('指令格式错误')
    const cmd = m[1], act = m[2]
    if (cmd === '一言签名') {
      cfg.enableSignUpdate = act === '开启'
    } else {
      cfg.enableShuoshuoUpdate = act === '开启'
    }
    saveConfig(selfQq, cfg)
    this.refreshSchedule(selfQq, cfg)
    e.reply(`[${selfQq}] ${cmd}自动更新已${act}`)
  }

  async updateNow(e) {
    if (!e.isMaster) return e.reply('仅主人可用')
    if (e.bot) this._botRef = e.bot
    const selfQq = e.bot?.self_id || e.self_id || ''
    const cfg = this.getConfig(e)
    if (!cfg.enabled) return
    // 防止同一Bot重复执行
    const lockKey = `${selfQq}_${e.msg}`
    if (this._updating.has(lockKey)) {
      return e.reply('⏳ 操作进行中，请稍候...')
    }
    this._updating.add(lockKey)
    const m = e.msg.match(/^#一言立即更新(签名|说说)$/)
    if (!m) {
      this._updating.delete(lockKey)
      return e.reply('指令格式错误')
    }
    const type = m[1]
    try {
      if (type === '签名') {
        await e.reply(`⏳ 正在更新签名...`)
        const hitokoto = await this.getHitokoto(cfg)
        const signText = `${cfg.signPrefix}${hitokoto.content}`
        let currentNick = selfQq
        try {
          const info = await callLLOneBot('get_login_info', {}, cfg)
          if (info && info.data && info.data.nickname) currentNick = info.data.nickname
        } catch (e) {}
        const r = await callLLOneBot('set_qq_profile', { nickname: currentNick, personal_note: signText }, cfg)
        if (r && r.retcode === 0) {
          await e.reply(`✅ 签名已更新：${signText}`)
        } else {
          await e.reply(`❌ 签名更新失败：${r?.message || '未知错误'}`)
        }
        this.logHistory('sign', hitokoto, selfQq)
      } else {
        const hitokoto = await this.getHitokoto(cfg)
        const content = `${cfg.shuoshuoPrefix}${hitokoto.full}`
        await e.reply(`⏳ 正在尝试发送到QQ空间...`)
        const sent = await this.trySendQzoneViaIcq(content)
        if (sent) {
          await e.reply(`✅ 已发送到QQ空间！\n${content}`)
        } else {
          await this.sendPrivateShuoshuo(content, cfg)
          await e.reply(`⚠️ Qzone发送失败(LLOneBot无此API)\n已降级为私聊发送:\n${content}`)
        }
        this.logHistory('shuoshuo', hitokoto, selfQq)
      }
    } catch (err) {
      await e.reply(`❌ 发送失败: ${err.message}`)
    } finally {
      setTimeout(() => this._updating.delete(lockKey), 5000)
    }
  }

  async showStatus(e) {
    if (!e.isMaster) return e.reply('仅主人可用')
    const selfQq = e.bot?.self_id || e.self_id || ''
    const cfg = this.getConfig(e)
    if (!cfg.enabled) return
    e.reply(`[${selfQq}] 签名：${cfg.enableSignUpdate ? '✅' : '❌'} | ${cfg.signCron} | 前缀:${cfg.signPrefix}
[${selfQq}] 说说：${cfg.enableShuoshuoUpdate ? '✅' : '❌'} | ${cfg.shuoshuoCron} | 前缀:${cfg.shuoshuoPrefix}
模式：${cfg.shuoshuoMode === 'qzone' ? 'Qzone(自动降级)' : '私聊主人'}`)
  }

  async setPrefix(e) {
    if (!e.isMaster) return e.reply('仅主人可用')
    const selfQq = e.bot?.self_id || e.self_id || ''
    const cfg = this.getConfig(e)
    if (!cfg.enabled) return
    const m = e.msg.match(/^#设置(签名|说说)前缀(.+)$/)
    if (!m) return e.reply('指令格式错误')
    const type = m[1], prefix = m[2]
    if (type === '签名') cfg.signPrefix = prefix
    else cfg.shuoshuoPrefix = prefix
    saveConfig(selfQq, cfg)
    e.reply(`[${selfQq}] ${type}前缀已设为：${prefix}`)
  }

  async setShuoshuoMode(e) {
    if (!e.isMaster) return e.reply('仅主人可用')
    const selfQq = e.bot?.self_id || e.self_id || ''
    const cfg = this.getConfig(e)
    if (!cfg.enabled) return
    const m = e.msg.match(/^#一言说说模式(.+)$/)
    if (!m) return e.reply('指令格式错误')
    const mode = m[1].trim()
    if (mode === 'qzone') {
      cfg.shuoshuoMode = 'qzone'
      e.reply(`[${selfQq}] 说说模式：Qzone空间（LLOneBot不支持时将自动降级为私聊）`)
    } else if (mode === 'private' || mode === '私聊') {
      cfg.shuoshuoMode = 'private'
      e.reply(`[${selfQq}] 说说模式：私聊主人`)
    } else {
      e.reply(`[${selfQq}] 当前模式：${cfg.shuoshuoMode}\n可选：qzone / private`)
      return
    }
    saveConfig(selfQq, cfg)
  }

  async setSignCron(e) {
    if (!e.isMaster) return e.reply('仅主人可用')
    const selfQq = e.bot?.self_id || e.self_id || ''
    const cfg = this.getConfig(e)
    if (!cfg.enabled) return
    const m = e.msg.match(/^#设置签名时间\s+(.+)$/)
    if (!m) return e.reply('格式：#设置签名时间 秒 分 时 日 月 周\n例如：#设置签名时间 0 0 */6 * * *')
    const cronExpr = m[1].trim()
    try {
      const j = schedule.scheduleJob(cronExpr, () => {})
      j.cancel()
    } catch (err) {
      return e.reply(`❌ Cron格式错误：${err.message}`)
    }
    cfg.signCron = cronExpr
    saveConfig(selfQq, cfg)
    this.refreshSchedule(selfQq, cfg)
    e.reply(`✅ [${selfQq}] 签名时间已更新：${cronExpr}\n含义：${parseCron(cronExpr)}`)
  }

  async setShuoshuoCron(e) {
    if (!e.isMaster) return e.reply('仅主人可用')
    const selfQq = e.bot?.self_id || e.self_id || ''
    const cfg = this.getConfig(e)
    if (!cfg.enabled) return
    const m = e.msg.match(/^#设置说说时间\s+(.+)$/)
    if (!m) return e.reply('格式：#设置说说时间 秒 分 时 日 月 周\n例如：#设置说说时间 0 0 * * * *')
    const cronExpr = m[1].trim()
    try {
      const j = schedule.scheduleJob(cronExpr, () => {})
      j.cancel()
    } catch (err) {
      return e.reply(`❌ Cron格式错误：${err.message}`)
    }
    cfg.shuoshuoCron = cronExpr
    saveConfig(selfQq, cfg)
    this.refreshSchedule(selfQq, cfg)
    e.reply(`✅ [${selfQq}] 说说时间已更新：${cronExpr}\n含义：${parseCron(cronExpr)}`)
  }
}

function parseCron(expr) {
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 6) return '格式不完整'
  const [sec, min, hour, day, month, week] = parts
  const desc = []
  if (sec === '0' && min === '0') {
    if (day === '*') {
      desc.push(hour === '*' ? '每小时' : `每天${hour === '*/1' ? '每小时' : formatHour(hour)}点`)
    } else if (day.startsWith('*/')) {
      desc.push(`每${day.slice(2)}天${formatHour(hour)}点`)
    } else if (day !== '*') {
      desc.push(`每月${day}号${formatHour(hour)}点`)
    }
  } else if (sec === '0' && min.startsWith('*/')) {
    desc.push(`每${min.slice(2)}分钟`)
  } else {
    desc.push(`${formatHour(hour)}:${min.padStart(2, '0')}:${sec.padStart(2, '0')}`)
  }
  return desc.join('') || expr
}

function formatHour(h) {
  if (h === '*') return '整点'
  if (h.startsWith('*/')) return `每${h.slice(2)}小时`
  const n = parseInt(h)
  return `${n}点`
}
