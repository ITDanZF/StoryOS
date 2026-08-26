const libraryBooks = [
  {
    id: "long-night",
    projectId: "myStory",
    title: "长夜",
    genre: "悬疑 · 长篇小说",
    status: "writing",
    statusLabel: "写作中",
    chapters: 12,
    words: "3.8 万",
    progress: 38,
    updatedAt: "刚刚",
    latest: "第一卷 · 第 1 章《雨夜》",
    cover: "nocturne",
    coverKicker: "A STORY OF RAIN",
    coverNumber: "01",
    description: "一场持续二十年的雨，和一封不该准时送达的信。"
  },
  {
    id: "silent-stars",
    projectId: "starSea",
    title: "星海无声",
    genre: "科幻 · 太空歌剧",
    status: "writing",
    statusLabel: "写作中",
    chapters: 8,
    words: "2.1 万",
    progress: 24,
    updatedAt: "2 小时前",
    latest: "第一卷 · 第 8 章《引力边界》",
    cover: "cosmos",
    coverKicker: "DEEP SPACE",
    coverNumber: "02",
    description: "远航舰队在寂静星域发现来自未来的求救信号。"
  },
  {
    id: "tide-marks",
    projectId: "mistHarbor",
    title: "潮痕",
    genre: "奇幻 · 中篇小说",
    status: "planning",
    statusLabel: "构思中",
    chapters: 5,
    words: "0.7 万",
    progress: 12,
    updatedAt: "昨天",
    latest: "第二卷 · 故事大纲",
    cover: "harbor",
    coverKicker: "LETTERS FROM FOG",
    coverNumber: "03",
    description: "每封信都在退潮后出现，而寄信人已经失踪。"
  }
];

function escapeHtml(value) {
  return String(value).replace(/[&<>\"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  })[character]);
}

function bookCard(book) {
  return `<article class="library-book-card" data-library-book="${book.id}" data-status="${book.status}" data-search="${escapeHtml(`${book.title} ${book.genre} ${book.description}`.toLowerCase())}">
    <button class="library-cover cover-${book.cover}" type="button" data-action="open-library-book" data-project="${book.projectId || ""}" aria-label="打开《${escapeHtml(book.title)}》">
      <span class="cover-kicker">${escapeHtml(book.coverKicker)}</span>
      <span class="cover-art" aria-hidden="true"></span>
      <span class="cover-copy"><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.genre.split(" · ")[0])}小说</small></span>
      <b class="cover-number">${book.coverNumber}</b>
    </button>
    <div class="library-book-copy">
      <div class="library-book-heading">
        <span class="book-state ${book.status}"><i></i>${book.statusLabel}</span>
        <button class="library-book-more" type="button" data-action="library-book-menu" data-book="${book.id}" aria-label="管理《${escapeHtml(book.title)}》">···</button>
      </div>
      <button class="library-book-title" type="button" data-action="open-library-book" data-project="${book.projectId || ""}">
        <strong>${escapeHtml(book.title)}</strong>
        <span>${escapeHtml(book.description)}</span>
      </button>
      <div class="library-book-progress"><span><i style="width:${book.progress}%"></i></span><small>${book.progress}%</small></div>
      <footer><span>${book.chapters} 章</span><i></i><span>${book.words} 字</span><time>${book.updatedAt}</time></footer>
    </div>
  </article>`;
}

export function renderBookshelf() {
  const featured = libraryBooks[0];
  return `<section class="standalone-page bookshelf-page" aria-label="我的书架">
    <header class="bookshelf-header">
      <div class="bookshelf-title"><span class="bookshelf-title-mark"><svg><use href="#i-library"/></svg></span><div><span class="page-eyebrow">STORY LIBRARY</span><h1>我的书架</h1><p>让每一个正在生长的故事，都有清晰的下一步。</p></div></div>
      <div class="bookshelf-header-actions"><button class="library-secondary" type="button" data-action="import-book"><svg><use href="#i-upload"/></svg>导入书籍</button><button class="library-primary" type="button" data-action="new-book"><svg><use href="#i-plus"/></svg>新建书籍</button></div>
    </header>
    <div class="bookshelf-scroll">
      <div class="bookshelf-content">
        <section class="continue-writing" aria-label="继续写作">
          <div class="continue-copy"><span class="continue-eyebrow"><svg><use href="#i-clock"/></svg>最近写作</span><h2>故事停在雨夜，<br>下一页正等你落笔。</h2><p>${escapeHtml(featured.description)}</p><div class="continue-meta"><span><b>12</b> 章节</span><span><b>3.8 万</b> 字</span><span><b>38%</b> 进度</span></div><button type="button" data-action="continue-writing" data-project="${featured.projectId}">继续写作 <svg><use href="#i-arrow"/></svg></button></div>
          <div class="continue-book-scene" aria-hidden="true"><div class="continue-book-shadow"></div><div class="continue-book"><span>STORYOS ORIGINAL</span><strong>长<br>夜</strong><small>一场持续二十年的雨</small><i></i></div><div class="continue-note"><span>上次写到</span><strong>第一章 · 雨夜</strong><small>刚刚自动保存</small></div></div>
        </section>

        <section class="library-section" aria-labelledby="all-books-title">
          <div class="library-section-heading"><div><span class="page-eyebrow">ALL STORIES</span><h2 id="all-books-title">全部作品 <small>${libraryBooks.length}</small></h2></div><p>25 章 · 6.6 万字</p></div>
          <div class="library-toolbar">
            <label class="library-search"><svg><use href="#i-search"/></svg><input id="library-search" type="search" placeholder="搜索书名或类型" aria-label="搜索书籍"><kbd>⌘ F</kbd></label>
            <div class="library-filters" role="group" aria-label="筛选书籍"><button class="active" type="button" data-library-filter="all">全部</button><button type="button" data-library-filter="writing">写作中</button><button type="button" data-library-filter="planning">构思中</button><button type="button" data-library-filter="completed">已完成</button></div>
            <div class="library-views" role="group" aria-label="切换展示方式"><button class="active" type="button" data-library-view="grid" aria-label="网格视图"><svg><use href="#i-grid"/></svg></button><button type="button" data-library-view="list" aria-label="列表视图"><svg><use href="#i-list"/></svg></button></div>
          </div>
          <div class="library-grid" id="library-grid">${libraryBooks.map(bookCard).join("")}</div>
          <div class="library-empty" id="library-empty" hidden><span><svg><use href="#i-search"/></svg></span><strong>没有找到相关作品</strong><p>换一个关键词，或查看其他写作状态。</p></div>
        </section>
      </div>
    </div>
  </section>`;
}

export function addLibraryBook(title, genre = "长篇小说") {
  const book = {
    id: `book-${Date.now()}`,
    projectId: "",
    title,
    genre: `${genre} · 新作品`,
    status: "planning",
    statusLabel: "构思中",
    chapters: 0,
    words: "0",
    progress: 0,
    updatedAt: "刚刚",
    latest: "尚未开始",
    cover: "paper",
    coverKicker: "A NEW STORY",
    coverNumber: String(libraryBooks.length + 1).padStart(2, "0"),
    description: "一个新的故事，正等待它的第一句话。"
  };
  libraryBooks.unshift(book);
  return book;
}
