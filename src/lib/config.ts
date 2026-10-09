// 你的规则。改这里不改代码。开发版把它存进 config 表，设置页可编辑。
export const DEFAULT_CONFIG = {
  name: 'Flora',
  palette: '' as '' | 'sun' | 'indigo' | 'night',
  theme: '' as '' | 'light' | 'dark',
  // 分类：模块标签及触发词
  tags: [
    { name: '工作', words: ['客户', '订单', '交期', '料号', '发票', '供应商', '改单', '邮件', '老板', 'Lackmann', 'Westnetz', '报价'], color: 'c1' },
    { name: '德语', words: ['德语', 'Deutsch', '单词', '搭配', '语法'], color: 'c3' },
    { name: '产品技术', words: ['Modbus', '电表', '参数', 'PLC', 'OKK', '通信', 'SMGW'], color: 'c3' },
    { name: '想法', words: ['想法', 'idea', '要不要做', '可以做', '如果做'], color: 'c4' },
    { name: '图书', words: ['读到', '这本书', '书里'], color: 'c5' },
    { name: '播客', words: ['播客', '那期', 'podcast'], color: 'c2' },
    { name: '人', words: ['同事', '朋友', '他说', '她说'], color: 'c4' },
    { name: '生活', words: ['买', '拿', '包裹', '家里', '打扫'], color: 'c2' },
  ],
  // 明确动作 → 直接建待办
  clearActionWords: ['明天', '后天', '这周', '下周', '周一', '周二', '周三', '周四', '周五', '周六', '周日', '记得', '得去', '要去', '得'],
  // 不明确 → 弹抽屉
  vagueWords: ['的事', '那个', '一下', '怎么', '为什么', '不知道', '卡'],
  eveningWords: ['今晚', '晚上'],
  // 复盘
  reviewSteps: ['state', 'bigThing', 'intake', 'issues', 'tomorrow'] as const,
  bodySubItems: [
    { key: 'period', label: '🩸 姨妈期', kind: 'period', tags: ['痛', '量多', '情绪差'] },
    { key: 'skin', label: '✨ 皮肤', kind: 'choice', options: ['好', '一般', '干', '爆痘', '泛红'] },
    { key: 'sleep', label: '😴 睡眠', kind: 'choice', options: ['<6h', '6–7h', '7–8h', '>8h'] },
  ],
  bigThingMinutes: 90,
  reviewHourStart: 21,
  // 财务（按《个人生活财务系统 V1》）
  finance: {
    income: 1000,   // 示例数，你的真实数字在设置里填，只存数据库
    envelopes: [
      { key: 'fixed', name: '固定水电网', budget: 200, locked: true, color: 'c1', words: ['水费', '电费', '网费', '房租', '话费', '宽带', '保险', 'Miete', 'Strom', 'Internet', 'Vodafone', 'Telekom', 'O2', 'Rundfunk'] },
      { key: 'save', name: '长期储蓄', budget: 500, locked: true, color: 'c1', words: ['储蓄', '存款', '转存', '存了'] },
      { key: 'food', name: '买菜 / 基础吃饭', budget: 160, locked: false, color: 'c3', words: ['买菜', 'Rewe', 'Edeka', 'Lidl', 'Aldi', '超市', '菜'] },
      { key: 'fun', name: '外食 / 娱乐 / 社交', budget: 80, locked: false, color: 'c4', words: ['吃饭', '外食', '咖啡', '打车', '娱乐', '电影', '聚', '奶茶', '酒'] },
      { key: 'goal', name: '目标基金', budget: 40, locked: true, color: 'c5', words: ['目标基金', '攒'] },
      { key: 'flex', name: '机动', budget: 20, locked: false, color: 'c2' },
    ],
    accounts: [
      { name: '安全底盘', amount: 3000, rule: '正常情况下不花' },
      { name: '长期机动', amount: 1000, rule: '战略储备，单独判断' },
      { name: '生活缓冲', amount: 500, rule: '临时小额非固定支出' },
      { name: '目标基金', amount: 0, rule: '从月收入积累' },
    ],
    moneyWords: ['€', '欧', '块', '元', '费', '花了', '买了', '付了', '交了', '充了', '吃饭', '买菜', '打车', '咖啡', 'Rewe', 'Edeka', 'Lidl', 'Aldi', 'DM', 'Rossmann', 'Amazon'],
  },
  // 模型路由
  llm: {
    default: 'deepseek',
    upgradeToClaudeWhen: { task: ['summary'], minChars: 800, minConfidence: 0.6 },
  },
}
export type EnvelopeCfg = { key?: string; name: string; budget: number; locked: boolean; color: string; words?: string[] }
export type AppConfig = Omit<typeof DEFAULT_CONFIG, 'finance'> & { finance: Omit<typeof DEFAULT_CONFIG['finance'], 'envelopes'> & { envelopes: EnvelopeCfg[] } }
