# Codex 前端开发约定

适用范围：`src/renderer/` 内的 Codex 开发工作。

## 默认动效

- 新页面、弹窗、状态切换和操作反馈默认提供轻量、连贯的动效，复用 `components/motion`，避免复制各业务目录中的动画实现。
- 工作区路由已由 `WorkspaceLayout` 的 `AnimatedPage` 统一处理进入动画；不要重复包裹，也不要为了播放动画给编辑器或整个路由添加 React `key`。独立页面可使用 `AnimatedPage`。
- 新弹窗默认使用 `AnimatedDialog`。关闭按钮、取消、完成等使用它提供的 `close`，父组件在 `onClose` 中卸载；忙碌状态通过 `busy` 传入。不要自行使用 `setTimeout` 猜测动画结束时间。
- 多步骤弹窗通过 `stage` 触发内容和尺寸过渡；同一段连续处理中尽量使用稳定的 stage，保留进度图标和内容状态。
- 内容渐显和列表错峰出现使用 `motion-reveal`、`motion-fade`、`motion-stagger`；公共时长和缓动只在 `components/motion/motion.css` 调整。特殊元素动画优先使用 `animateMotion`。
- 尊重 `prefers-reduced-motion`；不要人为延迟业务请求来等待装饰动画。文字所在面板避免缩放动画，防止字体观感变化。
- 阅读器等已有专用交互动画的页面使用自己的动效，避免重复叠加。
- 接入方式和验证方法见 `../../docs/frontend-motion.md`。改动通用层时验证关闭生命周期、焦点、快速切换、窄窗口和减少动态效果设置。
