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
      return '<a href="/posts/' + post.slug + '/" class="essay-row">' +
        '<span class="essay-n">' + n + '</span>' +
        '<span class="essay-cat">' + cat + '</span>' +
        '<span class="essay-title-wrap">' +
        '<span class="essay-title">' + post.title + '</span>' +
        (post.excerpt ? '<span class="essay-excerpt">' + post.excerpt + '</span>' : '') +
      '</span>' +
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
      return '<a href="/posts/' + post.slug + '/" class="blog-list-item" data-tags="' + (post.tags || []).join(',') + '">' +
        '<span class="essay-n">' + n + '</span>' +
        '<span class="essay-cat">' + cat + '</span>' +
        '<span class="essay-title-wrap">' +
        '<span class="blog-list-title">' + post.title + '</span>' +
        (post.excerpt ? '<span class="essay-excerpt">' + post.excerpt + '</span>' : '') +
      '</span>' +
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

    renderReadNext(slug, postMeta.tags || [], posts);
  }

  // ── renderReadNext (post.html) ─────────────
  function renderReadNext(currentSlug, currentTags, posts) {
    var container = document.getElementById('read-next');
    if (!container || !posts) return;
    var others = posts.filter(function(p) { return p.slug !== currentSlug; });
    var related = others.filter(function(p) {
      return p.tags && p.tags.some(function(t) { return currentTags.indexOf(t) !== -1; });
    });
    if (related.length < 2) {
      var slugs = related.map(function(p){ return p.slug; });
      others.forEach(function(p){ if (related.length < 2 && slugs.indexOf(p.slug) === -1) related.push(p); });
    }
    var picks = related.slice(0, 2);
    if (!picks.length) return;
    container.innerHTML =
      '<div class="read-next-label">Keep reading</div>' +
      '<div class="read-next-grid">' +
      picks.map(function(p) {
        return '<a href="/posts/' + p.slug + '/" class="read-next-card">' +
          '<span class="read-next-cat">' + (p.tags && p.tags[0] ? p.tags[0] : 'essay') + '</span>' +
          '<span class="read-next-title">' + p.title + '</span>' +
          (p.excerpt ? '<span class="read-next-excerpt">' + p.excerpt + '</span>' : '') +
          '</a>';
      }).join('') +
      '</div>';
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
  // ── initPostPage (static post index.html files) ─────────────
  async function initPostPage() {
    // Only run on static post pages (has post-page body class, has article element)
    if (!document.body.classList.contains('post-page')) return;
    if (!document.querySelector('article')) return;
    // The SPA post.html uses renderPost() — skip if no slug in URL path
    var match = window.location.pathname.match(/\/posts\/([^/]+)\//);
    if (!match) return;
    var slug = match[1];

    // 1. Reading progress bar
    var bar = document.createElement('div');
    bar.id = 'reading-progress-bar';
    document.body.insertBefore(bar, document.body.firstChild);
    window.addEventListener('scroll', function () {
      var h = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      bar.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + '%';
    });

    // 2. Footer nav
    var footer = document.querySelector('.site-footer');
    if (footer && !footer.querySelector('.footer-nav')) {
      var nav = document.createElement('div');
      nav.className = 'footer-nav';
      nav.innerHTML =
        '<a href="/" class="footer-nav-link">Home</a>' +
        '<a href="/blog.html" class="footer-nav-link">Writing</a>' +
        '<a href="/#podcast" class="footer-nav-link">Podcast</a>' +
        '<a href="/#building" class="footer-nav-link">Building</a>' +
        '<a href="https://linkedin.com/in/harrysharman" target="_blank" class="footer-nav-link">LinkedIn ↗</a>';
      footer.insertBefore(nav, footer.firstChild);
    }

    // 3. Post-after: read next + email signup
    var article = document.querySelector('article');
    if (!article) return;

    var postAfter = document.createElement('div');
    postAfter.className = 'post-after container';

    // Email signup
    postAfter.innerHTML =
      '<div id="read-next"></div>' +
      '<div class="post-signup">' +
        '<strong>Enjoyed this? Get the next one.</strong>' +
        '<form name="newsletter" method="POST" data-netlify="true" class="signup-form signup-form-post">' +
          '<input type="hidden" name="form-name" value="newsletter">' +
          '<input type="email" name="email" placeholder="your@email.com" required class="signup-input">' +
          '<button type="submit" class="signup-btn">Subscribe →</button>' +
        '</form>' +
      '</div>';

    article.parentNode.insertBefore(postAfter, article.nextSibling);

    // 4. Load posts and render read-next
    var posts = await loadJSON('/posts/posts.json');
    if (!posts) return;
    var postMeta = posts.find(function (p) { return p.slug === slug; });
    var tags = postMeta ? (postMeta.tags || []) : [];
    renderReadNext(slug, tags, posts);
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderEssayList();
    renderBlogList();
    renderPost();
    renderProjects();
    initPostPage();
  });
})();
