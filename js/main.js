/* ============================================
   Harry Sharman — harrysharman.com
   Main JavaScript
   ============================================ */

(function () {
  'use strict';

  // --- Mobile Nav Toggle ---
  const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');

  if (navToggle) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });

    // Close mobile nav on link click
    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
      });
    });
  }

  // --- Utility: Format date ---
  function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  // --- Utility: Get base path ---
  function getBasePath() {
    const path = window.location.pathname;
    const lastSlash = path.lastIndexOf('/');
    return path.substring(0, lastSlash + 1);
  }

  // --- Load JSON data ---
  async function loadJSON(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to load ${url}`);
      return await resp.json();
    } catch (err) {
      console.warn('Could not load data:', err.message);
      return null;
    }
  }

  // --- Load Markdown ---
  async function loadMarkdown(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to load ${url}`);
      return await resp.text();
    } catch (err) {
      console.warn('Could not load markdown:', err.message);
      return null;
    }
  }

  // --- Render Featured Posts (index.html) ---
  async function renderFeaturedPosts() {
    const container = document.getElementById('featured-posts');
    if (!container) return;

    const posts = await loadJSON('posts/posts.json');
    if (!posts) {
      container.innerHTML = '<p class="empty-state">Posts coming soon.</p>';
      return;
    }

    const featured = posts.filter((p) => p.featured).slice(0, 3);
    if (featured.length === 0) {
      container.innerHTML = '<p class="empty-state">Posts coming soon.</p>';
      return;
    }

    container.innerHTML = featured
      .map(
        (post) => `
      <div class="post-card">
        <span class="post-card-date">${formatDate(post.date)}</span>
        <h3 class="post-card-title">
          <a href="post.html?slug=${post.slug}">${post.title}</a>
        </h3>
        <p class="post-card-excerpt">${post.excerpt}</p>
        <div class="post-card-tags">
          ${post.tags.map((t) => `<span class="tag">${t}</span>`).join('')}
        </div>
      </div>
    `
      )
      .join('');
  }

  // --- Render Blog List (blog.html) ---
  async function renderBlogList() {
    const container = document.getElementById('blog-list');
    const filtersContainer = document.getElementById('blog-filters');
    if (!container) return;

    const posts = await loadJSON('posts/posts.json');
    if (!posts) {
      container.innerHTML = '<p class="empty-state">Posts coming soon.</p>';
      return;
    }

    // Sort by date descending
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Build filter buttons
    if (filtersContainer) {
      const allTags = [...new Set(posts.flatMap((p) => p.tags))].sort();
      const filterHTML = allTags
        .map(
          (tag) =>
            `<button class="filter-btn" data-filter="${tag}">${tag}</button>`
        )
        .join('');
      filtersContainer.innerHTML =
        `<button class="filter-btn active" data-filter="all">All</button>` +
        filterHTML;

      // Filter click handlers
      filtersContainer.querySelectorAll('.filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          filtersContainer
            .querySelectorAll('.filter-btn')
            .forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');

          const filter = btn.dataset.filter;
          document.querySelectorAll('.blog-list-item').forEach((item) => {
            if (filter === 'all' || item.dataset.tags.includes(filter)) {
              item.style.display = '';
            } else {
              item.style.display = 'none';
            }
          });
        });
      });
    }

    // Render list
    container.innerHTML = posts
      .map(
        (post) => `
      <div class="blog-list-item" data-tags="${post.tags.join(',')}">
        <span class="blog-list-date">${formatDate(post.date)}</span>
        <div class="blog-list-content">
          <h3 class="blog-list-title">
            <a href="post.html?slug=${post.slug}">${post.title}</a>
          </h3>
          <p class="blog-list-excerpt">${post.excerpt}</p>
        </div>
      </div>
    `
      )
      .join('');
  }

  // --- Render Single Post (post.html) ---
  async function renderPost() {
    const headerEl = document.getElementById('post-header');
    const bodyEl = document.getElementById('post-body');
    if (!headerEl || !bodyEl) return;

    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');

    if (!slug) {
      bodyEl.innerHTML = '<p class="empty-state">Post not found.</p>';
      return;
    }

    // Load post metadata
    const posts = await loadJSON('posts/posts.json');
    const postMeta = posts ? posts.find((p) => p.slug === slug) : null;

    if (!postMeta) {
      bodyEl.innerHTML = '<p class="empty-state">Post not found.</p>';
      return;
    }

    // Update page title
    document.title = `${postMeta.title} — Harry Sharman`;

    // Render header
    headerEl.innerHTML = `
      <h1>${postMeta.title}</h1>
      <p class="post-meta">${formatDate(postMeta.date)} · ${postMeta.tags.map((t) => `<span class="tag">${t}</span>`).join(' ')}</p>
    `;

    // Load and render markdown
    const md = await loadMarkdown(`posts/${slug}.md`);
    if (md && typeof marked !== 'undefined') {
      bodyEl.innerHTML = marked.parse(md);
    } else if (md) {
      // Fallback: render as paragraphs
      bodyEl.innerHTML = md
        .split('\n\n')
        .map((p) => `<p>${p}</p>`)
        .join('');
    } else {
      bodyEl.innerHTML =
        '<p class="empty-state">Could not load post content.</p>';
    }
  }

  // --- Render Projects (index.html) ---
  async function renderProjects() {
    const container = document.getElementById('projects-grid');
    if (!container) return;

    const data = await loadJSON('data/site.json');
    if (!data || !data.projects) {
      container.innerHTML =
        '<p class="empty-state">Projects coming soon.</p>';
      return;
    }

    container.innerHTML = data.projects
      .map(
        (project) => `
      <div class="project-card">
        <span class="project-card-label">${project.status}</span>
        <h3>${project.title}</h3>
        <p>${project.description}</p>
        ${project.link ? `<a href="${project.link}" class="project-card-link">${project.linkText}</a>` : `<span class="project-card-link" style="color: var(--color-text-light)">${project.linkText}</span>`}
      </div>
    `
      )
      .join('');
  }

  // --- Render Case Studies (index.html) ---
  async function renderCaseStudies() {
    const container = document.getElementById('cases-grid');
    if (!container) return;

    const data = await loadJSON('data/site.json');
    if (!data || !data.caseStudies) {
      container.innerHTML =
        '<p class="empty-state">Case studies coming soon.</p>';
      return;
    }

    container.innerHTML = data.caseStudies
      .map(
        (cs) => `
      <div class="case-card">
        <span class="case-card-category">${cs.category}</span>
        <h3>${cs.title}</h3>
        <p>${cs.description}</p>
        <span class="case-card-result">${cs.result}</span>
      </div>
    `
      )
      .join('');
  }

  // --- Render CV (index.html) ---
  async function renderCV() {
    const container = document.getElementById('cv-timeline');
    if (!container) return;

    const data = await loadJSON('data/site.json');
    if (!data || !data.cv) return;

    container.innerHTML = data.cv
      .map(
        (entry) => `
      <div class="cv-entry">
        <span class="cv-date">${entry.period}</span>
        <div class="cv-content">
          <h3>${entry.role}</h3>
          <span class="cv-company">${entry.company}</span>
          <p>${entry.description}</p>
        </div>
      </div>
    `
      )
      .join('');
  }

  // --- Render Testimonials (index.html) ---
  async function renderTestimonials() {
    const container = document.getElementById('testimonials-grid');
    if (!container) return;

    const data = await loadJSON('data/site.json');
    if (!data || !data.testimonials) return;

    container.innerHTML = data.testimonials
      .map(
        (t) => `
      <div class="testimonial-card">
        <blockquote>"${t.quote}"</blockquote>
        <p class="testimonial-author">${t.author}</p>
        <p class="testimonial-role">${t.role}</p>
      </div>
    `
      )
      .join('');
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', () => {
    renderFeaturedPosts();
    renderBlogList();
    renderPost();
    renderProjects();
    renderCaseStudies();
    renderCV();
    renderTestimonials();
  });
})();
