const chapters = {
  "chapter-1": {
    volume: "第一卷",
    number: 1,
    title: "雨夜",
    words: 1248,
    content: [
      "雨从傍晚开始下，到午夜还没有停。",
      "林默撑着一把黑伞，沿着旧城区狭窄的街道往前走。路灯在雨幕里晕开一圈昏黄的光，积水倒映着两侧紧闭的店门。这里比他记忆中更安静，连远处高架桥上的车声都像隔着一层厚重的玻璃。",
      "巷口那家钟表店已经关了。褪色的招牌被风吹得轻轻摇晃，每一下都发出短促的吱呀声。林默抬头看了一眼时间，十一点四十七分，比约定的时间早了十三分钟。",
      "他没有立刻进去。",
      "雨水顺着伞骨滑落，在脚边汇成细小的水流。就在他准备点开手机时，巷子深处传来了一声脚步。很轻，像有人踩碎了一片被雨泡软的落叶。",
      "林默抬起头。巷子里空无一人。",
      "他慢慢地向巷子深处走去，雨水落在肩上。第二声脚步紧跟着响起，这一次，比刚才近了许多。"
    ]
  },
  "chapter-2": {
    volume: "第一卷",
    number: 2,
    title: "来客",
    words: 2016,
    content: [
      "清晨六点，门铃响了三次。",
      "林默没有睡。他坐在客厅的旧沙发上，看着窗外逐渐褪色的夜空。桌上的信封仍然没有拆开，边缘已经被潮湿的手指压出一道浅浅的折痕。",
      "第四次门铃响起时，他终于站了起来。门外的人没有出声，只在猫眼之外留下一道模糊的影子。",
      "“谁？”林默问。",
      "门外沉默了几秒。一个女人的声音隔着门板传来：“昨晚在巷子里，你看见他了，对吗？”"
    ]
  },
  "chapter-3": {
    volume: "第一卷",
    number: 3,
    title: "旧照片",
    words: 386,
    content: [
      "本章大纲：林默从信封中发现一张拍摄于二十年前的合影。照片里除了父亲，还有一个与昨夜巷中身影极其相似的人。",
      "关键转折：照片背后写着一个已经废弃的车站地址，以及一句“不要相信准时出现的人”。"
    ]
  },
  "chapter-4": {
    volume: "第二卷",
    number: 4,
    title: "回声",
    words: 524,
    content: [
      "本章大纲：旧车站里的广播每隔十分钟重复一段不存在于任何记录中的失踪通告。",
      "林默在通告里听见了自己的名字，而播报日期是三天以后。"
    ]
  },
  "chapter-5": {
    volume: "第二卷",
    number: 5,
    title: "破晓",
    words: 0,
    content: ["在这里开始书写新的章节……"]
  }
};

const projects = {
  myStory: { name: "myStory", bookTitle: "长夜" },
  starSea: { name: "星海纪元", bookTitle: "星海无声" },
  mistHarbor: { name: "雾港来信", bookTitle: "潮痕" }
};

const projectConversations = {
  myStory: [
    { id: "chapter", title: "第一章创作助手", updatedAt: "刚刚" },
    { id: "world", title: "世界观讨论", updatedAt: "昨天" },
    { id: "outline", title: "情节大纲推演", updatedAt: "周一" }
  ],
  starSea: [
    { id: "character", title: "主角设定讨论", updatedAt: "2 小时前" },
    { id: "volume", title: "第一卷结构梳理", updatedAt: "周二" }
  ],
  mistHarbor: [
    { id: "clue", title: "线索一致性检查", updatedAt: "周三" }
  ]
};

const activeConversationByProject = {
  myStory: "chapter",
  starSea: "character",
  mistHarbor: "clue"
};

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

function icon(id) {
  return `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
}

function storedChapter(id) {
  try {
    const draft = localStorage.getItem(`storyos-prototype:${id}`);
    return draft ? { ...chapters[id], ...JSON.parse(draft) } : chapters[id];
  } catch {
    return chapters[id];
  }
}

function saveCurrentChapter() {
  const chapter = chapters[activeChapterId];
  if (!chapter) return;
  chapter.title = titleInput.value.trim() || "未命名章节";
  chapter.content = [...editor.querySelectorAll("p")].map((paragraph) => paragraph.textContent || "");
  chapter.words = countCharacters(editor.innerText);
  localStorage.setItem(`storyos-prototype:${activeChapterId}`, JSON.stringify(chapter));
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

function countCharacters(value) {
  return Array.from(value.replace(/\s/g, "")).length;
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
  const activeConversation = projectConversations[projectId]?.find(
    (item) => item.id === activeConversationByProject[projectId]
  );
  document.querySelector("#conversation-title").textContent = activeConversation?.title || "开始新对话";
  renderProjectConversationList();
}

function updateSidebarEmptyStates() {
  document.querySelector("#empty-projects").hidden = document.querySelectorAll(".project-node").length > 0;
  document.querySelector("#empty-global-conversations").hidden =
    document.querySelectorAll(".global-conversation-row").length > 0;
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
}

function createGlobalConversation() {
  const list = document.querySelector("#global-conversation-list");
  const row = document.createElement("button");
  row.className = "global-conversation-row";
  row.type = "button";
  row.dataset.conversation = `global-${Date.now()}`;
  row.innerHTML = "<span>新对话</span><small>刚刚</small>";
  list.prepend(row);
  row.addEventListener("click", () => selectGlobalConversation(row));
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
    if (activeConversationScope === "global") {
      appendMessage("assistant", "这是一个全局对话，我不会自动读取任何项目或书籍内容。你可以在这里讨论通用写作方法、灵感或其他不属于具体项目的话题。");
    } else {
      const chapter = chapters[activeChapterId];
      appendMessage("assistant", `我正在结合《${chapter.title}》当前修订进行分析。这个段落的感官信息很清楚，可以再强化人物此刻的具体目标，让紧张感不仅来自环境，也来自他害怕失去什么。`);
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
  if (action === "new-project") showToast("原型演示：创建项目后，将自动生成一本书和独立的项目对话区");
  if (action === "add-chapter") showToast("原型演示：这里将创建新章节并自动打开");
});

document.querySelectorAll(".project-book").forEach((button) => {
  button.addEventListener("click", () => {
    activateProject(button.dataset.project);
    const activeId = activeConversationByProject[button.dataset.project];
    if (activeId) selectProjectConversation(button.dataset.project, activeId, false);
    else createProjectConversation(button.dataset.project);
    showToast(`已切换到「${projects[button.dataset.project].name}」书籍工作区`);
  });
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
updateSidebarEmptyStates();
renderChapter("chapter-1");
renderProjectConversationList();
