/* ============================================
   Harry Sharman — main.js
   ============================================ */
(function () {
  'use strict';

  // ── Mobile Nav Toggle ──────────────────────
  var navToggle = document.getElementById('nav-toggle');
  var navLinks  = document.getElementById('nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
    });
    navLinks.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        navLinks.classList.remove('open');
      });
    });
  }

  // ── Utilities ──────────────────────────────
  function shortDate(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  function longDate(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  async function loadJSON(url) {
    try {
      var r = await fetch(url);
      if (!r.ok) throw new Error(url);
      return await r.json();
    } catch (e) { console.warn('loadJSON:', e.message); return null; }
  }

  async function loadMarkdown(url) {
    try {
      var r = await fetch(url);
      if (!r.ok) throw new Error(url);
      return await r.text();
    } catch (e) { console.warn('loadMarkdown:', e.message); return null; }
  }

  function stripFrontmatter(md) {
    if (!md || !md.startsWith('---')) return md;
    var end = md.indexOf('\n---', 3);
    if (end === -1) return md;
    return md.slice(end + 4).trim();
  }

  function addRowHover(container) {
    container.querySelectorAll('.essay-row, .blog-list-item').forEach(function (row) {
      var arrow = row.querySelector('.essay-arrow');
      if (!arrow) return;
      row.addEventListener('mouseenter', function () { arrow.textContent = '→'; });
      row.addEventListener('mouseleave', function () { arrow.textContent = '·'; });
    });
  }

  // ── renderEssayList (index.html) ───────────
  async function renderEssayList() {
    var container = document.getElementById('essay-list');
    if (!container) return;
    var posts = await loadJSON('posts/posts.json');
    if (!posts || !posts.length) {
      container.innerHTML = '<p class="empty-state">Essays coming soon.</p>';
      return;
    }
    var recent = posts.slice(0, 5);
    container.innerHTML = recent.map(function (post, i) {
      var n   = String(i + 1).padStart(2, '0');
      var cat = (post.tags && post.tags[0]) ? post.tags[0] : 'essay';
      return '<a href="post.html?slug=' + post.slug + '" class="essay-row">' +
        '<span class="essay-n">' + n + '</span>' +
        '<span class="essay-cat">' + cat + '</span>' +
        '<span class="essay-title">' + post.title + '</span>' +
        '<span class="essay-date">' + shortDate(post.date) + '</span>' +
        '<span class="essay-arrow">·</span>' +
        '</a>';
    }).join('');
    addRowHover(container);
  }

  // ── renderBlogList (blog.html) ─────────────
  async function renderBlogList() {
    var container = document.getElementById('blog-list');
    var filtersEl = document.getElementById('blog-filters');
    if (!container) return;

    var posts = await loadJSON('posts/posts.json');
    if (!posts || !posts.length) {
      container.innerHTML = '<p class="empty-state">Posts coming soon.</p>';
      return;
    }
    posts.sort(function (a, b) { return b.date > a.date ? 1 : -1; });

    // Filters
    if (filtersEl) {
      var allTags = [];
      posts.forEach(function (p) { (p.tags || []).forEach(function (t) { if (allTags.indexOf(t) === -1) allTags.push(t); }); });
      allTags.sort();
      filtersEl.innerHTML = '<button class="filter-btn active" data-filter="all">All</button>' +
        allTags.map(function (t) { return '<button class="filter-btn" data-filter="' + t + '">' + t + '</button>'; }).join('');
      filtersEl.querySelectorAll('.filter-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          filtersEl.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          var f = btn.dataset.filter;
          document.querySelectorAll('.blog-list-item').forEach(function (item) {
            item.style.display = (f === 'all' || item.dataset.tags.indexOf(f) !== -1) ? '' : 'none';
          });
        });
      });
    }

    container.innerHTML = posts.map(function (post, i) {
      var n   = String(i + 1).padStart(2, '0');
      var cat = (post.tags && post.tags[0]) ? post.tags[0] : 'essay';
      return '<a href="post.html?slug=' + post.slug + '" class="blog-list-item" data-tags="' + (post.tags || []).join(',') + '">' +
        '<span class="essay-n">' + n + '</span>' +
        '<span class="essay-cat">' + cat + '</span>' +
        '<span class="blog-list-title">' + post.title + '</span>' +
        '<span class="essay-date blog-list-date">' + shortDate(post.date) + '</span>' +
        '<span class="essay-arrow">·</span>' +
        '</a>';
    }).join('');
    addRowHover(container);
  }

  // ── renderPost (post.html) ─────────────────
  async function renderPost() {
    var headerEl = document.getElementById('post-header');
    var bodyEl   = document.getElementById('post-body');
    if (!headerEl || !bodyEl) return;

    var slug = new URLSearchParams(window.location.search).get('slug');
    if (!slug) { bodyEl.innerHTML = '<p class="empty-state">Post not found.</p>'; return; }

    var posts    = await loadJSON('posts/posts.json');
    var postMeta = posts ? posts.find(function (p) { return p.slug === slug; }) : null;
    if (!postMeta) { bodyEl.innerHTML = '<p class="empty-state">Post not found.</p>'; return; }

    document.title = postMeta.title + ' — Harry Sharman';
    headerEl.innerHTML =
      '<h1>' + postMeta.title + '</h1>' +
      '<div class="post-meta">' +
        '<span>' + longDate(postMeta.date) + '</span>' +
        (postMeta.tags || []).map(function (t) { return '<span class="tag">' + t + '</span>'; }).join('') +
      '</div>';

    var md = await loadMarkdown('posts/' + slug + '.md');
    if (md && typeof marked !== 'undefined') {
      bodyEl.innerHTML = marked.parse(stripFrontmatter(md));
    } else if (md) {
      bodyEl.innerHTML = stripFrontmatter(md).split('\n\n').map(function (p) { return '<p>' + p + '</p>'; }).join('');
    } else {
      bodyEl.innerHTML = '<p class="empty-state">Could not load post.</p>';
    }
  }

  // ── renderProjects (index.html) ────────────
  async function renderProjects() {
    var container = document.getElementById('projects-grid');
    if (!container) return;
    var data = await loadJSON('data/site.json');
    if (!data || !data.projects) {
      container.innerHTML = '<p class="empty-state">Projects coming soon.</p>';
      return;
    }
    container.innerHTML = data.projects.map(function (p) {
      var linkHtml = p.link
        ? '<a href="' + p.link + '" class="project-card-link">' + p.linkText + '</a>'
        : '<span class="project-card-link" style="opacity:0.35">' + p.linkText + '</span>';
      return '<div class="project-card">' +
        '<span class="project-card-label">' + p.status + '</span>' +
        '<h3>' + p.title + '</h3>' +
        '<p>' + p.description + '</p>' +
        linkHtml +
        '</div>';
    }).join('');
  }

  // ── Init ────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    renderEssayList();
    renderBlogList();
    renderPost();
    renderProjects();
  });
})();
