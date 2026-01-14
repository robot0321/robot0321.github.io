const video = document.querySelector(".magnifiable-video");
const mag   = document.querySelector(".video-magnifier");
const ctx   = mag.getContext("2d");

// ⭐ wrapper를 class명이 아니라 "video가 들어있는 column"으로
const wrap = video.closest(".column");

// ===== 설정 =====
const ZOOM = 0.55;
const EXTRA_SCALE = 2.0;

function getMagDiameter() {
  return parseFloat(getComputedStyle(mag).width) || 180;
}

// HiDPI + 고화질
function setCanvasSizePx() {
  const dpr = (window.devicePixelRatio || 1) * EXTRA_SCALE;
  const D = getMagDiameter();
  mag.width  = Math.round(D * dpr);
  mag.height = Math.round(D * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}
setCanvasSizePx();
window.addEventListener("resize", setCanvasSizePx);

let hovering = false;
let rafId = null;
let last = { x: 0, y: 0 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function positionMagnifier(clientX, clientY) {
  const D = getMagDiameter();
  const r = D / 2;

  const videoRect = video.getBoundingClientRect();
  const wrapRect  = wrap.getBoundingClientRect();

  // 중심은 비디오 안에만
  const cx = clamp(clientX, videoRect.left, videoRect.right);
  const cy = clamp(clientY, videoRect.top,  videoRect.bottom);

  mag.style.left = `${(cx - wrapRect.left) - r}px`;
  mag.style.top  = `${(cy - wrapRect.top)  - r}px`;
}


function renderMagnifier(clientX, clientY) {
  if (video.readyState < 2) return;

  const rect = video.getBoundingClientRect();
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  const mx = clamp(clientX - rect.left, 0, rect.width);
  const my = clamp(clientY - rect.top,  0, rect.height);

  const sx = (mx / rect.width)  * vw;
  const sy = (my / rect.height) * vh;

  const D = getMagDiameter();
  ctx.clearRect(0, 0, D, D);

  ctx.save();
  ctx.beginPath();
  ctx.arc(D/2, D/2, D/2, 0, Math.PI*2);
  ctx.clip();

  const srcW = D / ZOOM;
  const srcH = D / ZOOM;

  ctx.drawImage(
    video,
    clamp(sx - srcW/2, 0, vw - srcW),
    clamp(sy - srcH/2, 0, vh - srcH),
    srcW, srcH,
    0, 0, D, D
  );

  ctx.restore();
}

function tick() {
  if (!hovering) return;
  renderMagnifier(last.x, last.y);
  rafId = requestAnimationFrame(tick);
}

function start() {
  hovering = true;
  mag.style.display = "block";
  wrap.style.cursor = "none";
  rafId = requestAnimationFrame(tick);
}

function stop() {
  hovering = false;
  mag.style.display = "none";
  wrap.style.cursor = "";
  cancelAnimationFrame(rafId);
}

video.addEventListener("mouseenter", (e) => {
  last.x = e.clientX;
  last.y = e.clientY;
  positionMagnifier(last.x, last.y);
  start();
});

video.addEventListener("mousemove", (e) => {
  last.x = e.clientX;
  last.y = e.clientY;
  positionMagnifier(last.x, last.y);
});

video.addEventListener("mouseleave", stop);
