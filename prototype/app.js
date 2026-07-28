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

const app = document.querySelector("#app");
const editor = document.querySelector("#chapter-editor");
const titleInput = document.querySelector("#chapter-title");
const wordCount = document.querySelector("#word-count");
const saveStatus = document.querySelector("#save-status");
const messages = document.querySelector("#messages");
const aiInput = document.querySelector("#ai-input");
const toast = document.querySelector("#toast");
let activeChapterId = null;
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
  document.querySelector("#context-chip").hidden = false;
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
    appendMessage("assistant", `我正在结合《${chapter.title}》当前修订进行分析。这个段落的感官信息很清楚，可以再强化人物此刻的具体目标，让紧张感不仅来自环境，也来自他害怕失去什么。`);
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

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "toggle-toc") togglePanel("toc");
  if (action === "toggle-ai") togglePanel("ai");
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
  if (action === "new-chat") {
    document.querySelector("#conversation-title").textContent = "新对话";
    document.querySelectorAll(".conversation-row").forEach((row) => row.classList.remove("active"));
    showToast("已创建项目对话，当前章节上下文仍然保留");
    aiInput.focus();
  }
  if (action === "add-chapter") showToast("原型演示：这里将创建新章节并自动打开");
});

document.querySelectorAll(".conversation-row").forEach((row) => {
  row.addEventListener("click", () => {
    document.querySelectorAll(".conversation-row").forEach((item) => item.classList.remove("active"));
    row.classList.add("active");
    document.querySelector("#conversation-title").textContent = row.querySelector("span:nth-child(2)").textContent;
    app.classList.remove("ai-collapsed");
  });
});

document.querySelector("#context-chip").addEventListener("click", () => {
  const chip = document.querySelector("#context-chip");
  chip.hidden = true;
  showToast("已移除章节上下文；再次选择章节即可恢复");
});

document.addEventListener("keydown", (event) => {
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
    document.querySelector('[data-action="new-chat"]').click();
  }
});

bindResizer(".toc-resizer", "--toc-width", 190, 330);
bindResizer(".ai-resizer", "--assistant-width", 310, 520, true);
renderChapter(activeChapterId);
