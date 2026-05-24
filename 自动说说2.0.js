/**
 * 插件：自动一言签名与说说
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

// 定义插件目录（独立于 index.js，避免冲突）
const dirPath = path.join('./plugins/napcat-shuoshuo-plugin/')

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
  shuoshuoCron: '0 0 12 * * ?',
  // 是否启用签名更新
  enableSignUpdate: true,
  // 是否启用说说更新
  enableShuoshuoUpdate: true,
  // 一言API地址
  hitokotoApi: 'https://v1.hitokoto.cn',
  // 一言类型，具体见 https://developer.hitokoto.cn/sentence/#%E8%AF%B7%E6%B1%82%E5%8F%82%E6%95%B0
  hitokotoType: '', // 为空则随机获取所有类型
  // 签名前缀
  signPrefix: '今日一言：',
  // 说说前缀
  shuoshuoPrefix: '分享一条一言：'
}

// 加载配置，如果配置不存在则写入默认配置
let config
try {
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } else {
    config = defaultConfig
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  }
} catch (e) {
  console.error('[一言签名插件] 配置文件加载失败，使用默认配置', e)
  config = defaultConfig
}

export class NapcatShuoshuoPlugin extends plugin {
  constructor() {
    super({
      name: 'Napcat自动说说',
      dsc: '定时获取一言内容，通过Napcat协议发送QQ说说',
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
          reg: '^#nap设置(签名|说说)前缀(.*)$',
          fnc: 'setPrefix'
        }
      ]
    })

    this.init()
  }

  // 初始化定时任务
  async init() {
    this.refreshSchedule()
    console.log('[一言签名插件] 初始化完成')
  }

  // 停止现有定时任务并重新启动
  refreshSchedule() {
    // 清除之前的定时任务
    if (this.signJob) {
      this.signJob.cancel()
    }
    if (this.shuoshuoJob) {
      this.shuoshuoJob.cancel()
    }

    // 重新启动定时任务
    if (config.enableSignUpdate) {
      this.signJob = schedule.scheduleJob(config.signCron, () => this.updateSign())
      console.log(`[一言签名插件] 签名更新任务已启动，执行周期：${config.signCron}`)
    }

    if (config.enableShuoshuoUpdate) {
      this.shuoshuoJob = schedule.scheduleJob(config.shuoshuoCron, () => this.updateShuoshuo())
      console.log(`[一言签名插件] 说说更新任务已启动，执行周期：${config.shuoshuoCron}`)
    }
  }

  // 从一言API获取内容
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
      console.error('[一言签名插件] 获取一言内容失败', e)
      return {
        content: '人生最曼妙的风景，是内心的淡定与从容',
        from: '佚名',
        from_who: null,
        full: '人生最曼妙的风景，是内心的淡定与从容 —— 《佚名》'
      }
    }
  }

  // 更新QQ签名
  async updateSign() {
    if (!this.e.bot) return
    
    try {
      const hitokoto = await this.getHitokoto()
      const sign = `${config.signPrefix}${hitokoto.content} —— ${hitokoto.from}`
      
      // 使用QQ协议更新签名
      await this.e.bot.setSignature(sign)
      
      console.log(`[一言签名插件] 签名已更新：${sign}`)
      this.logHistory('sign', hitokoto)
    } catch (e) {
      console.error('[一言签名插件] 更新签名失败', e)
    }
  }

  // 发送QQ说说
  async updateShuoshuo() {
    if (!this.e.bot) return
    
    try {
      const hitokoto = await this.getHitokoto()
      const content = `${config.shuoshuoPrefix}${hitokoto.full}`
      
      // 使用QQ协议发送说说
      await this.e.bot.sendTaotao(content)
      
      console.log(`[一言签名插件] 说说已发送：${content}`)
      this.logHistory('shuoshuo', hitokoto)
    } catch (e) {
      console.error('[一言签名插件] 发送说说失败', e)
    }
  }

  // 记录历史记录
  logHistory(type, hitokoto) {
    const historyPath = path.join(dirPath, 'history.json')
    let history = []
    
    // 读取现有历史
    if (fs.existsSync(historyPath)) {
      try {
        history = JSON.parse(fs.readFileSync(historyPath, 'utf8'))
      } catch (e) {
        console.error('[一言签名插件] 读取历史记录失败', e)
      }
    }
    
    // 添加新记录
    history.push({
      type,
      content: hitokoto.content,
      from: hitokoto.from,
      from_who: hitokoto.from_who,
      time: moment().format('YYYY-MM-DD HH:mm:ss')
    })
    
    // 只保留最近100条
    if (history.length > 100) {
      history = history.slice(-100)
    }
    
    // 写入历史记录
    try {
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8')
    } catch (e) {
      console.error('[一言签名插件] 保存历史记录失败', e)
    }
  }

  // 命令：切换功能开关
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
    
    // 保存配置
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  }

  // 命令：立即更新签名或说说
  async updateNow(e) {
    if (!e.isMaster) {
      e.reply('只有主人才能操作哦~')
      return
    }

    const type = e.msg.match(/^#nap立即更新(签名|说说)$/)[1]
    
    if (type === '签名') {
      e.reply('正在更新签名...')
      this.e = e // 为了让updateSign可以访问bot
      await this.updateSign()
      e.reply('签名已更新完成！')
    } else if (type === '说说') {
      e.reply('正在发送说说...')
      this.e = e // 为了让updateShuoshuo可以访问bot
      await this.updateShuoshuo()
      e.reply('说说已发送完成！')
    }
  }

  // 命令：显示插件状态
  async showStatus(e) {
    if (!e.isMaster) {
      e.reply('只有主人才能操作哦~')
      return
    }
    
    const status = `Napcat自动说说插件状态：
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

  // 命令：设置前缀
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
    
    // 保存配置
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  }
}
