import { chapters, projects, projectConversations, activeConversationByProject, globalConversations } from "./modules/data.js?v=2";
import { state, countCharacters, readDraft, writeDraft } from "./modules/store.js";
import { openDialog, closeDialog } from "./modules/dialogs.js";
import { renderGlobalConversation, renderSettings, renderAbout } from "./modules/workspace.js?v=2";
import { renderBookOverview, renderPageOverview } from "./modules/book.js";
import { agentProcessMarkup, assistantReply } from "./modules/assistant.js";

const app = document.querySelector("#app");
const editor = document.querySelector("#chapter-editor");
const titleInput = document.querySelector("#chapter-title");
const wordCount = document.querySelector("#word-count");
const saveStatus = document.querySelector("#save-status");
const messages = document.querySelector("#messages");
const aiInput = document.querySelector("#ai-input");
const toast = document.querySelector("#toast");
const conversationSwitcher = document.querySelector("#conversation-switcher");
const conversationPopover = document.querySelector("#conversation-popover");
const projectConversationList = document.querySelector("#project-conversation-list");
let activeChapterId = null;
let activeProjectId = "myStory";
let activeConversationScope = "project";
let saveTimer = null;
let toastTimer = null;
let previousScreen = "book";

function icon(id) {
  return `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
}

function storedChapter(id) {
  return readDraft(chapters, id);
}

function saveCurrentChapter() {
  const chapter = chapters[activeChapterId];
  if (!chapter) return;
  chapter.title = titleInput.value.trim() || "未命名章节";
  chapter.content = [...editor.querySelectorAll("p")].map((paragraph) => paragraph.textContent || "");
  chapter.words = countCharacters(editor.innerText);
  writeDraft(activeChapterId, chapter);
  saveStatus.classList.remove("saving");
  saveStatus.classList.add("saved");
  saveStatus.innerHTML = `${icon("i-check")}已保存`;
}

function queueSave() {
  clearTimeout(saveTimer);
  saveStatus.classList.remove("saved");
  saveStatus.classList.add("saving");
  saveStatus.textContent = "保存中…";
  saveTimer = setTimeout(saveCurrentChapter, 650);
}

function updateCount() {
  wordCount.textContent = `${countCharacters(editor.innerText).toLocaleString("zh-CN")} 字`;
}

function renderChapter(id) {
  if (!chapters[id]) return;
  if (activeChapterId) saveCurrentChapter();
  activeChapterId = id;
  const chapter = storedChapter(id);
  chapters[id] = chapter;
  document.querySelectorAll(".chapter-row").forEach((row) => row.classList.toggle("active", row.dataset.chapter === id));
  document.querySelector("#breadcrumb-volume").textContent = chapter.volume;
  document.querySelector("#breadcrumb-chapter").textContent = `第${chapter.number}章`;
  document.querySelector("#chapter-kicker").textContent = `${chapter.volume} · 第 ${chapter.number} 章`;
  document.querySelector("#document-position").textContent = `第 ${chapter.number} 章`;
  document.querySelector("#composer-chapter").textContent = `第${chapter.number}章`;
  document.querySelector("#context-chip span").textContent = `第${chapter.number}章 · ${chapter.title}`;
  document.querySelector("#context-chip").hidden = activeConversationScope === "global";
  titleInput.value = chapter.title;
  editor.innerHTML = chapter.content.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
  wordCount.textContent = `${chapter.words.toLocaleString("zh-CN")} 字`;
  saveStatus.className = "save-status saved";
  saveStatus.innerHTML = `${icon("i-check")}已保存`;
  editor.closest(".editor-scroll").scrollTop = 0;
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

function showToast(text) {
  clearTimeout(toastTimer);
  toast.textContent = text;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
}

function setHeaderVisible(visible) {
  document.querySelector(".workspace-header").hidden = !visible;
}

function removeStandalonePage() {
  document.querySelector(".workspace > .standalone-page")?.remove();
}

function showStandalonePage(screen, markup) {
  previousScreen = state.screen;
  state.screen = screen;
  document.querySelector(".creation-workspace").hidden = true;
  setHeaderVisible(false);
  removeStandalonePage();
  document.querySelector(".workspace").insertAdjacentHTML("beforeend", markup);
  bindStandalonePage();
}

function showBookWorkspace() {
  state.screen = "book";
  removeStandalonePage();
  setHeaderVisible(true);
  document.querySelector(".creation-workspace").hidden = false;
}

function showBookMainView(kind = "profile") {
  showBookWorkspace();
  state.bookView = kind === "editor" ? "editor" : "overview";
  const editorPanel = document.querySelector(".editor-panel");
  let view = document.querySelector(".book-main-view");
  if (kind === "editor") {
    editorPanel.hidden = false;
    view?.remove();
    document.querySelector(".overview-row").classList.remove("active");
    return;
  }
  editorPanel.hidden = true;
  if (!view) {
    view = document.createElement("main");
    view.className = "book-main-view";
    editorPanel.after(view);
  }
  view.innerHTML = kind === "pages"
    ? renderPageOverview(chapters)
    : renderBookOverview(projects[activeProjectId], chapters);
  document.querySelector(".overview-row").classList.toggle("active", kind === "profile");
}

function bindStandalonePage() {
  const page = document.querySelector(".workspace > .standalone-page");
  if (!page) return;
  page.querySelectorAll("[data-fill-prompt]").forEach((button) => button.addEventListener("click", () => {
    const input = page.querySelector("textarea");
    input.value = button.dataset.fillPrompt;
    input.focus();
  }));
  page.querySelector(".standalone-composer")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = event.currentTarget.querySelector("textarea");
    const text = input.value.trim();
    if (!text) return;
    const stream = page.querySelector(".standalone-messages");
    stream.querySelector(".empty-hero")?.remove();
    stream.insertAdjacentHTML("beforeend", `<article class="standalone-user">${escapeHtml(text)}</article><article class="standalone-assistant"><b>✦ StoryOS</b><p>我会把这个问题拆成目标、约束和下一步行动。作为全局对话，这里不会自动读取任何项目文件。</p>${agentProcessMarkup()}</article>`);
    input.value = "";
    stream.scrollTop = stream.scrollHeight;
  });
  page.querySelector("#model-settings")?.addEventListener("submit", (event) => {
    event.preventDefault();
    state.configured = true;
    showToast("模型配置已保存，连接测试成功");
  });
}

function initializeGlobalConversations() {
  const list = document.querySelector("#global-conversation-list");
  list.querySelector("#empty-global-conversations")?.remove();
  globalConversations.forEach((conversation) => {
    const row = document.createElement("button");
    row.className = "global-conversation-row";
    row.type = "button";
    row.dataset.conversation = conversation.id;
    row.innerHTML = `<span>${escapeHtml(conversation.title)}</span><small>${conversation.updatedAt}</small>`;
    list.append(row);
  });
}

function decorateProjectRows() {
  document.querySelectorAll(".project-node").forEach((node) => {
    if (node.querySelector(":scope > .project-more")) return;
    const more = document.createElement("button");
    more.className = "project-more";
    more.type = "button";
    more.dataset.action = "project-menu";
    more.setAttribute("aria-label", "项目操作");
    more.textContent = "···";
    node.querySelector(".project-row").after(more);
  });
}

function openProjectActions(node) {
  const id = node.dataset.project;
  const project = projects[id];
  openDialog({
    title: `管理项目“${project.name}”`,
    description: "可以重命名项目，或从原型工作区中移除它。",
    fields: [{ name: "name", label: "项目名称", value: project.name }],
    confirmLabel: "保存名称",
    onConfirm: ({ name }) => {
      project.name = name.trim();
      node.querySelector(".project-row strong").textContent = project.name;
      if (id === activeProjectId) activateProject(id);
      showToast("项目名称已更新");
    }
  });
  const footer = document.querySelector(".prototype-dialog footer");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "dialog-delete-link";
  remove.textContent = "删除项目";
  remove.addEventListener("click", () => {
    closeDialog();
    openDialog({ title: `删除项目“${project.name}”？`, description: "原型只会移除演示数据；正式应用会将项目移动到系统回收站。", confirmLabel: "确认删除", danger: true, onConfirm: () => {
      node.remove();
      delete projects[id];
      updateSidebarEmptyStates();
      if (id === activeProjectId) showStandalonePage("global", renderGlobalConversation());
      showToast("项目已从原型中移除");
    }});
  });
  footer.prepend(remove);
}

function createProject() {
  openDialog({
    title: "新建空白项目",
    description: "创建新的本地创作空间，并自动准备一本待命名书籍。",
    fields: [{ name: "name", label: "项目名称", placeholder: "例如：新故事" }, { name: "path", label: "项目资源目录", value: "E:\\workspace" }],
    confirmLabel: "创建项目",
    onConfirm: ({ name }) => {
      const id = `project-${Date.now()}`;
      projects[id] = { name, bookTitle: "未命名书籍", description: "在这里填写新书简介。", chapters: 0, chapterIds: [], volumes: {} };
      projectConversations[id] = [];
      activeConversationByProject[id] = null;
      document.querySelector("#project-tree").insertAdjacentHTML("beforeend", `<section class="project-node" data-project="${id}"><button class="project-row" type="button" data-action="toggle-project" aria-expanded="false"><svg class="disclosure"><use href="#i-chevron"/></svg><svg><use href="#i-folder"/></svg><strong>${escapeHtml(name)}</strong></button><div class="project-children"><button class="project-book" type="button" data-project="${id}"><span class="tree-rail"></span><svg><use href="#i-book"/></svg><span>书籍工作区</span><small>0章</small></button></div></section>`);
      decorateProjectRows();
      updateSidebarEmptyStates();
      activateProject(id);
      showBookMainView("profile");
      showToast(`项目“${name}”已创建`);
    }
  });
}

function closeConversationPopover() {
  conversationPopover.hidden = true;
  conversationSwitcher.setAttribute("aria-expanded", "false");
}

function renderProjectConversationList() {
  const conversations = projectConversations[activeProjectId] || [];
  const activeId = activeConversationByProject[activeProjectId];
  document.querySelector("#conversation-count").textContent = `${conversations.length} 个对话`;
  if (conversations.length === 0) {
    projectConversationList.innerHTML = '<p class="conversation-empty-state">暂无项目对话，点击“新建”开始</p>';
    document.querySelector("#conversation-title").textContent = "开始新对话";
    return;
  }
  projectConversationList.innerHTML = conversations.map((conversation) => `
    <div class="project-conversation-row ${conversation.id === activeId ? "active" : ""}" role="listitem" data-conversation="${conversation.id}">
      ${icon("i-check")}
      <button class="project-conversation-select" type="button" data-action="select-project-conversation" data-conversation="${conversation.id}" ${conversation.id === activeId ? 'aria-current="true"' : ""}>
        <span class="project-conversation-copy"><strong>${escapeHtml(conversation.title)}</strong><small>${conversation.updatedAt}</small></span>
      </button>
      <button class="conversation-delete" type="button" data-action="delete-project-conversation" data-conversation="${conversation.id}" aria-label="删除对话 ${escapeHtml(conversation.title)}">${icon("i-trash")}</button>
    </div>
  `).join("");
}

function selectProjectConversation(projectId, conversationId, notify = true) {
  const conversation = projectConversations[projectId]?.find((item) => item.id === conversationId);
  if (!conversation) return;
  activeConversationByProject[projectId] = conversationId;
  activeConversationScope = "project";
  activateProject(projectId);
  document.querySelectorAll(".global-conversation-row").forEach((item) => item.classList.remove("active"));
  document.querySelector("#conversation-title").textContent = conversation.title;
  document.querySelector("#composer-chapter").textContent = `第${chapters[activeChapterId].number}章`;
  document.querySelector("#context-chip").hidden = false;
  renderProjectConversationList();
  closeConversationPopover();
  app.classList.remove("ai-collapsed");
  if (notify) showToast(`已切换到“${conversation.title}”`);
}

function openProjectNode(projectId) {
  document.querySelectorAll(".project-node").forEach((node) => {
    const isTarget = node.dataset.project === projectId;
    node.classList.toggle("open", isTarget);
    const toggle = node.querySelector('[data-action="toggle-project"]');
    toggle.setAttribute("aria-expanded", String(isTarget));
    toggle.querySelector(".disclosure").classList.toggle("open", isTarget);
  });
}

function renderCatalogForProject(projectId) {
  const project = projects[projectId];
  const tree = document.querySelector("#chapter-tree");
  const ids = project.chapterIds || [];
  const volumeNames = Object.keys(project.volumes || {});
  if (volumeNames.length === 0) {
    tree.innerHTML = '<p class="catalog-empty">暂无分卷，先新建一个分卷开始写作。</p>';
    return;
  }
  tree.innerHTML = volumeNames.map((volumeName) => {
    const volumeChapters = ids.map((id) => [id, chapters[id]]).filter(([, chapter]) => chapter?.volume === volumeName);
    const chapterRows = volumeChapters.length
      ? volumeChapters.map(([id, chapter]) => `<button class="chapter-row ${id === activeChapterId ? "active" : ""}" type="button" data-chapter="${id}"><span class="chapter-index">${String(chapter.number).padStart(2, "0")}</span><span><strong>${escapeHtml(chapter.title)}</strong><small>${chapter.status} · ${chapter.words.toLocaleString("zh-CN")} 字</small></span><i></i></button>`).join("")
      : '<p class="volume-empty">暂无章节</p>';
    return `<section class="volume open" data-volume="${escapeHtml(volumeName)}"><header><button class="volume-toggle" type="button"><svg class="disclosure open"><use href="#i-chevron"/></svg><span><strong>${escapeHtml(volumeName)}</strong><small>${escapeHtml(project.volumes[volumeName] || "未命名分卷")}</small></span></button><span class="volume-actions"><button class="volume-delete" type="button" data-action="delete-volume" aria-label="删除分卷${escapeHtml(volumeName)}">×</button><button class="chapter-add" type="button" data-action="add-chapter" aria-label="在${escapeHtml(volumeName)}新建章节"><svg><use href="#i-plus"/></svg></button></span></header><div class="volume-chapters">${chapterRows}</div></section>`;
  }).join("");
}

function activateProject(projectId) {
  const project = projects[projectId];
  if (!project) return;
  activeProjectId = projectId;
  openProjectNode(projectId);
  document.querySelectorAll(".project-node").forEach((node) => node.classList.toggle("selected", node.dataset.project === projectId));
  document.querySelectorAll(".project-book").forEach((button) => button.classList.toggle("active", button.dataset.project === projectId));
  document.querySelector("#current-project-name").textContent = project.name;
  document.querySelector("#current-book-title").textContent = project.bookTitle;
  document.querySelector("#current-book-title-crumb").textContent = `《${project.bookTitle}》`;
  document.querySelector("#composer-project").textContent = project.name;
  renderCatalogForProject(projectId);
  const activeConversation = projectConversations[projectId]?.find(
    (item) => item.id === activeConversationByProject[projectId]
  );
  document.querySelector("#conversation-title").textContent = activeConversation?.title || "开始新对话";
  renderProjectConversationList();
}

function updateSidebarEmptyStates() {
  const emptyProjects = document.querySelector("#empty-projects");
  const emptyConversations = document.querySelector("#empty-global-conversations");
  if (emptyProjects) emptyProjects.hidden = document.querySelectorAll(".project-node").length > 0;
  if (emptyConversations) emptyConversations.hidden = document.querySelectorAll(".global-conversation-row").length > 0;
}

function selectGlobalConversation(row) {
  activeConversationScope = "global";
  document.querySelectorAll(".global-conversation-row").forEach((item) => item.classList.toggle("active", item === row));
  document.querySelector("#conversation-title").textContent = row.querySelector("span").textContent;
  document.querySelector("#composer-project").textContent = "全局对话";
  document.querySelector("#composer-chapter").textContent = "无书籍上下文";
  document.querySelector("#context-chip").hidden = true;
  closeConversationPopover();
  app.classList.remove("ai-collapsed");
  showStandalonePage("global", renderGlobalConversation(row.querySelector("span").textContent));
}

function createGlobalConversation() {
  const list = document.querySelector("#global-conversation-list");
  const row = document.createElement("button");
  row.className = "global-conversation-row";
  row.type = "button";
  row.dataset.conversation = `global-${Date.now()}`;
  row.innerHTML = "<span>新对话</span><small>刚刚</small>";
  list.prepend(row);
  updateSidebarEmptyStates();
  selectGlobalConversation(row);
  showToast("已创建全局对话，不携带任何项目或书籍上下文");
  aiInput.focus();
}

function createProjectConversation(projectId) {
  activateProject(projectId);
  const conversation = {
    id: `new-${Date.now()}`,
    title: "新对话",
    updatedAt: "刚刚"
  };
  projectConversations[projectId].unshift(conversation);
  selectProjectConversation(projectId, conversation.id, false);
  showToast(`已在「${projects[projectId].name}」中创建对话`);
  aiInput.focus();
}

function deleteProjectConversation(conversationId) {
  const conversations = projectConversations[activeProjectId];
  const index = conversations.findIndex((item) => item.id === conversationId);
  if (index < 0) return;
  const [deleted] = conversations.splice(index, 1);
  if (activeConversationByProject[activeProjectId] === conversationId) {
    activeConversationByProject[activeProjectId] = conversations[Math.min(index, conversations.length - 1)]?.id || null;
  }
  const nextId = activeConversationByProject[activeProjectId];
  if (nextId) selectProjectConversation(activeProjectId, nextId, false);
  else {
    document.querySelector("#conversation-title").textContent = "开始新对话";
    renderProjectConversationList();
  }
  showToast(`已删除“${deleted.title}”`);
}

function appendMessage(role, text) {
  const article = document.createElement("article");
  article.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;
  if (role === "assistant") {
    const author = document.createElement("div");
    author.className = "message-author";
    author.innerHTML = `<span class="ai-avatar small">${icon("i-spark")}</span><strong>StoryOS</strong>`;
    article.append(author);
  }
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  article.append(paragraph);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
}

function simulateAssistantReply() {
  const typing = document.createElement("div");
  typing.className = "typing";
  typing.innerHTML = "<i></i><i></i><i></i>";
  messages.append(typing);
  messages.scrollTop = messages.scrollHeight;
  setTimeout(() => {
    typing.remove();
    const chapter = chapters[activeChapterId];
    appendMessage("assistant", assistantReply(activeConversationScope, chapter?.title || "当前章节"));
    if (activeConversationScope !== "global") {
      messages.lastElementChild.insertAdjacentHTML("beforeend", agentProcessMarkup());
    }
  }, 900);
}

function togglePanel(panel) {
  app.classList.remove("ai-focus");
  app.classList.toggle(panel === "toc" ? "toc-collapsed" : "ai-collapsed");
}

function bindResizer(selector, variable, min, max, reverse = false) {
  const handle = document.querySelector(selector);
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const initial = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(variable));
    document.body.classList.add("resizing");
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      const delta = (moveEvent.clientX - startX) * (reverse ? -1 : 1);
      document.documentElement.style.setProperty(variable, `${Math.min(max, Math.max(min, initial + delta))}px`);
    };
    const stop = () => {
      document.body.classList.remove("resizing");
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
  });
}

function createVolume() {
  const number = Object.keys(projects[activeProjectId].volumes || {}).length + 1;
  openDialog({ title: "新建分卷", fields: [{ name: "title", label: "分卷名称", value: `第${number}卷` }, { name: "subtitle", label: "分卷副标题", placeholder: "例如：新的旅程", required: false }], confirmLabel: "创建分卷", onConfirm: ({ title, subtitle }) => {
    projects[activeProjectId].volumes[title] = subtitle || "未命名分卷";
    renderCatalogForProject(activeProjectId);
    showToast(`已创建${title}`);
  }});
}

function createChapter(targetVolume) {
  const volume = targetVolume || document.querySelector(".volume:last-of-type") || document.querySelector(".volume");
  if (!volume) return createVolume();
  const nextNumber = Object.keys(chapters).length + 1;
  openDialog({ title: "新建章节", fields: [{ name: "title", label: "章节标题", value: `第 ${nextNumber} 章` }], confirmLabel: "创建并打开", onConfirm: ({ title }) => {
    const id = `chapter-${Date.now()}`;
    const volumeTitle = volume.dataset.volume;
    chapters[id] = { volume: volumeTitle, number: nextNumber, title, words: 0, status: "未开始", content: ["在这里开始书写新的章节……"] };
    projects[activeProjectId].chapterIds.push(id);
    projects[activeProjectId].chapters = projects[activeProjectId].chapterIds.length;
    document.querySelector(`.project-book[data-project="${activeProjectId}"] small`).textContent = `${projects[activeProjectId].chapters}章`;
    volume.querySelector(".volume-empty")?.remove();
    volume.querySelector(".volume-chapters").insertAdjacentHTML("beforeend", `<button class="chapter-row" type="button" data-chapter="${id}"><span class="chapter-index">${String(nextNumber).padStart(2, "0")}</span><span><strong>${escapeHtml(title)}</strong><small>未开始</small></span><i></i></button>`);
    renderChapter(id);
    showBookMainView("editor");
    showToast(`已创建章节“${title}”`);
  }});
}

function openHistory() {
  openDialog({ title: `“${chapters[activeChapterId].title}”的历史版本`, description: "自动保存会在关键编辑后生成版本。选择恢复不会影响原型之外的数据。", confirmLabel: "关闭", onConfirm: () => true });
  document.querySelector(".dialog-fields").innerHTML = `<div class="history-list"><button type="button"><span><b>当前版本</b><small>刚刚 · ${chapters[activeChapterId].words.toLocaleString("zh-CN")} 字</small></span><i>当前</i></button><button type="button"><span><b>自动保存</b><small>今天 10:24 · 1,196 字</small></span><i>预览</i></button><button type="button"><span><b>AI 修改前</b><small>昨天 22:08 · 1,121 字</small></span><i>预览</i></button></div>`;
}

function openChapterMenu() {
  openDialog({ title: `管理章节“${chapters[activeChapterId].title}”`, fields: [{ name: "title", label: "章节标题", value: chapters[activeChapterId].title }, { name: "status", label: "写作状态", type: "select", options: ["草稿", "大纲", "已完成", "未开始"] }], confirmLabel: "保存", onConfirm: ({ title, status }) => {
    chapters[activeChapterId].title = title;
    chapters[activeChapterId].status = status;
    titleInput.value = title;
    const row = document.querySelector(`[data-chapter="${activeChapterId}"]`);
    row.querySelector("strong").textContent = title;
    row.querySelector("small").textContent = `${status} · ${chapters[activeChapterId].words.toLocaleString("zh-CN")} 字`;
    showToast("章节信息已更新");
  }});
  const footer = document.querySelector(".prototype-dialog footer");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "dialog-delete-link";
  remove.textContent = "删除章节";
  remove.addEventListener("click", () => {
    const deletingId = activeChapterId;
    const deletingTitle = chapters[deletingId].title;
    closeDialog();
    openDialog({ title: `删除章节“${deletingTitle}”？`, description: "章节正文和历史版本将从当前项目中移除，此操作无法撤销。", confirmLabel: "确认删除", danger: true, onConfirm: () => {
      const project = projects[activeProjectId];
      project.chapterIds = project.chapterIds.filter((id) => id !== deletingId);
      project.chapters = project.chapterIds.length;
      document.querySelector(`.project-book[data-project="${activeProjectId}"] small`).textContent = `${project.chapters}章`;
      renderCatalogForProject(activeProjectId);
      const nextId = project.chapterIds[0];
      if (nextId) { renderChapter(nextId); showBookMainView("editor"); }
      else showBookMainView("profile");
      showToast(`章节“${deletingTitle}”已删除`);
    }});
  });
  footer.prepend(remove);
}

document.querySelector("#chapter-tree").addEventListener("click", (event) => {
  const chapterRow = event.target.closest("[data-chapter]");
  if (chapterRow) renderChapter(chapterRow.dataset.chapter);
  const volumeToggle = event.target.closest(".volume-toggle");
  if (volumeToggle) {
    const volume = volumeToggle.closest(".volume");
    volume.classList.toggle("open");
    volumeToggle.querySelector(".disclosure").classList.toggle("open", volume.classList.contains("open"));
  }
});

document.querySelector(".catalog-search input").addEventListener("input", (event) => {
  const query = event.target.value.trim().toLowerCase();
  document.querySelectorAll(".chapter-row").forEach((row) => {
    row.hidden = query !== "" && !row.textContent.toLowerCase().includes(query);
  });
});

editor.addEventListener("input", () => {
  updateCount();
  queueSave();
});
titleInput.addEventListener("input", () => {
  const activeRow = document.querySelector(`.chapter-row[data-chapter="${activeChapterId}"] strong`);
  if (activeRow) activeRow.textContent = titleInput.value || "未命名章节";
  queueSave();
});

document.querySelector("#ai-composer").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = aiInput.value.trim();
  if (!text) return;
  appendMessage("user", text);
  aiInput.value = "";
  simulateAssistantReply();
});
aiInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.currentTarget.form.requestSubmit();
  }
});

conversationSwitcher.addEventListener("click", (event) => {
  event.stopPropagation();
  if (activeConversationScope === "global") {
    const activeId = activeConversationByProject[activeProjectId];
    if (activeId) selectProjectConversation(activeProjectId, activeId, false);
  }
  const shouldOpen = conversationPopover.hidden;
  conversationPopover.hidden = !shouldOpen;
  conversationSwitcher.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen) renderProjectConversationList();
});

document.addEventListener("click", (event) => {
  const projectBook = event.target.closest(".project-book");
  if (projectBook) {
    activateProject(projectBook.dataset.project);
    const activeId = activeConversationByProject[projectBook.dataset.project];
    if (activeId) selectProjectConversation(projectBook.dataset.project, activeId, false);
    showBookMainView("profile");
    showToast(`已切换到「${projects[projectBook.dataset.project].name}」书籍工作区`);
    return;
  }
  const globalRow = event.target.closest(".global-conversation-row");
  if (globalRow) {
    selectGlobalConversation(globalRow);
    return;
  }
  const anyChapter = event.target.closest("[data-chapter]");
  if (anyChapter && !anyChapter.closest("#chapter-tree")) {
    renderChapter(anyChapter.dataset.chapter);
    showBookMainView("editor");
    return;
  }
  const actionTarget = event.target.closest("[data-action]");
  const action = actionTarget?.dataset.action;
  if (action === "toggle-toc") togglePanel("toc");
  if (action === "toggle-ai") togglePanel("ai");
  if (action === "toggle-project") {
    const node = actionTarget.closest(".project-node");
    const shouldOpen = !node.classList.contains("open");
    document.querySelectorAll(".project-node").forEach((item) => {
      const isTarget = item === node && shouldOpen;
      item.classList.toggle("open", isTarget);
      item.querySelector('[data-action="toggle-project"]').setAttribute("aria-expanded", String(isTarget));
      item.querySelector(".disclosure").classList.toggle("open", isTarget);
    });
  }
  if (action === "focus-ai") {
    app.classList.remove("ai-collapsed");
    app.classList.toggle("ai-focus");
  }
  if (action === "ask-selection") {
    const selected = window.getSelection()?.toString().trim();
    aiInput.value = selected ? `请帮我分析这段文字：\n“${selected}”` : "请分析当前章节的节奏和氛围。";
    aiInput.focus();
  }
  if (action === "apply-suggestion") {
    editor.insertAdjacentHTML("beforeend", "<p>脚步声在雨里多出了一拍。林默停下，那声音也随之消失。</p>");
    updateCount();
    queueSave();
    showToast("修改已应用，并将保存为新的章节版本");
  }
  if (action === "select-project-conversation") {
    selectProjectConversation(activeProjectId, actionTarget.dataset.conversation);
  }
  if (action === "delete-project-conversation") {
    event.stopPropagation();
    deleteProjectConversation(actionTarget.dataset.conversation);
  }
  if (action === "new-chat") {
    createProjectConversation(activeProjectId);
  }
  if (action === "new-global-chat") createGlobalConversation();
  if (action === "new-project") createProject();
  if (action === "add-volume") createVolume();
  if (action === "delete-volume") {
    const volumeName = actionTarget.closest(".volume").dataset.volume;
    openDialog({ title: `删除分卷“${volumeName}”？`, description: "分卷结构会被删除，其中的章节将保留并移动到“未分卷”。", confirmLabel: "删除分卷", danger: true, onConfirm: () => {
      const project = projects[activeProjectId];
      const affected = project.chapterIds.filter((id) => chapters[id]?.volume === volumeName);
      delete project.volumes[volumeName];
      if (affected.length) {
        project.volumes["未分卷"] = "保留的章节";
        affected.forEach((id) => { chapters[id].volume = "未分卷"; });
      }
      renderCatalogForProject(activeProjectId);
      showToast(`分卷“${volumeName}”已删除，章节已保留`);
    }});
  }
  if (action === "add-chapter") createChapter(actionTarget.closest(".volume"));
  if (action === "book-overview" || action === "overview-profile") showBookMainView("profile");
  if (action === "overview-pages") showBookMainView("pages");
  if (action === "chapter-history") openHistory();
  if (action === "chapter-menu") openChapterMenu();
  if (action === "toggle-settings") {
    const menu = document.querySelector("#settings-menu");
    menu.hidden = !menu.hidden;
    actionTarget.setAttribute("aria-expanded", String(!menu.hidden));
  }
  if (action === "open-settings") { document.querySelector("#settings-menu").hidden = true; showStandalonePage("settings", renderSettings(state.configured)); }
  if (action === "open-about") { document.querySelector("#settings-menu").hidden = true; showStandalonePage("about", renderAbout()); }
  if (action === "back-workspace") {
    if (previousScreen === "global") showStandalonePage("global", renderGlobalConversation("悬疑开场写作方法"));
    else showBookWorkspace();
  }
  if (action === "project-menu") { event.preventDefault(); event.stopPropagation(); openProjectActions(actionTarget.closest(".project-node")); }
  if (action === "add-context") {
    const chip = document.querySelector("#context-chip");
    chip.hidden = false;
    chip.querySelector("span").textContent = `第${chapters[activeChapterId].number}章 · ${chapters[activeChapterId].title}`;
    showToast("已添加当前章节作为上下文");
  }
  if (action === "view-diff") openDialog({ title: "修改差异", description: "红色为原文，绿色为建议内容。", confirmLabel: "关闭", onConfirm: () => true });
  if (action === "approve-agent-change") { actionTarget.closest(".agent-process").classList.add("approved"); actionTarget.closest("footer").innerHTML = "<span>✓ 修改已批准并加入正文</span>"; showToast("Agent 修改已批准"); }
  if (action === "reject-agent-change") { actionTarget.closest(".agent-process").remove(); showToast("已保留原文"); }
  if (action === "edit-book-profile") openDialog({ title: "编辑书籍资料", fields: [{ name: "title", label: "书籍名称", value: projects[activeProjectId].bookTitle }, { name: "description", label: "书籍简介", value: projects[activeProjectId].description }], confirmLabel: "保存资料", onConfirm: ({ title, description }) => { projects[activeProjectId].bookTitle = title; projects[activeProjectId].description = description; activateProject(activeProjectId); showBookMainView("profile"); showToast("书籍资料已保存"); } });
  if (action === "conversation-menu") openDialog({ title: "对话设置", description: "项目对话会自动携带当前书籍上下文。", fields: [{ name: "title", label: "对话标题", value: document.querySelector("#conversation-title").textContent }], confirmLabel: "保存", onConfirm: ({ title }) => { document.querySelector("#conversation-title").textContent = title; showToast("对话标题已更新"); } });
  if (action === "font-menu") showToast("字体：默认宋体（原型保留项目排版设置）");
  if (action === "size-menu") showToast("字号：15 px · 行高 2.05");
});

document.querySelector(".editor-toolbar").addEventListener("click", (event) => {
  const button = event.target.closest("[data-command]");
  if (!button) return;
  editor.focus();
  document.execCommand(button.dataset.command, false, button.dataset.value || null);
  button.classList.toggle("active", ["bold", "italic", "underline", "strikeThrough"].includes(button.dataset.command));
  queueSave();
});

document.querySelector("#context-chip").addEventListener("click", () => {
  const chip = document.querySelector("#context-chip");
  chip.hidden = true;
  showToast("已移除章节上下文；再次选择章节即可恢复");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeConversationPopover();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
    event.preventDefault();
    togglePanel("toc");
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
    event.preventDefault();
    togglePanel("ai");
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    createGlobalConversation();
  }
});

document.addEventListener("pointerdown", (event) => {
  if (
    !conversationPopover.hidden &&
    !conversationPopover.contains(event.target) &&
    !conversationSwitcher.contains(event.target)
  ) {
    closeConversationPopover();
  }
});

bindResizer(".toc-resizer", "--toc-width", 190, 330);
bindResizer(".ai-resizer", "--assistant-width", 310, 520, true);
initializeGlobalConversations();
decorateProjectRows();
updateSidebarEmptyStates();
renderCatalogForProject(activeProjectId);
renderChapter("chapter-1");
renderProjectConversationList();
