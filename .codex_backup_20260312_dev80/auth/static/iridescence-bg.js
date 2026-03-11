(function () {
  if (window.__iridescenceBgMounted) return;
  window.__iridescenceBgMounted = true;

  const host = document.getElementById('iridescence-bg');
  if (!host) return;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl) return;

  const vertexSrc = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
      vUv = (aPosition + 1.0) * 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const fragmentSrc = `
    precision highp float;
    uniform float uTime;
    uniform vec3 uResolution;
    uniform vec3 uBaseColor;
    uniform float uAmplitude;
    uniform float uFrequencyX;
    uniform float uFrequencyY;
    uniform vec2 uMouse;
    varying vec2 vUv;

    vec4 renderImage(vec2 uvCoord) {
      vec2 fragCoord = uvCoord * uResolution.xy;
      vec2 uv = (2.0 * fragCoord - uResolution.xy) / min(uResolution.x, uResolution.y);

      for (float i = 1.0; i < 10.0; i++) {
        uv.x += uAmplitude / i * cos(i * uFrequencyX * uv.y + uTime + uMouse.x * 3.14159);
        uv.y += uAmplitude / i * cos(i * uFrequencyY * uv.x + uTime + uMouse.y * 3.14159);
      }

      vec2 diff = (uvCoord - uMouse);
      float dist = length(diff);
      float falloff = exp(-dist * 20.0);
      float ripple = sin(10.0 * dist - uTime * 2.0) * 0.03;
      uv += (diff / (dist + 0.0001)) * ripple * falloff;

      vec3 color = uBaseColor / abs(sin(uTime - uv.y - uv.x));
      return vec4(color, 1.0);
    }

    void main() {
      vec4 col = vec4(0.0);
      int samples = 0;
      for (int i = -1; i <= 1; i++) {
        for (int j = -1; j <= 1; j++) {
          vec2 offset = vec2(float(i), float(j)) * (1.0 / min(uResolution.x, uResolution.y));
          col += renderImage(vUv + offset);
          samples++;
        }
      }
      gl_FragColor = col / float(samples);
    }
  `;

  function createShader(type, source) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertexShader = createShader(gl.VERTEX_SHADER, vertexSrc);
  const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSrc);
  if (!vertexShader || !fragmentShader) return;

  const program = gl.createProgram();
  if (!program) return;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1
  ]), gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(program, 'uTime');
  const uResolution = gl.getUniformLocation(program, 'uResolution');
  const uBaseColor = gl.getUniformLocation(program, 'uBaseColor');
  const uAmplitude = gl.getUniformLocation(program, 'uAmplitude');
  const uFrequencyX = gl.getUniformLocation(program, 'uFrequencyX');
  const uFrequencyY = gl.getUniformLocation(program, 'uFrequencyY');
  const uMouse = gl.getUniformLocation(program, 'uMouse');

  let width = 0;
  let height = 0;
  let mouseX = 0.5;
  let mouseY = 0.5;
  let rafId = 0;

  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    width = Math.max(1, Math.floor(host.clientWidth * dpr));
    height = Math.max(1, Math.floor(host.clientHeight * dpr));
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = host.clientWidth + 'px';
    canvas.style.height = host.clientHeight + 'px';
    gl.viewport(0, 0, width, height);
  }

  function onPointerMove(ev) {
    const rect = host.getBoundingClientRect();
    mouseX = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
    mouseY = Math.min(1, Math.max(0, 1 - (ev.clientY - rect.top) / rect.height));
  }

  function draw(now) {
    const t = now * 0.00028;
    gl.useProgram(program);
    gl.uniform1f(uTime, t);
    gl.uniform3f(uResolution, width, height, width / Math.max(1, height));
    gl.uniform3f(uBaseColor, 0.945, 0.965, 1.0);
    gl.uniform1f(uAmplitude, 0.18);
    gl.uniform1f(uFrequencyX, 2.4);
    gl.uniform1f(uFrequencyY, 1.7);
    gl.uniform2f(uMouse, mouseX, mouseY);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    rafId = requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  rafId = requestAnimationFrame(draw);

  window.addEventListener('beforeunload', function cleanup() {
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointerMove);
  }, { once: true });
})();

