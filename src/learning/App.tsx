import { useEffect, useState } from 'react'
import type { Settings } from '../storage/settings'
import { loadSettings } from '../storage/settings'
import { applyTheme } from '../ui/apply-theme'
import { openOptions } from '../ui/nav'
import { SectionTitle } from '../app/SectionTitle'

const PLANNED = [
  '收藏划词与面板中的词句，自动带上上下文与来源网址',
  '简化版间隔重复（SM-2）复习队列，每天最多 20 张卡片',
  '学习统计：今日新增、待复习、连续天数、正确率',
  '导入/导出 JSON，数据不锁在本机浏览器里',
]

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    void loadSettings().then(setSettings)
  }, [])

  useEffect(() => {
    if (settings) applyTheme(settings.theme)
  }, [settings])

  return (
    <div className="container">
      <header className="stack">
        <h1 className="page-title">羽译 · 生词本</h1>
        <p className="page-subtitle">学习模块计划在 M5 实现。当前版本先把这个入口和页面骨架立好，数据模型也已定好方向。</p>
      </header>

      <section className="card section">
        <SectionTitle icon="zap">计划中的能力</SectionTitle>
        <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
          {PLANNED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="card section">
        <SectionTitle icon="info">为什么先做别的</SectionTitle>
        <p className="hint">
          学习模块的数据来源是「划词翻译」和「翻译面板的收藏」。先把翻译链路、划词气泡（M3）与网页翻译（M4）做稳，生词本才有东西可收藏；否则会先建一个空壳列表。
        </p>
      </section>

      <div className="row">
        <button type="button" className="btn" onClick={openOptions}>
          打开设置
        </button>
      </div>
    </div>
  )
}
