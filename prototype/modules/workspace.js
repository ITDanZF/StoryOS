export function renderGlobalConversation(title = "新对话") {
  return `<section class="standalone-page conversation-page" aria-label="全局对话">
    <header><div><span class="page-eyebrow">全局对话</span><h1>${title}</h1></div><span class="scope-badge">不读取项目内容</span></header>
    <div class="standalone-messages"><div class="empty-hero"><span class="hero-mark">✦</span><h2>开始一段新对话</h2><p>这里适合做全局问题拆解、项目规划和跨上下文讨论。</p><div class="prompt-grid"><button data-fill-prompt="帮我制定本周创作计划">制定创作计划</button><button data-fill-prompt="分析一个悬疑故事的开场结构">拆解故事结构</button><button data-fill-prompt="给我三个人物冲突灵感">寻找人物灵感</button></div></div></div>
    <form class="standalone-composer"><textarea aria-label="全局消息" placeholder="输入消息，和 StoryOS 一起思考……"></textarea><footer><span>全局对话 · 不携带项目上下文</span><button type="submit" aria-label="发送">➤</button></footer></form>
  </section>`;
}

export function renderSettings(configured = true) {
  return `<section class="standalone-page settings-page" aria-label="设置面板"><header><button class="back-button" data-action="back-workspace" aria-label="返回工作区">←</button><div><h1>设置面板</h1><p>管理 StoryOS 的模型连接</p></div></header><div class="settings-content"><div class="section-title"><span class="hero-mark small">✦</span><div><h2>AI 模型</h2><p>配置用于 StoryOS 对话与智能体任务的模型服务。</p></div></div><form class="settings-card" id="model-settings"><div class="connection-card"><i></i><div><strong>${configured ? "deepseek-chat" : "尚未连接"}</strong><span>${configured ? "deepseek · https://api.deepseek.com" : "配置一个兼容模型以开始对话"}</span></div><b>${configured ? "已连接" : "待配置"}</b></div><label><span>服务商</span><select name="provider"><option>DeepSeek</option><option>OpenAI</option><option>通义千问</option></select></label><label><span>模型名称</span><input name="model" value="deepseek-chat"></label><label class="wide"><span>Base URL</span><input name="baseUrl" value="https://api.deepseek.com"></label><label class="wide"><span>API Key</span><input name="apiKey" type="password" placeholder="sk-……"></label><label class="wide"><span>工作区路径 <small>可选</small></span><input name="workspace" placeholder="E:\\workspace\\my-story"></label><button class="save-settings" type="submit">保存并连接</button></form></div></section>`;
}

export function renderAbout() {
  return `<section class="standalone-page settings-page" aria-label="关于我们"><header><button class="back-button" data-action="back-workspace" aria-label="返回工作区">←</button><div><h1>关于我们</h1><p>了解 StoryOS</p></div></header><div class="about-content"><div class="about-card"><span class="about-logo">✦</span><h2>StoryOS</h2><small>AI WORKSPACE</small><p>面向创作与项目工作的 AI 智能体工作空间，让对话、项目上下文和智能任务保持在同一个工作流中。</p><footer><span>ⓘ</span><span>当前版本</span><strong>1.0.0</strong></footer></div></div></section>`;
}
