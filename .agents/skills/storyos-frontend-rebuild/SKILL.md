---
name: storyos-frontend-rebuild
description: Recreate or implement a StoryOS frontend page from a supplied screenshot, mockup, or prototype using existing React, Tailwind, theme, motion, and UI patterns with visual verification. Use only when the user asks to turn a referenced visual into code.
---

# StoryOS Frontend Rebuild

仅当用户提供或明确引用视觉原型，并要求生成、还原或实现相关前端时使用。只要求评审或描述图片时不修改代码。

## 工作流

1. 先查看原型，提取目标 viewport、页面壳、网格、间距、字体层级、控件、状态、图标、滚动区和响应式线索。只从可见 affordance 推断交互，模糊内容默认按静态展示处理。
2. 检查 `src/renderer/AGENTS.md`、最近的页面/feature、路由、Tailwind/CSS 变量、`components/ui`、`components/motion`、图标库和主题实现。
3. 选择符合现有结构的最小文件集合。静态示例数据保持局部且有类型；不要为单页引入新状态库、UI 库、CSS 框架或全局主题修改。
4. 使用语义化 React 和项目组件实现。布局、尺寸、响应式、hover/focus、简单过渡和层叠优先用 CSS；只有真实状态和事件需要 JavaScript。
5. 在目标 viewport 预览并截图比较；适用时再检查一个窄窗口。修正明显的间距、层级、颜色、尺寸和 overflow 偏差。

## StoryOS 约定

- 优先使用项目语义 token、现有组件变体、间距和字体尺度。没有合适 token 时才在功能局部使用原型颜色。
- 工作区路由动效、弹窗、阶段切换和 reduced-motion 行为遵守 `src/renderer/AGENTS.md` 与 `docs/frontend-motion.md`，不要重复包裹路由动画或用延迟等待装饰动画。
- 使用 flex、grid、intrinsic sizing、min/max 和 aspect-ratio；绝对定位只用于 overlay、badge 或无法自然表达的局部层叠。
- 优先现有 `lucide-react` 图标，不手写已有等价 SVG；补齐 alt、label、键盘 focus 和语义结构。
- 不为视觉效果新增依赖，不用 JavaScript 修补本应由 CSS 解决的布局问题。

## 交付检查

说明原型对照 viewport、复用的项目组件/主题、实际验证方式和仍无法确认的交互。若无法启动预览或取得截图，明确原因，不宣称像素级一致。
