/* ============================================
   Harry Sharman — site-animations.js
   Runs on every page: particle canvas + scroll-in
   ============================================ */
(function () {
  'use strict';

  // --- Fixed particle canvas (behind everything) ---
  var canvas = document.createElement('canvas');
  canvas.id = 'site-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);

  var ctx   = canvas.getContext('2d');
  var COLOR = '240,160,32';
  var COUNT = 45;
  var MDIST = 95;
  var W, H, pts = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function Pt() {
    this.x  = Math.random() * W;
    this.y  = Math.random() * H;
    this.vx = (Math.random() - 0.5) * 0.3;
    this.vy = (Math.random() - 0.5) * 0.3;
    this.r  = Math.random() * 1.5 + 0.4;
    this.o  = Math.random() * 0.3 + 0.06;
  }

  Pt.prototype.tick = function () {
    this.x += this.vx; this.y += this.vy;
    if (this.x < 0) this.x = W;
    if (this.x > W) this.x = 0;
    if (this.y < 0) this.y = H;
    if (this.y > H) this.y = 0;
  };

  function draw() {
    ctx.clearRect(0, 0, W, H);
    pts.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + COLOR + ',' + p.o + ')';
      ctx.fill();
    });
    for (var i = 0; i < pts.length; i++) {
      for (var j = i + 1; j < pts.length; j++) {
        var dx = pts[i].x - pts[j].x;
        var dy = pts[i].y - pts[j].y;
        var d  = Math.sqrt(dx * dx + dy * dy);
        if (d < MDIST) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = 'rgba(' + COLOR + ',' + (0.055 * (1 - d / MDIST)) + ')';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  function loop() {
    pts.forEach(function (p) { p.tick(); });
    draw();
    requestAnimationFrame(loop);
  }

  function init() {
    resize();
    pts = Array.from({ length: COUNT }, function () { return new Pt(); });
    loop();
  }

  window.addEventListener('resize', function () {
    resize();
    pts = Array.from({ length: COUNT }, function () { return new Pt(); });
  });

  init();

  // --- Scroll-in animations ---
  var scrollObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) e.target.classList.add('visible');
    });
  }, { threshold: 0.1 });

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll(
      '.section-title, .post-card, .project-card, .cv-entry, ' +
      '.about-card, .contact-item, .blog-list-item, .podcast-layout'
    ).forEach(function (el) {
      el.classList.add('animate-in');
      scrollObs.observe(el);
    });
  });

})();
