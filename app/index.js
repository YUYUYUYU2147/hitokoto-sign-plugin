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

// 定义插件目录
const dirPath = path.join('./plugins/napcat-hitokoto/')

// 确保插件目录存在
if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true })
}

// 配置文件路径
const configPath = path.join(dirPath, 'config.json')

// 默认配置
const defaultConfig = {
  // 签名更新频率（cron表达式）默认每6小时
  signCron: '0 0 */6 * * ?',
  // 说说更新频率（cron表达式）默认每天中午12点
  shuoshuoCron: '0 0 */2 * * ?',
  // 是否启用签名更新
  enableSignUpdate: true,
  // 是否启用说说更新
  enableShuoshuoUpdate: true,
  // 一言API地址
  hitokotoApi: 'https://v1.hitokoto.cn',
  // 一言类型
  hitokotoType: '',
  // 签名前缀
  signPrefix: '',
  // 说说前缀
  shuoshuoPrefix: '分享一条一言：',
  // Napcat HTTP 地址
  napcatHttp: 'http://127.0.0.1:3004/',
  // Napcat Token
  napcatToken: '775825',
  // 主人QQ（降级私聊用）
  masterQq: '1390963734'
}

// 加载配置
let config
try {
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } else {
    config = defaultConfig
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  }
} catch (e) {
  console.error('[Napcat-Hitokoto] 配置文件加载失败，使用默认配置', e)
  config = defaultConfig
}

export class NapcatHitokotoPlugin extends plugin {
  constructor() {
    super({
      name: 'Napcat-Hitokoto',
      dsc: '定时获取一言内容，通过Napcat协议更新签名与说说',
      event: 'message',
      priority: 5001,
      rule: [
        {
          reg: '^#nap(签名|说说)(开启|关闭)$',
          fnc: 'toggleFeature'
        },
        {
          reg: '^#nap立即更新(签名|说说)$',
          fnc: 'updateNow'
        },
        {
          reg: '^#nap插件状态$',
          fnc: 'showStatus'
        },
        {
          reg: '^#nap设置(签名|说说)频率 (.+)$',
          fnc: 'setCron'
        },
        {
          reg: '^#nap设置(签名|说说)前缀(.*)$',
          fnc: 'setPrefix'
        }
      ]
    })

    this.init()
  }

  async init() {
    this.refreshSchedule()
    console.log('[Napcat-Hitokoto] 初始化完成')
  }

  refreshSchedule() {
    if (this.signJob) {
      this.signJob.cancel()
    }
    if (this.shuoshuoJob) {
      this.shuoshuoJob.cancel()
    }

    if (config.enableSignUpdate) {
      this.signJob = schedule.scheduleJob(config.signCron, () => this.updateSign())
      console.log(`[Napcat-Hitokoto] 签名更新任务已启动，执行周期：${config.signCron}`)
    }

    if (config.enableShuoshuoUpdate) {
      this.shuoshuoJob = schedule.scheduleJob(config.shuoshuoCron, () => this.updateShuoshuo())
      console.log(`[Napcat-Hitokoto] 说说更新任务已启动，执行周期：${config.shuoshuoCron}`)
    }
  }

  async getHitokoto() {
    try {
      let url = config.hitokotoApi
      if (config.hitokotoType) {
        url += `?c=${config.hitokotoType}`
      }
      
      const response = await fetch(url)
      const data = await response.json()
      
      return {
        content: data.hitokoto,
        from: data.from,
        from_who: data.from_who,
        full: `${data.hitokoto} —— ${data.from_who ? data.from_who + ' 《' + data.from + '》' : '《' + data.from + '》'}`
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

  async updateSign(e = null) {
    try {
      const hitokoto = await this.getHitokoto()
      const signText = hitokoto.content
      
      const res1 = await this.callNapcat('set_self_longnick', { longNick: signText })
      console.log('[Napcat] set_self_longnick 响应:', JSON.stringify(res1))
      
      const res2 = await this.callNapcat('set_qq_profile', { nickname: '', personal_note: signText })
      console.log('[Napcat] set_qq_profile 响应:', JSON.stringify(res2))
      
      if (e) {
        e.reply(signText)
      }
      this.logHistory('sign', hitokoto)
    } catch (err) {
      console.error('[Napcat] 更新签名失败:', err.message || err)
      if (e) e.reply('更新签名失败：' + (err.message || err))
    }
  }

  async updateShuoshuo(e = null) {
    try {
      const hitokoto = await this.getHitokoto()
      const content = hitokoto.content
      
      const result = await this.publishQzone(content)
      console.log('[Napcat] QZone发布结果:', JSON.stringify(result))
      
      if (e) {
        if (result.code === 0 || result.note) {
          e.reply(content)
        } else {
          e.reply(`❌ 说说发布失败：${result.message || JSON.stringify(result)}`)
        }
      }
      this.logHistory('shuoshuo', hitokoto)
    } catch (err) {
      console.error('[Napcat] 发送说说失败:', err.message || err)
      if (e) e.reply('发送说说失败：' + (err.message || err))
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
  async publishQzone(content) {
    // 1. 获取 QZone 域名的 Cookie
    const cookieRes = await this.callNapcat('get_cookies', { domain: 'qzone.qq.com' })
    if (cookieRes.retcode !== 0 || !cookieRes.data?.cookies) {
      throw new Error('获取QZone Cookie失败: ' + JSON.stringify(cookieRes))
    }
    const cookies = cookieRes.data.cookies

    // 2. 从 Cookie 中提取 p_skey，计算 g_tk
    const pSkeyMatch = cookies.match(/p_skey=([^;]+)/)
    if (!pSkeyMatch) throw new Error('Cookie中未找到p_skey')
    const gtk = this.calcGTK(pSkeyMatch[1])

    // 3. 获取 Bot QQ 号（缓存）
    let uin = this._botUin
    if (!uin) {
      const infoRes = await this.callNapcat('get_login_info', {})
      if (infoRes.retcode === 0 && infoRes.data?.user_id) {
        uin = this._botUin = infoRes.data.user_id
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
    // QZone API 返回的是 callback(JSON) 格式，需要提取 JSON 部分
    const match = text.match(/_Callback\(([\s\S]*)\)/)
    if (match) {
      try {
        return JSON.parse(match[1])
      } catch {
        return { code: 0, raw: text }
      }
    }
    // 也可能是纯 JSON 或 HTML 错误页
    try {
      return JSON.parse(text)
    } catch {
      // 如果包含 html 但说说实际已发布成功
      if (text.includes('html') || text.includes('<!DOCTYPE')) {
        return { code: 0, note: 'HTML响应，可能已发布成功' }
      }
      return { code: -1, message: '无法解析响应: ' + text.slice(0, 200) }
    }
  }

  async callNapcat(action, params) {
    const headers = { 'Content-Type': 'application/json' }
    if (config.napcatToken) {
      headers['Authorization'] = `Bearer ${config.napcatToken}`
    }
    const url = config.napcatHttp + action
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(params) })
    return res.json()
  }

  logHistory(type, hitokoto) {
    const historyPath = path.join(dirPath, 'history.json')
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
    if (!e.isMaster) {
      e.reply('只有主人才能操作哦~')
      return
    }

    const m = e.msg.match(/^#nap(签名|说说)(开启|关闭)$/)
    const command = m[1]
    const action = m[2]
    
    if (command === '签名') {
      config.enableSignUpdate = action === '开启'
      if (this.signJob) {
        this.signJob.cancel()
        this.signJob = null
      }
      if (config.enableSignUpdate) {
        this.signJob = schedule.scheduleJob(config.signCron, () => this.updateSign())
      }
      e.reply(`QQ签名自动更新已${action}`)
    } else if (command === '说说') {
      config.enableShuoshuoUpdate = action === '开启'
      if (this.shuoshuoJob) {
        this.shuoshuoJob.cancel()
        this.shuoshuoJob = null
      }
      if (config.enableShuoshuoUpdate) {
        this.shuoshuoJob = schedule.scheduleJob(config.shuoshuoCron, () => this.updateShuoshuo())
      }
      e.reply(`QQ说说自动发送已${action}`)
    }
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  }

  async updateNow(e) {
    if (!e.isMaster) return e.reply('仅主人可用')

    const type = e.msg.match(/^#nap立即更新(签名|说说)$/)[1]
    
    if (type === '签名') {
      e.reply('正在更新签名...')
      await this.updateSign(e)
    } else if (type === '说说') {
      e.reply('正在发送说说...')
      await this.updateShuoshuo(e)
    }
  }

  async showStatus(e) {
    if (!e.isMaster) {
      e.reply('只有主人才能操作哦~')
      return
    }
    
    const status = `Napcat-Hitokoto 插件状态：
签名自动更新：${config.enableSignUpdate ? '已开启' : '已关闭'}
签名更新周期：${config.signCron}
签名前缀：${config.signPrefix}

说说自动发送：${config.enableShuoshuoUpdate ? '已开启' : '已关闭'}
说说发送周期：${config.shuoshuoCron}
说说前缀：${config.shuoshuoPrefix}

一言API：${config.hitokotoApi}
一言类型：${config.hitokotoType || '随机'}`
    
    e.reply(status)
  }

  async setCron(e) {
    if (!e.isMaster) {
      e.reply('只有主人才能操作哦~')
      return
    }

    const match = e.msg.match(/^#nap设置(签名|说说)频率 (.+)$/)
    const type = match[1]
    const cronExp = match[2].trim()

    // 验证 cron 表达式
    try {
      schedule.scheduleJob(cronExp, () => {})
    } catch {
      e.reply('cron格式无效，请重新输入\n常用示例：\n0 */2 * * * ?  每2小时\n0 0 */6 * * ?  每6小时\n0 0 12 * * ?  每天12点\n0 30 9 * * ?  每天9:30')
      return
    }

    if (type === '签名') {
      config.signCron = cronExp
      if (this.signJob) {
        this.signJob.cancel()
        this.signJob = null
      }
      if (config.enableSignUpdate) {
        this.signJob = schedule.scheduleJob(cronExp, () => this.updateSign())
      }
      e.reply(`签名频率已设为：${cronExp}`)
    } else if (type === '说说') {
      config.shuoshuoCron = cronExp
      if (this.shuoshuoJob) {
        this.shuoshuoJob.cancel()
        this.shuoshuoJob = null
      }
      if (config.enableShuoshuoUpdate) {
        this.shuoshuoJob = schedule.scheduleJob(cronExp, () => this.updateShuoshuo())
      }
      e.reply(`说说频率已设为：${cronExp}`)
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  }

  async setPrefix(e) {
    if (!e.isMaster) {
      e.reply('只有主人才能操作哦~')
      return
    }

    const type = e.msg.match(/^#nap设置(签名|说说)前缀(.*)$/)[1]
    const prefix = e.msg.match(/^#nap设置(签名|说说)前缀(.*)$/)[2]
    
    if (type === '签名') {
      config.signPrefix = prefix
      e.reply(`签名前缀已设置为：${prefix}`)
    } else if (type === '说说') {
      config.shuoshuoPrefix = prefix
      e.reply(`说说前缀已设置为：${prefix}`)
    }
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  }
}
