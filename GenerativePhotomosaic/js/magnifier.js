const wrap = document.getElementById("wrap");
const video = document.getElementById("vid");
const mag = document.getElementById("magCanvas");
const ctx = mag.getContext("2d");

// ===== 설정 =====
const ZOOM = 1.2;
const EDGE_PAD = 12;
const CURSOR_OFFSET = 18;

// ✅ CSS에서 크기 읽기 (하드코딩 제거)
function getMagDiameter() {
  const w = parseFloat(getComputedStyle(mag).width);
  return Number.isFinite(w) ? w : 180;
}

function setCanvasSizePx() {
  const dpr = window.devicePixelRatio || 1;
  const D = getMagDiameter();
  mag.width = Math.round(D * dpr);
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
  const wrapRect = wrap.getBoundingClientRect();

  // 1) 커서(렌즈 중심)가 비디오 내부에 있도록 clamp
  const centerX = clamp(clientX, videoRect.left, videoRect.right);
  const centerY = clamp(clientY, videoRect.top,  videoRect.bottom);

  // 2) 렌즈는 중심 기준으로 배치 (렌즈 일부는 밖으로 나갈 수 있음)
  const left = (centerX - wrapRect.left) - r + CURSOR_OFFSET;
  const top  = (centerY - wrapRect.top)  - r + CURSOR_OFFSET;

  mag.style.left = `${left}px`;
  mag.style.top  = `${top}px`;
}


function renderMagnifier(clientX, clientY) {
  const D = getMagDiameter();

  // 비디오가 준비 안 됐으면 스킵
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return;
  }

  const rect = video.getBoundingClientRect();

  const mx = clamp(clientX - rect.left, 0, rect.width);
  const my = clamp(clientY - rect.top,  0, rect.height);

  const vw = video.videoWidth;
  const vh = video.videoHeight;

  const sx = (mx / rect.width)  * vw;
  const sy = (my / rect.height) * vh;

  ctx.clearRect(0, 0, D, D);

  // 원형 클립
  ctx.save();
  ctx.beginPath();
  ctx.arc(D / 2, D / 2, D / 2, 0, Math.PI * 2);
  ctx.clip();

  const srcW = D / ZOOM;
  const srcH = D / ZOOM;

  let srcX = clamp(sx - srcW / 2, 0, vw - srcW);
  let srcY = clamp(sy - srcH / 2, 0, vh - srcH);

  // ✅ 핵심: drawImage가 CORS로 실패할 수 있으니 try/catch
  try {
    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, D, D);
  } catch (e) {
    // fallback: 렌즈가 “있는지”는 보이게
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, D, D);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("Canvas blocked (CORS)", 10, D / 2);

    console.warn(
      "[Magnifier] drawImage failed. If video is cross-origin, you need CORS headers + video.crossOrigin='anonymous'.",
      e
    );
  }

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
  setCanvasSizePx();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
}

function stop() {
  hovering = false;
  mag.style.display = "none";
  cancelAnimationFrame(rafId);
  rafId = null;
}

// 이벤트를 비디오에 직접 달면 더 확실함
video.addEventListener("mouseenter", (e) => {
  last.x = e.clientX;
  last.y = e.clientY;
  positionMagnifier(last.x, last.y);

  if (video.readyState >= 1) start();
  else video.addEventListener("loadedmetadata", start, { once: true });
});

video.addEventListener("mouseleave", stop);

video.addEventListener("mousemove", (e) => {
  last.x = e.clientX;
  last.y = e.clientY;
  if (hovering) positionMagnifier(last.x, last.y);
});
