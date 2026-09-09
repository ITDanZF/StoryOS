# 前端通用动效

`src/renderer/components/motion` 是页面、弹窗和轻量状态反馈的公共入口。使用现有 CSS / Web Animations API，不新增动画库、全局状态或业务流程依赖。

## 页面

`WorkspaceLayout` 已用 `AnimatedPage` 包裹路由出口，新工作区路由自动获得进入动画。它只做淡入，不改变固定定位元素的坐标系，也不以路由为 React key 重建子组件。普通数据更新、搜索参数变化不会重复播放。3D 阅读器保留专用动画。

工作区以外的独立页面可以：

```tsx
import { AnimatedPage } from "../../components/motion/index.ts";

<AnimatedPage transitionKey={sectionId} className="overflow-hidden">
  <PageContent />
</AnimatedPage>
```

`transitionKey` 只触发动画，不重建内容。已有进入动画的页面可传 `disabled`。

## 弹窗

```tsx
import { AnimatedDialog } from "../../components/motion/index.ts";

{dialogOpen && (
  <AnimatedDialog
    aria-labelledby="example-title"
    className="max-w-lg rounded-2xl border border-border bg-card text-foreground shadow-2xl"
    busy={saving}
    stage={phase}
    onClose={() => setDialogOpen(false)}
  >
    {({ close }) => (
      <div className="p-5">
        <h2 id="example-title">示例面板</h2>
        <PanelContent />
        <button type="button" onClick={close} disabled={saving}>完成</button>
      </div>
    )}
  </AnimatedDialog>
)}
```

组件负责 portal、进入与退出、stage 尺寸过渡、Escape、遮罩关闭、Tab 焦点循环、关闭后的焦点恢复，以及退出期间禁止重复操作。`className` 和 `overlayClassName` 继续使用项目原有样式；业务保留自己的标题、表单、按钮和内容结构。表单放在组件内部，不再增加第二个 `role="dialog"`。

关闭必须调用 render prop 提供的 `close`，不要直接调用父级 `onClose` 或提前卸载组件。`onClose` 在退出动画完成后触发；外部强制卸载会立即取消动画。成功提交后可在提交回调中调用传入的 `close`，参考 `RenameProjectDialog`。忙碌时的用户关闭请求会被拦截。连续弹窗可用 `close(afterClose)` 在退出后执行下一步，避免提前卸载和焦点交叉。

`beforeClose` 仅用于释放临时资源，与退出动画同时执行；无论清理成功与否都会关闭。如果业务需要错误提示、确认或重试，应在调用 `close` 前处理，不要放进 `beforeClose`。导出弹窗是多步骤接入示例。

默认不将 stage 当作内容的 React key，避免重置输入和子组件状态。准备、选择保存位置、写入等连续阶段可统一映射为 `progress`，只更新文案；布局变化时再切换 stage。已有自己的弹窗容器时可以使用低层 `useDialogMotion`，但调用方需要自行处理焦点、portal 和关闭生命周期，优先使用 `AnimatedDialog`。

## 内容与微交互

引入公共入口会加载样式；纯 CSS 使用处也可以直接导入 `components/motion/motion.css`。

```tsx
<div className="motion-reveal">新出现的内容</div>
<p key={status} className="motion-fade" role="status">{message}</p>
<div className="motion-stagger grid gap-3">
  {items.map(item => <ItemCard key={item.id} item={item} />)}
</div>
```

错峰间隔为 35ms，最大延迟限制为 175ms，长列表不会越等越久。可用局部 CSS 的 `--motion-delay` 微调分段出现时间。避免给不断刷新的聊天内容或大型虚拟列表整体增加重播动画。

特殊元素可以用 `animateMotion(element, keyframes, "enter" | "exit" | "resize" | "content" | "fade")`，它返回原生 `Animation`。使用 `animation.finished` 协调生命周期，在卸载或被新动画替代时调用 `cancel()`；取消会使 `finished` 拒绝，调用方需要处理。普通内容优先使用 CSS 类。

`motion.css` 是公共时长与缓动的唯一来源：进入 300ms、退出 160ms、尺寸 320ms、内容 260ms、淡入 200ms。CSS 与 Web Animations 都读取这组参数。系统启用减少动态效果时跳过装饰动画，执行中的公共 Web Animation 也会结束；业务操作不会为动效增加延迟。

## 验证

启动渲染预览服务：

```powershell
node node_modules/vite/bin/vite.js --config vite.renderer.config.ts --host 127.0.0.1 --port 4319 --strictPort
```

使用独立的 Electron 预览和模拟 API，不修改实际书库：

```powershell
node scripts/verify-export-dialog-motion.mjs
node scripts/verify-shared-motion.mjs
```

验证通用弹窗的开关、焦点、表单值保持和快速导航，以及导出成功、失败重试、取消、窄窗口和减少动态效果。截图保存到 `test-results/`。
