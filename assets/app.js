(function () {
  "use strict";

  let data;
  let byId;
  let groupById;
  let currentArticle;
  let renderSerial = 0;
  let mermaidPromise;
  let searchTimer;
  let staticSearchIndex;
  let completedArticles = new Set(storageValue("agent-kb-articles", []));
  let completedDays = new Set(storageValue("agent-kb-plan", []));
  let pendingOps = storageValue("agent-kb-pending-ops", []);
  let progressSyncPromise;
  let syncState = "idle";

  const config = window.AGENT_SITE_CONFIG || { mode: "shared", githubUrl: "" };
  const isStatic = config.mode === "static";
  const isShared = config.mode === "shared";

  const main = document.querySelector("#main-content");
  const sidebar = document.querySelector("#sidebar-content");
  const toc = document.querySelector("#toc");
  const dialog = document.querySelector("#search-dialog");
  const searchInput = document.querySelector("#search-input");
  const searchResults = document.querySelector("#search-results");
  const menuButton = document.querySelector("#menu-button");
  const completeButton = document.querySelector("#complete-button");

  function storageValue(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch (_) { return fallback; }
  }

  const storage = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
      catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); }
      catch (_) { /* 浏览器禁用本地存储时，当前页面仍可使用。 */ }
    }
  };

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function articleHref(id) { return `#/article/${encodeURIComponent(id)}`; }
  function sectionHref(id) { return `#/section/${encodeURIComponent(id)}`; }
  function apiUrl(path) { return isStatic ? new URL(`./api/${path}`, document.baseURI) : `/api/${path}`; }
  function progressStats(kind, id = "") {
    let total;
    let done;
    if (kind === "all") {
      total = data.articles.length;
      done = completedArticles.size;
    } else if (kind === "group") {
      const ids = data.articles.filter((article) => article.group === id).map((article) => article.id);
      total = ids.length;
      done = ids.filter((articleId) => completedArticles.has(articleId)).length;
    } else {
      const days = data.plan.filter((item) => item.phase === id).map((item) => item.day);
      total = days.length;
      done = days.filter((day) => completedDays.has(day)).length;
    }
    return { done, total, percent: total ? Math.round(done / total * 100) : 0 };
  }
  function progressMetric(kind, id = "") {
    const { done, total, percent } = progressStats(kind, id);
    const unit = kind === "phase" ? "天" : "篇";
    return `<span class="progress-metric" data-progress-kind="${kind}" data-progress-id="${escapeHtml(id)}"><span class="progress-ring" style="--progress:${percent}%" role="progressbar" aria-label="学习进度 ${percent}%" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${total}"></span><span class="progress-fraction">${percent}% · ${done}/${total} ${unit}</span></span>`;
  }
  function progressCard(kind, title, id = "") {
    return `<div class="progress-summary"><div class="progress-summary-copy"><span>${escapeHtml(title)}</span>${progressMetric(kind, id)}</div></div>`;
  }
  function saveProgress() {
    storage.set("agent-kb-articles", [...completedArticles]);
    storage.set("agent-kb-plan", [...completedDays]);
  }
  function updateProgressUI() {
    if (!data) return;
    document.querySelectorAll(".progress-metric").forEach((metric) => {
      const { done, total, percent } = progressStats(metric.dataset.progressKind, metric.dataset.progressId);
      const ring = metric.querySelector(".progress-ring");
      ring.style.setProperty("--progress", `${percent}%`);
      ring.setAttribute("aria-label", `学习进度 ${percent}%`);
      ring.setAttribute("aria-valuenow", done);
      ring.setAttribute("aria-valuemax", total);
      metric.querySelector(".progress-fraction").textContent = `${percent}% · ${done}/${total} ${metric.dataset.progressKind === "phase" ? "天" : "篇"}`;
    });
    document.querySelectorAll("[data-article-id]").forEach((link) => link.classList.toggle("completed", completedArticles.has(link.dataset.articleId)));
    document.querySelectorAll("[data-day-card]").forEach((card) => {
      const day = Number(card.dataset.dayCard);
      const done = completedDays.has(day);
      const button = card.querySelector(".day-toggle");
      card.classList.toggle("done", done);
      button.setAttribute("aria-pressed", String(done));
      button.setAttribute("aria-label", `标记第 ${day} 天${done ? "未完成" : "完成"}`);
      button.querySelector(".day-check").textContent = done ? "✓" : "";
    });
    const planProgress = document.querySelector("#plan-progress");
    if (planProgress) planProgress.textContent = `已完成 ${completedDays.size} / 30`;
    const articleDone = currentArticle && completedArticles.has(currentArticle.id);
    completeButton.hidden = !currentArticle;
    completeButton.classList.toggle("done", !!articleDone);
    completeButton.setAttribute("aria-pressed", String(!!articleDone));
    completeButton.setAttribute("aria-label", articleDone ? "重新学习：取消学完标记" : "我学完了：标记这篇文章");
    completeButton.querySelector(".complete-fab-icon").textContent = articleDone ? "↺" : "✓";
    completeButton.querySelector(".complete-fab-label").textContent = articleDone ? "重新学习" : "我学完了";
  }
  function setCompleted(kind, id, done) {
    const target = kind === "article" ? completedArticles : completedDays;
    done ? target.add(id) : target.delete(id);
    saveProgress();
    updateProgressUI();
    if (isShared) {
      pendingOps.push({ kind, id, completed: done });
      storage.set("agent-kb-pending-ops", pendingOps);
      syncProgress();
    }
  }
  async function postProgress(payload) {
    const response = await fetch(apiUrl("progress"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`进度同步失败：HTTP ${response.status}`);
    return response.json();
  }
  async function syncProgress() {
    if (!isShared || !data) return;
    if (progressSyncPromise) return progressSyncPromise;
    progressSyncPromise = (async () => {
      if (!storage.get("agent-kb-shared-imported", false)) {
        await postProgress({ import: { articles: [...completedArticles], days: [...completedDays] } });
        storage.set("agent-kb-shared-imported", true);
      }
      while (pendingOps.length) {
        await postProgress(pendingOps[0]);
        pendingOps.shift();
        storage.set("agent-kb-pending-ops", pendingOps);
      }
      const response = await fetch(apiUrl("progress"), { cache: "no-store" });
      if (!response.ok) throw new Error(`进度读取失败：HTTP ${response.status}`);
      const state = await response.json();
      completedArticles = new Set(state.articles.filter((id) => byId.has(id)));
      completedDays = new Set(state.days.filter((day) => Number.isInteger(day) && day >= 1 && day <= 30));
      for (const op of pendingOps) {
        const target = op.kind === "article" ? completedArticles : completedDays;
        op.completed ? target.add(op.id) : target.delete(op.id);
      }
      syncState = "synced";
      saveProgress();
      updateProgressUI();
    })().catch(() => { syncState = "offline"; updateProgressUI(); }).finally(() => {
      progressSyncPromise = null;
      if (syncState === "synced" && pendingOps.length) setTimeout(syncProgress, 0);
    });
    return progressSyncPromise;
  }
  function route() {
    const article = location.hash.match(/^#\/article\/([^/?#]+)/);
    if (article) return { page: "article", id: decodeURIComponent(article[1]) };
    const section = location.hash.match(/^#\/section\/([^/?#]+)/);
    return section ? { page: "section", id: decodeURIComponent(section[1]) } : { page: "home" };
  }

  function closeMenu() {
    document.body.classList.remove("menu-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "打开目录");
  }

  function chapterArticleIds(chapter) {
    return [...(chapter.articles || []), ...(chapter.sections || []).flatMap((section) => section.articles)];
  }

  function sidebarArticleLink(id, current) {
    const article = byId.get(id);
    const active = current.page === "article" && id === current.id;
    return `<a href="${articleHref(id)}" data-article-id="${escapeHtml(id)}" class="${active ? "active" : ""} ${completedArticles.has(id) ? "completed" : ""}" ${active ? 'aria-current="page"' : ""}>${escapeHtml(article.title)}</a>`;
  }

  function sectionArticleLink(id) {
    const article = byId.get(id);
    return `<a href="${articleHref(id)}" data-article-id="${escapeHtml(id)}" class="${completedArticles.has(id) ? "completed" : ""}"><span><strong>${escapeHtml(article.title)}</strong><small>${escapeHtml(article.description)}</small></span><span class="section-article-arrow" aria-hidden="true">→</span></a>`;
  }

  function renderNavigation(current) {
    const active = current.page === "article" ? byId.get(current.id) : null;
    const group = current.page === "section" ? groupById.get(current.id) : groupById.get(active?.group);
    const sidebarShell = document.querySelector("#sidebar");
    const previousGroup = sidebarShell.dataset.group;
    const previousScroll = sidebarShell.scrollTop;
    document.querySelector("#topnav").innerHTML = data.groups.map((group) => {
      return `<a href="${sectionHref(group.id)}" class="${group.id === (active?.group || current.id) && current.page !== "home" ? "active" : ""}">${escapeHtml(group.short)}</a>`;
    }).join("");
    if (!group) {
      sidebar.innerHTML = `<a class="sidebar-home active" href="#/" aria-current="page"><span>学习首页</span><span aria-hidden="true">⌂</span></a>
        ${progressCard("all", "整站学习进度")}
        <p class="nav-label">学习栏目</p>
        <nav class="section-nav" aria-label="学习栏目">${data.groups.map((item, index) => `<a href="${sectionHref(item.id)}"><span class="section-nav-index">${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(item.title)}</span><span class="section-nav-arrow" aria-hidden="true">→</span></a>`).join("")}</nav>
        <div class="sidebar-meta">${data.articles.length} 篇中文学习文章<br>更新于 ${escapeHtml(data.meta.updated)}</div>`;
      sidebarShell.dataset.group = "";
      sidebarShell.scrollTop = 0;
      return;
    }
    const count = group.chapters.reduce((total, chapter) => total + chapterArticleIds(chapter).length, 0);
    sidebar.innerHTML = `<a class="sidebar-home" href="#/"><span>全部栏目</span><span aria-hidden="true">←</span></a>
      <a class="nav-section-title ${current.page === "section" ? "active" : ""}" href="${sectionHref(group.id)}" ${current.page === "section" ? 'aria-current="page"' : ""}><span>${escapeHtml(group.title)}</span><span aria-hidden="true">⌂</span></a>
      <div class="sidebar-progress-stack">${progressCard("all", "整站学习进度")}${progressCard("group", `${group.title}进度`, group.id)}</div>
      <nav class="chapter-nav" aria-label="${escapeHtml(group.title)}目录">${group.chapters.map((chapter, chapterIndex) => `<section class="nav-chapter"><h2><span>${String(chapterIndex + 1).padStart(2, "0")}</span>${escapeHtml(chapter.title)}</h2>${(chapter.articles || []).map((id) => sidebarArticleLink(id, current)).join("")}${(chapter.sections || []).map((section, sectionIndex) => `<details class="nav-subsection" ${section.articles.includes(current.id) || (current.page === "section" && chapterIndex === 0 && sectionIndex === 0) ? "open" : ""}><summary><span>${escapeHtml(section.title)}</span><small>${section.articles.length}</small></summary><div>${section.articles.map((id) => sidebarArticleLink(id, current)).join("")}</div></details>`).join("")}</section>`).join("")}</nav>
      <div class="sidebar-meta">${count} 篇文章 · ${group.chapters.length} 个章节<br>更新于 ${escapeHtml(data.meta.updated)}</div>`;
    sidebarShell.dataset.group = group.id;
    sidebarShell.scrollTop = previousGroup === group.id ? previousScroll : 0;
  }

  function renderSection(group) {
    currentArticle = null;
    document.title = `${group.title} · ${data.meta.title}`;
    const count = group.chapters.reduce((total, chapter) => total + chapterArticleIds(chapter).length, 0);
    const groupIndex = data.groups.findIndex((item) => item.id === group.id);
    const nextGroup = data.groups[groupIndex + 1];
    main.innerHTML = `<div class="section-page">
      <div class="section-page-intro"><p class="eyebrow">学习栏目 ${String(groupIndex + 1).padStart(2, "0")} / ${String(data.groups.length).padStart(2, "0")}</p><h1>${escapeHtml(group.title)}</h1><p>${escapeHtml(group.description)}</p><div class="section-page-stats">${group.chapters.length} 个章节 · ${count} 篇完整文章 ${progressMetric("group", group.id)}</div></div>
      ${group.chapters.map((chapter, chapterIndex) => `<section class="section-chapter"><div class="section-chapter-head"><span>${String(chapterIndex + 1).padStart(2, "0")}</span><h2>${escapeHtml(chapter.title)}</h2></div>${(chapter.articles || []).length ? `<div class="section-article-list">${chapter.articles.map(sectionArticleLink).join("")}</div>` : ""}${(chapter.sections || []).map((section) => `<div class="section-subchapter"><h3>${escapeHtml(section.title)}</h3><div class="section-article-list">${section.articles.map(sectionArticleLink).join("")}</div></div>`).join("")}</section>`).join("")}
      ${nextGroup ? `<a class="next-section" href="${sectionHref(nextGroup.id)}">下一栏目 <strong>${escapeHtml(nextGroup.title)} →</strong></a>` : `<a class="next-section" href="#/">返回学习首页 <strong>查看 30 天学习清单 →</strong></a>`}
    </div>`;
    toc.innerHTML = "";
    updateProgressUI();
  }

  function renderHome() {
    currentArticle = null;
    document.title = data.meta.title;
    const phases = [...new Set(data.plan.map((item) => item.phase))];
    main.innerHTML = `<div class="home-page">
      <section class="hero"><div class="hero-kicker">2026 · AGENT ENGINEERING</div>
        <h1>从会调用模型，走到能交付 Agent 系统</h1>
        <p>一套面向 AI Agent 应用工程、Agent Infra 与 FDE 的中文学习手册。每篇文章都在本站完整展开概念、机制、操作、例子与失败处理。</p>
        <div class="hero-actions"><a class="button primary" href="${articleHref("agent-map")}">开始学习</a><a class="button" href="#/" data-scroll-to="thirty-day-plan">查看 30 天清单</a></div>
        <div class="hero-progress"><span>整站学习进度</span>${progressMetric("all")}</div>
      </section>
      <section class="home-section"><div class="section-heading"><h2>按主题深入</h2><p>先建立概念，再沿着工程实践、生产治理与面试准备逐步深入。每篇文章均可独立阅读。</p></div>
        <div class="path-grid">${data.groups.map((group, index) => {
          const count = data.articles.filter((article) => article.group === group.id).length;
          return `<a class="path-card" href="${sectionHref(group.id)}"><span class="index">${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(group.title)}</h3><p>${escapeHtml(group.description)} · ${count} 篇</p><div class="path-progress">${progressMetric("group", group.id)}</div><span class="arrow">→</span></a>`;
        }).join("")}</div>
      </section>
      <section class="home-section"><div class="signal-panel"><div class="signal-copy"><h3>把学习建立在一个真实项目上</h3><p>从最小 Agent Loop 开始，逐步加入工具、状态、权限、恢复、评测与发布。每个阶段都保留可运行产物与失败证据。</p></div><div class="signal-list"><ul><li>概念能讲清，也能写出最小实现</li><li>失败能定位到数据、模型、工具或运行时</li><li>改进有可复现评测，而不只看演示</li><li>面试回答连接自己的项目证据</li></ul></div></div></section>
      <section class="home-section" id="thirty-day-plan"><div class="section-heading"><h2>30 天学习清单</h2><p><span id="plan-progress">已完成 ${completedDays.size} / 30</span>。${isShared ? "打卡与所有访客共享" : "打卡保存在当前浏览器"}，每天的阅读入口直接通向详细正文。</p></div>
        ${phases.map((phase, index) => `<section class="plan-phase" aria-label="第 ${index + 1} 阶段：${escapeHtml(phase)}"><div class="plan-phase-head"><span>阶段 ${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(phase)}</h3>${progressMetric("phase", phase)}<p>DAY ${String(index * 5 + 1).padStart(2, "0")}–${String((index + 1) * 5).padStart(2, "0")}</p></div>
        <div class="plan-grid">${data.plan.filter((item) => item.phase === phase).map((item) => `<article class="day-card ${completedDays.has(item.day) ? "done" : ""}" data-day-card="${item.day}">
          <button class="day-toggle" data-day="${item.day}" aria-label="标记第 ${item.day} 天${completedDays.has(item.day) ? "未完成" : "完成"}" aria-pressed="${completedDays.has(item.day)}"><span class="day-number">DAY ${String(item.day).padStart(2, "0")}</span><span class="day-check" aria-hidden="true">${completedDays.has(item.day) ? "✓" : ""}</span></button>
          <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.task)}</p><a class="day-link" href="${articleHref(item.article)}">读这篇文章 →</a>
        </article>`).join("")}</div></section>`).join("")}
      </section>
    </div>`;
    main.querySelectorAll(".day-toggle").forEach((button) => button.addEventListener("click", () => {
      const day = Number(button.dataset.day);
      setCompleted("day", day, !completedDays.has(day));
    }));
    toc.innerHTML = "";
    updateProgressUI();
  }

  function wrapEndSection(title, className) {
    const body = main.querySelector(".markdown-body");
    const heading = [...body.children].find((node) => node.tagName === "H2" && node.textContent.trim() === title);
    if (!heading) return null;
    const section = document.createElement("section");
    section.className = className;
    body.insertBefore(section, heading);
    section.appendChild(heading);
    while (section.nextSibling && section.nextSibling.nodeName !== "H2") section.appendChild(section.nextSibling);
    return section;
  }

  function prepareEndSections() {
    wrapEndSection("面试会怎么问", "interview-box");
    const section = wrapEndSection("来源与延伸阅读", "source-box");
    if (!section) return;
    section.querySelectorAll("a[href^='http']").forEach((link) => {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
  }

  function prepareDiagrams() {
    main.querySelectorAll("pre > code.language-mermaid").forEach((code) => {
      const source = code.textContent.trim();
      const figure = document.createElement("figure");
      figure.className = "markdown-diagram";
      const view = document.createElement("div");
      view.className = "diagram-view mermaid";
      view.dataset.source = source;
      view.textContent = source;
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "查看可编辑 Mermaid 源码";
      const pre = document.createElement("pre");
      const sourceCode = document.createElement("code");
      sourceCode.textContent = source;
      pre.appendChild(sourceCode);
      details.append(summary, pre);
      figure.append(view, details);
      code.parentElement.replaceWith(figure);
    });
    renderDiagrams();
  }

  function makeDiagramReadable(view) {
    const svg = view.querySelector("svg");
    const naturalWidth = Number(svg?.getAttribute("viewBox")?.split(/\s+/)[2]);
    if (!Number.isFinite(naturalWidth) || naturalWidth <= view.clientWidth) return;
    svg.style.width = `${naturalWidth}px`;
    svg.style.maxWidth = "none";
    if (/^flowchart\s+TD\b/m.test(view.dataset.source)) view.scrollLeft = Math.max(0, (naturalWidth - view.clientWidth) / 2);
    view.tabIndex = 0;
    view.setAttribute("aria-label", "可横向滚动的流程图");
    const figure = view.closest(".markdown-diagram");
    if (figure.querySelector(".diagram-toolbar")) return;
    const toolbar = document.createElement("div");
    toolbar.className = "diagram-toolbar";
    const hint = document.createElement("span");
    hint.textContent = "图表可横向滚动查看";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "缩小概览";
    toggle.addEventListener("click", () => {
      const fit = figure.classList.toggle("diagram-fit");
      toggle.textContent = fit ? "原尺寸阅读" : "缩小概览";
    });
    toolbar.append(hint, toggle);
    figure.insertBefore(toolbar, view);
  }

  async function renderDiagrams() {
    const views = [...main.querySelectorAll(".diagram-view")];
    if (!views.length) return;
    try {
      mermaidPromise ||= new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "./assets/vendor/mermaid.tiny.js";
        script.onload = () => globalThis.mermaid ? resolve(globalThis.mermaid) : reject(new Error("Mermaid 未初始化"));
        script.onerror = () => reject(new Error("Mermaid 资源无法加载"));
        document.head.appendChild(script);
      });
      const mermaid = await mermaidPromise;
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: document.documentElement.dataset.theme === "dark" ? "dark" : "default" });
      views.forEach((view) => { view.textContent = view.dataset.source; view.removeAttribute("data-processed"); });
      await mermaid.run({ nodes: views });
      views.forEach(makeDiagramReadable);
    } catch (error) {
      // 渲染失败时保留图定义，正文与表格仍可完整阅读。
      views.forEach((view) => { view.textContent = view.dataset.source; view.classList.add("diagram-fallback"); });
    }
  }

  function buildToc(article) {
    const headings = [...main.querySelectorAll(".markdown-body h2, .markdown-body h3")].filter((heading) => !heading.closest(".source-box"));
    headings.forEach((heading, index) => { if (!heading.id) heading.id = `section-${index + 1}`; });
    toc.innerHTML = headings.length ? `<strong>本页目录</strong>${headings.map((heading) => `<a href="${articleHref(article.id)}" class="level-${heading.tagName.slice(1)}" data-target="${escapeHtml(heading.id)}">${escapeHtml(heading.textContent)}</a>`).join("")}` : "";
    const lead = main.querySelector(".markdown-body > p");
    if (headings.length && lead) {
      const mobileToc = document.createElement("nav");
      mobileToc.className = "mobile-toc";
      mobileToc.setAttribute("aria-label", "本文目录");
      mobileToc.innerHTML = `<details><summary>本文目录 · ${headings.length} 节</summary>${headings.map((heading) => `<a href="${articleHref(article.id)}" class="level-${heading.tagName.slice(1)}" data-target="${escapeHtml(heading.id)}">${escapeHtml(heading.textContent)}</a>`).join("")}</details>`;
      lead.after(mobileToc);
    }
    document.querySelectorAll(".toc a[data-target], .mobile-toc a[data-target]").forEach((link) => link.addEventListener("click", (event) => {
      event.preventDefault();
      document.getElementById(link.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  function renderArticle(payload) {
    const article = payload.article;
    currentArticle = article;
    const orderedIds = data.groups.flatMap((group) => group.chapters.flatMap(chapterArticleIds));
    const index = orderedIds.indexOf(article.id);
    const previous = byId.get(orderedIds[index - 1]);
    const next = byId.get(orderedIds[index + 1]);
    document.title = `${article.title} · ${data.meta.title}`;
    main.innerHTML = `<article class="article">
      <p class="eyebrow">${escapeHtml(groupById.get(article.group).title)} · 约 ${payload.minutes} 分钟</p>
      <div class="markdown-body">${payload.html}</div>
      <footer class="article-footer">${previous ? `<a class="pager" href="${articleHref(previous.id)}">上一篇<strong>← ${escapeHtml(previous.title)}</strong></a>` : "<span></span>"}${next ? `<a class="pager next" href="${articleHref(next.id)}">下一篇<strong>${escapeHtml(next.title)} →</strong></a>` : ""}</footer>
    </article>`;
    prepareEndSections();
    prepareDiagrams();
    buildToc(article);
    updateProgressUI();
  }

  async function render() {
    if (!data) return;
    const serial = ++renderSerial;
    const current = route();
    document.body.dataset.page = current.page;
    if (current.page !== "article" || currentArticle?.id !== current.id) currentArticle = null;
    renderNavigation(current);
    updateProgressUI();
    closeMenu();
    window.scrollTo({ top: 0, behavior: "auto" });
    if (current.page === "home") return renderHome();
    if (current.page === "section") {
      const group = groupById.get(current.id);
      if (!group) { location.hash = "#/"; return; }
      return renderSection(group);
    }
    const article = byId.get(current.id);
    if (!article) { location.hash = "#/"; return; }
    main.innerHTML = `<div class="loading-state">正在加载文章……</div>`;
    toc.innerHTML = "";
    try {
      const response = await fetch(apiUrl(`article/${encodeURIComponent(article.id)}${isStatic ? ".json" : ""}`));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (serial === renderSerial) renderArticle(payload);
    } catch (error) {
      if (serial === renderSerial) main.innerHTML = `<div class="error-state"><h1>文章暂时无法加载</h1><p>Markdown 文件或服务可能尚未就绪。请刷新页面；若问题持续，检查服务日志。</p><code>${escapeHtml(error.message)}</code></div>`;
    }
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector("meta[name='theme-color']").content = theme === "dark" ? "#171b24" : "#ffffff";
    const button = document.querySelector("#theme-button");
    button.querySelector(".theme-icon").textContent = theme === "dark" ? "☾" : "☼";
    button.setAttribute("aria-label", `切换为${theme === "dark" ? "浅色" : "深色"}主题`);
    storage.set("agent-kb-theme", theme);
    if (currentArticle) renderDiagrams();
  }

  function renderSearchResults(results, query) {
    if (!results.length) {
      searchResults.innerHTML = `<div class="empty-search">没有找到“${escapeHtml(query)}”</div>`;
      return;
    }
    searchResults.innerHTML = results.map((result) => `<a class="search-result" role="option" href="${articleHref(result.id)}"><strong>${escapeHtml(result.title)}</strong><span>${escapeHtml(result.snippet || result.description)}</span></a>`).join("");
  }

  async function search(query) {
    const value = query.trim();
    if (!value) {
      renderSearchResults(data.articles.slice(0, 10).map((article) => ({ ...article, snippet: article.description })), "");
      return;
    }
    try {
      let payload;
      if (isStatic) {
        if (!staticSearchIndex) {
          const response = await fetch(apiUrl("search-index.json"));
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          staticSearchIndex = await response.json();
        }
        const needle = value.toLocaleLowerCase();
        const results = staticSearchIndex.map((item) => {
          const title = item.title.toLocaleLowerCase();
          const description = item.description.toLocaleLowerCase();
          const tags = item.tags.toLocaleLowerCase();
          const text = item.text.toLocaleLowerCase();
          const position = text.indexOf(needle);
          if (![title, description, tags].some((field) => field.includes(needle)) && position < 0) return null;
          const start = Math.max(0, position - 42);
          const end = Math.min(item.text.length, position + 76);
          return { ...item, score: (title.includes(needle) ? 8 : 0) + (tags.includes(needle) ? 4 : 0) + (description.includes(needle) ? 2 : 0), snippet: position < 0 ? item.description : `${start ? "…" : ""}${item.text.slice(start, end)}${end < item.text.length ? "…" : ""}` };
        }).filter(Boolean).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 20);
        payload = { results };
      } else {
        const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        payload = await response.json();
      }
      if (searchInput.value.trim() === value) renderSearchResults(payload.results, value);
    } catch (_) {
      searchResults.innerHTML = `<div class="empty-search">搜索服务暂不可用</div>`;
    }
  }

  function openSearch() {
    if (!dialog.open) dialog.showModal();
    searchInput.value = "";
    search("");
    setTimeout(() => searchInput.focus(), 0);
  }

  menuButton.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "关闭目录" : "打开目录");
  });
  document.querySelector("#sidebar-backdrop").addEventListener("click", closeMenu);
  document.querySelector("#search-button").addEventListener("click", openSearch);
  document.querySelector("#theme-button").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  completeButton.addEventListener("click", () => { if (currentArticle) setCompleted("article", currentArticle.id, !completedArticles.has(currentArticle.id)); });
  searchInput.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => search(searchInput.value), 180); });
  searchResults.addEventListener("click", (event) => { if (event.target.closest("a")) dialog.close(); });
  main.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-scroll-to]");
    if (trigger) { event.preventDefault(); document.getElementById(trigger.dataset.scrollTo)?.scrollIntoView({ behavior: "smooth" }); }
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearch(); }
    if (event.key === "Escape") closeMenu();
  });
  window.addEventListener("hashchange", render);

  async function boot() {
    setTheme(storage.get("agent-kb-theme", "light"));
    if (isStatic && config.githubUrl) {
      const link = document.querySelector("#github-link");
      link.href = config.githubUrl;
      link.hidden = false;
    }
    try {
      const response = await fetch(apiUrl(isStatic ? "index.json" : "index"));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
      byId = new Map(data.articles.map((article) => [article.id, article]));
      groupById = new Map(data.groups.map((group) => [group.id, group]));
      completedArticles = new Set([...completedArticles].filter((id) => byId.has(id)));
      completedDays = new Set([...completedDays].filter((day) => Number.isInteger(day) && day >= 1 && day <= 30));
      pendingOps = Array.isArray(pendingOps) ? pendingOps : [];
      render();
      if (isShared) {
        syncProgress();
        setInterval(() => { if (document.visibilityState === "visible") syncProgress(); }, 30000);
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncProgress(); });
      }
    } catch (_) {
      main.innerHTML = `<div class="error-state"><h1>请启动 Markdown 学习服务</h1><p>在 <code>context/AGENT/site</code> 目录运行 <code>python3 server.py</code>，再访问 <code>http://127.0.0.1:4173</code>。服务负责读取 Markdown、生成目录并提供全文搜索。</p></div>`;
    }
  }
  boot();
})();
