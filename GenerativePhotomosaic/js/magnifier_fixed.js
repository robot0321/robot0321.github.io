const box   = document.querySelector(".video-box");
const video = document.querySelector(".magnifiable-video");
const mag   = document.querySelector(".magnifier-fixed");
const ctx   = mag.getContext("2d");

// ===== 설정 =====
const ZOOM = 0.6;
const EXTRA_SCALE = 2.0;

// mouse가 비디오 밖일 때 동작:
// "last" = 마지막 위치 유지
// "topright" = 즉시 우상단으로 스냅
const OUTSIDE_MODE = "last"; // or "topright"

function getMagSize() {
  return parseFloat(getComputedStyle(mag).width) || 220;
}

function setCanvasSizePx(){
  const dpr = (window.devicePixelRatio || 1) * EXTRA_SCALE;
  const D = getMagSize();
  mag.width = Math.round(D * dpr);
  mag.height = Math.round(D * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}
setCanvasSizePx();
window.addEventListener("resize", setCanvasSizePx);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 마지막으로 유효했던 비디오 좌표 (pixel in video space)
let lastS = null; // {sx, sy} in [0..vw], [0..vh]

function sampleFromClient(clientX, clientY) {
  const rect = video.getBoundingClientRect();
  const inside = (
    clientX >= rect.left && clientX <= rect.right &&
    clientY >= rect.top  && clientY <= rect.bottom
  );

  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;

  if (!inside) {
    if (OUTSIDE_MODE === "topright") {
      return { sx: vw, sy: 0, inside: false };
    }
    // last 모드면 lastS가 있으면 유지, 없으면 우상단
    if (lastS) return { ...lastS, inside: false };
    return { sx: vw, sy: 0, inside: false };
  }

  const mx = clientX - rect.left;
  const my = clientY - rect.top;

  const sx = (mx / rect.width)  * vw;
  const sy = (my / rect.height) * vh;

  lastS = { sx, sy };
  return { sx, sy, inside: true };
}

function renderAtSample(sx, sy) {
  if (video.readyState < 2) return;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  const D = getMagSize();
  ctx.clearRect(0, 0, D, D);

  // 원형 확대창
  ctx.save();
  ctx.beginPath();
  ctx.arc(D/2, D/2, D/2, 0, Math.PI*2);
  ctx.clip();

  const srcW = D / ZOOM;
  const srcH = D / ZOOM;

  const srcX = clamp(sx - srcW/2, 0, vw - srcW);
  const srcY = clamp(sy - srcH/2, 0, vh - srcH);

  ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, D, D);

  ctx.restore();
}



// RAF로 계속 업데이트(비디오가 재생 중이면 프레임도 계속 변하니까)
let rafId = null;
let lastClient = { x: 0, y: 0 };

function tick() {
  const s = sampleFromClient(lastClient.x, lastClient.y);
  renderAtSample(s.sx, s.sy);
  rafId = requestAnimationFrame(tick);
}

function startLoop() {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
}

box.addEventListener("mousemove", (e) => {
  lastClient.x = e.clientX;
  lastClient.y = e.clientY;
});

// 마우스가 box 밖으로 나가면, 마지막 위치 유지(last) 또는 우상단으로 스냅
box.addEventListener("mouseleave", (e) => {
  if (OUTSIDE_MODE === "topright") {
    // client 좌표를 굳이 안 바꿔도 sampleFromClient가 우상단 리턴함
    return;
  }
  // last 모드는 lastS 유지라서 여기서 할 일 없음
});

// 초기 상태: 마우스가 한 번도 없으면 우상단을 계속 확대
video.addEventListener("loadedmetadata", startLoop);
if (video.readyState >= 1) startLoop();
