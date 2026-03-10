(() => {
  if (window.__clickSparkInitialized) return;
  window.__clickSparkInitialized = true;

  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  document.body.appendChild(canvas);

  let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  function resizeCanvas() {
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, { passive: true });

  const particles = [];
  let rafId = 0;

  function getSparkColor() {
    const rootStyles = getComputedStyle(document.documentElement);
    const c = (rootStyles.getPropertyValue('--primary-color') || '').trim();
    return c || '#4f46e5';
  }

  function spawnSpark(x, y) {
    const color = getSparkColor();
    const count = 10;
    for (let i = 0; i < count; i += 1) {
      const base = (Math.PI * 2 * i) / count;
      const jitter = (Math.random() - 0.5) * 0.35;
      const angle = base + jitter;
      const speed = 1.6 + Math.random() * 2.2;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 22 + Math.random() * 14,
        len: 5 + Math.random() * 6,
        width: 1.2 + Math.random() * 1.2,
        color
      });
    }
  }

  function drawFrame() {
    rafId = 0;
    if (!particles.length) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life += 1;
      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
        continue;
      }

      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;

      const t = 1 - p.life / p.maxLife;
      ctx.globalAlpha = t;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width * t;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * p.len, p.y - p.vy * p.len);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    rafId = window.requestAnimationFrame(drawFrame);
  }

  function ensureAnimation() {
    if (!rafId) rafId = window.requestAnimationFrame(drawFrame);
  }

  function isIgnoredTarget(target) {
    if (!target || !(target instanceof Element)) return false;
    return !!target.closest('input, textarea, select, [contenteditable="true"]');
  }

  document.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    if (isIgnoredTarget(ev.target)) return;
    spawnSpark(ev.clientX, ev.clientY);
    ensureAnimation();
  }, { passive: true });
})();

