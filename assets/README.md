# 静态资源归属

- `branding/storyos-logo.svg`：品牌 SVG 唯一源，供 renderer、HTML favicon 和 README 引用；由 Vite 处理浏览器资源 URL。
- `icons/storyos.{png,ico,icns}`：桌面窗口与安装包资源，按平台保留各自格式；通过 `ResourceLocator` 定位真实文件。
- `licenses/`：随阅读器及依赖交付的授权说明，保留第三方版权信息。
- `../src/main/agent/prompts/`：通用引擎提示词；`../src/main/story/resources/prompts/`：产品提示词。动态业务上下文由 StoryOS 适配层编译。
- `../src/main/story/resources/export-templates/`：随主进程编译的 PDF/EPUB 样式。HTML 正文转义继续由格式转换器负责。
- `../skills/`：可安装和加载的技能内容，Forge 放入 `app.asar.unpacked/skills`。
- `../docs/` 与 `../prototype/`：文档和设计参考，不进入运行时资源包。

Forge 仅发布运行时白名单；图标和技能解包，其余提示词、模板编译进入主进程。资源定位不依赖启动工作目录。
