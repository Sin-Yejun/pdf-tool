const { PDFDocument } = PDFLib;
const fileInput = document.getElementById("fileInput");
const fileListEl = document.getElementById("fileList");
const mergeBtn = document.getElementById("mergeBtn");
const clearBtn = document.getElementById("clearBtn");
const statusEl = document.getElementById("status");
const statusTextEl = document.getElementById("statusText");
const fileCountText = document.getElementById("fileCountText");
const dropZone = document.getElementById("dropZone");
const addBlankBtn = document.getElementById("addBlankBtn");
const summaryBar = document.getElementById("summaryBar");
const outputNameInput = document.getElementById("outputNameInput");
const reverseOrderBtn = document.getElementById("reverseOrderBtn");
const previewBtn = document.getElementById("previewBtn");

// kind: 'file' | 'blank'
let filesState = [];
let previewUrl = null; // 미리보기용 URL 저장 변수

// ==========================================
// 1. 미리보기 버튼 수정 (중복 제거 및 메모리 해제)
// ==========================================
previewBtn.addEventListener("click", async () => {
  if (filesState.length === 0) {
    alert("미리보기 할 PDF가 없습니다.");
    return;
  }

  // 기존에 열려있던 미리보기 URL이 있다면 메모리 해제
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  try {
    setStatus("미리보기용 PDF를 생성 중입니다...", { loading: true });

    // PDF 생성
    const blob = await buildMergedPdfBlob();
    previewUrl = URL.createObjectURL(blob);

    window.open(previewUrl, "_blank"); // 새 탭 열기

    setStatus("미리보기가 새 탭에서 열렸습니다.");
  } catch (err) {
    console.error(err);
    setStatus("미리보기 생성 중 오류가 발생했습니다.", { error: true });
  }
});

reverseOrderBtn.addEventListener("click", () => {
  if (filesState.length === 0) {
    setStatus("뒤집을 항목이 없습니다.");
    return;
  }

  filesState.reverse();
  renderFileList();
  setStatus("리스트 순서를 뒤집었습니다.");
});

function getDefaultOutputName() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return `merged-${stamp}`;
}

(function setDefaultPlaceholder() {
  if (outputNameInput) {
    outputNameInput.placeholder = getDefaultOutputName();
  }
})();

function updateSummary() {
  if (!summaryBar) return;

  const fileCount = filesState.filter((i) => i.kind === "file").length;
  const blankCount = filesState.filter((i) => i.kind === "blank").length;

  let totalPages = 0;
  for (const item of filesState) {
    if (item.kind === "file") {
      if (item.pageRange && item.pageRange.indices) {
        totalPages += item.pageRange.indices.length;
      } else {
        totalPages += item.pageCount || 0;
      }
    } else if (item.kind === "blank") {
      totalPages += 1;
    }
  }
  summaryBar.textContent = `현재: 파일 ${fileCount}개, 빈 페이지 ${blankCount}개, 총 ${totalPages}페이지`;
}

async function buildMergedPdfBlob() {
  const mergedPdf = await PDFDocument.create();
  const DEFAULT_PAGE_SIZE = [595.28, 841.89];

  for (const item of filesState) {
    if (item.kind === "file") {
      const file = item.file;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);

      const allIndices = pdf.getPageIndices();

      let selectedIndices;
      if (item.pageRange && Array.isArray(item.pageRange.indices)) {
        selectedIndices = item.pageRange.indices.filter((idx) =>
          allIndices.includes(idx)
        );
      } else {
        selectedIndices = allIndices;
      }

      if (item.reversePages) {
        selectedIndices = [...selectedIndices].reverse();
      }

      if (selectedIndices.length === 0) continue;

      const copiedPages = await mergedPdf.copyPages(pdf, selectedIndices);
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    } else if (item.kind === "blank") {
      let width = DEFAULT_PAGE_SIZE[0];
      let height = DEFAULT_PAGE_SIZE[1];

      const pageCount = mergedPdf.getPageCount();
      if (pageCount > 0) {
        const lastPage = mergedPdf.getPage(pageCount - 1);
        const size = lastPage.getSize();
        width = size.width;
        height = size.height;
      }

      mergedPdf.addPage([width, height]);
    }
  }

  const mergedPdfBytes = await mergedPdf.save();
  return new Blob([mergedPdfBytes], { type: "application/pdf" });
}

// ==========================================
// 2. getPdfPageCount (암호화 예외 처리 강화)
// ==========================================
async function getPdfPageCount(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer);
    return pdf.getPageCount();
  } catch (e) {
    console.warn("PDF 로드 실패:", file.name, e.message);
    // 암호화된 파일이거나 로드 실패 시 null 반환
    return null;
  }
}

function parsePageRangeInput(input, pageCount) {
  if (!input) return null;

  const cleaned = input.replace(/\s+/g, "");
  if (!cleaned) return null;

  const parts = cleaned.split(",");
  const indices = new Set();

  for (const part of parts) {
    if (!part) continue;
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (Number.isNaN(start) || Number.isNaN(end)) return null;
      const s = Math.min(start, end);
      const e = Math.max(start, end);
      for (let p = s; p <= e; p++) {
        const idx = p - 1;
        if (idx >= 0 && idx < pageCount) indices.add(idx);
      }
    } else {
      const p = parseInt(part, 10);
      if (Number.isNaN(p)) return null;
      const idx = p - 1;
      if (idx >= 0 && idx < pageCount) indices.add(idx);
    }
  }

  if (indices.size === 0) return null;

  return {
    raw: cleaned,
    indices: Array.from(indices).sort((a, b) => a - b),
  };
}

function formatRawFromIndices(indices) {
  return indices.map((i) => i + 1).join(",");
}

function indicesToRangeString(indices) {
  if (!indices || indices.length === 0) return "";
  const sorted = [...indices].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    ranges.push([start, prev]);
    start = prev = cur;
  }
  ranges.push([start, prev]);

  return ranges
    .map(([s, e]) => (s === e ? `${s + 1}` : `${s + 1}-${e + 1}`))
    .join(",");
}

function buildPageRangeFromIndices(indices) {
  const sorted = [...indices].sort((a, b) => a - b);
  return {
    raw: indicesToRangeString(sorted),
    indices: sorted,
  };
}

function getEffectivePageSequence(item) {
  const totalIndices = Array.from({ length: item.pageCount || 0 }, (_, i) => i);
  let seq = item.pageRange?.indices ? item.pageRange.indices : totalIndices;
  if (item.reversePages) {
    seq = [...seq].reverse();
  }
  return seq;
}

function splitFileItem(index) {
  const target = filesState[index];
  if (!target || target.kind !== "file") return;

  if (target.pageCount == null || target.pageCount < 2) {
    alert("2쪽 미만 PDF는 분리할 수 없습니다.");
    return;
  }

  const effectivePages = getEffectivePageSequence(target);
  if (effectivePages.length < 2) {
    alert("선택된 페이지가 2쪽 미만이라 분리할 수 없습니다.");
    return;
  }

  const defaultSplit = Math.floor(effectivePages.length / 2);
  const input = window.prompt(
    `몇 페이지 이후로 나눌까요? (1~${effectivePages.length - 1})\n현재 적용된 순서/범위 기준입니다.`,
    String(defaultSplit)
  );
  if (input === null) return;

  const splitAfter = parseInt(input.trim(), 10);
  if (
    Number.isNaN(splitAfter) ||
    splitAfter < 1 ||
    splitAfter >= effectivePages.length
  ) {
    alert("입력값이 올바르지 않습니다. 1과 마지막 페이지 사이 숫자를 입력해주세요.");
    return;
  }

  const firstIndices = effectivePages.slice(0, splitAfter);
  const secondIndices = effectivePages.slice(splitAfter);

  const base = {
    kind: "file",
    file: target.file,
    pageCount: target.pageCount,
    reversePages: false,
  };

  const first = {
    ...base,
    pageRange: buildPageRangeFromIndices(firstIndices),
  };
  const second = {
    ...base,
    pageRange: buildPageRangeFromIndices(secondIndices),
  };

  filesState.splice(index, 1, first, second);
  renderFileList();
  setStatus(
    `"${target.file.name}"을(를) ${splitAfter}쪽 기준으로 두 개로 분리했습니다.`
  );
}

function getDisplayPageCount(item) {
  if (item.pageRange?.indices) return item.pageRange.indices.length;
  return item.pageCount || 0;
}

function getDisplaySize(item) {
  if (item.pageRange?.indices && item.pageCount) {
    const ratio = item.pageRange.indices.length / item.pageCount;
    return Math.max(1, Math.round(item.file.size * ratio));
  }
  return item.file.size;
}

// ==========================================
// 3. addFilesToState (누락된 루프 및 변수 복구)
// ==========================================
async function addFilesToState(newFiles, { append } = { append: true }) {
  // PDF 파일만 필터링
  const pdfFiles = Array.from(newFiles).filter(
    (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
  );

  if (pdfFiles.length === 0) return;

  const entries = [];

  // 파일 하나씩 순회하며 검증
  for (const file of pdfFiles) {
    try {
      // 페이지 수 체크 (여기서 암호화/손상 여부 1차 확인)
      const pageCount = await getPdfPageCount(file);

      // pageCount가 null이면 로드 실패로 간주하고 에러 throw
      if (pageCount === null) {
        throw new Error("LoadFailed");
      }

      entries.push({
        kind: "file",
        file,
        pageCount,
        reversePages: false,
        pageRange: null,
      });
    } catch (e) {
      console.error(e);
      alert(
        `[${file.name}] 파일을 불러올 수 없습니다.\n비밀번호가 걸려있거나 손상된 파일일 수 있습니다.`
      );
      // 이 파일은 건너뛰고 다음 파일 진행
      continue;
    }
  }

  if (append) {
    filesState = filesState.concat(entries);
  } else {
    filesState = entries;
  }

  renderFileList();
  setStatus("순서를 드래그해서 조정한 후, [PDF 병합하기]를 누르세요.");
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = bytes === 0 ? 0 : Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return value.toFixed(value >= 10 || i === 0 ? 0 : 1) + " " + sizes[i];
}

function setStatus(text, options = {}) {
  statusTextEl.textContent = text;
  statusEl.classList.remove("loading", "error");
  if (options.loading) statusEl.classList.add("loading");
  if (options.error) statusEl.classList.add("error");
}

function updateFileCount() {
  fileCountText.textContent = `파일 ${filesState.length}개 선택됨`;
}

function renderFileList() {
  fileListEl.innerHTML = "";
  
  // 1. 리스트가 비었는지 여부에 따라 스타일 클래스 토글
  if (filesState.length === 0) {
    dropZone.classList.add("empty");
  } else {
    dropZone.classList.remove("empty");
  }

  // 2. 리스트 아이템 렌더링
  filesState.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "file-item";
    li.draggable = true;
    li.dataset.index = String(index);

    const main = document.createElement("div");
    main.className = "file-main";

    const indexBadge = document.createElement("div");
    indexBadge.className = "file-index";
    indexBadge.textContent = index + 1;

    const icon = document.createElement("div");
    icon.className = "file-icon";

    const nameWrap = document.createElement("div");
    const name = document.createElement("div");
    name.className = "file-name";

    const sub = document.createElement("span");
    sub.className = "file-sub";

    const meta = document.createElement("div");
    meta.className = "file-meta";

    const sizeSpan = document.createElement("span");
    const dot = document.createElement("span");
    dot.className = "dot-sep";
    const pagesHint = document.createElement("span");

    if (item.kind === "file") {
      const file = item.file;

      name.textContent = file.name;
      const displaySize = getDisplaySize(item);
      const displayPages = getDisplayPageCount(item);
      sizeSpan.textContent = formatSize(displaySize);
      pagesHint.textContent =
        displayPages != null ? `${displayPages} p` : "페이지 정보를 불러오는 중";

      icon.textContent = "PDF";

      // 페이지 범위 버튼
      const rangeBtn = document.createElement("button");
      rangeBtn.type = "button";
      rangeBtn.className = "page-range-btn";
      rangeBtn.textContent = item.pageRange
        ? `범위: ${item.pageRange.raw}`
        : "범위: 전체";
      rangeBtn.title = "병합에 포함할 페이지 범위를 설정합니다. 예: 1-3,5,7-9";

      rangeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();

        if (item.pageCount == null) {
          alert("페이지 수 정보를 알 수 없어 범위를 설정할 수 없습니다.");
          return;
        }

        const current = item.pageRange ? item.pageRange.raw : "";
        const input = window.prompt(
          `포함할 페이지를 입력하세요 (1~${item.pageCount} 범위)\n예: 1-3,5,7-9\n빈 값 또는 취소: 전체 페이지 사용`,
          current
        );

        if (input === null) return;

        const trimmed = input.trim();
        if (!trimmed) {
          item.pageRange = null;
          renderFileList();
          setStatus("페이지 범위를 초기화했습니다. 전체 페이지가 포함됩니다.");
          return;
        }

        const parsed = parsePageRangeInput(trimmed, item.pageCount);
        if (!parsed) {
          alert("입력 형식이 잘못되었습니다. 예: 1-3,5,7-9");
          return;
        }

        item.pageRange = parsed;
        renderFileList();
        setStatus(`페이지 범위를 "${parsed.raw}"로 설정했습니다.`);
      });

      // 역순 버튼
      const reverseBtn = document.createElement("button");
      reverseBtn.type = "button";
      reverseBtn.className = "reverse-pages-btn";
      reverseBtn.textContent = item.reversePages ? "↺ 역순 ON" : "↻ 역순 OFF";
      reverseBtn.title = "이 파일의 페이지 순서를 뒤집어서 병합";

      reverseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        item.reversePages = !item.reversePages;
        renderFileList();
      });

      const splitBtn = document.createElement("button");
      splitBtn.type = "button";
      splitBtn.className = "split-btn";
      splitBtn.textContent = "분리";
      splitBtn.title =
        "현재 적용된 순서/범위를 기준으로 이 파일을 두 개로 나눕니다.";
      splitBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        splitFileItem(index);
      });

      meta.appendChild(rangeBtn);
      meta.appendChild(reverseBtn);
      meta.appendChild(splitBtn);
    } else if (item.kind === "blank") {
      li.classList.add("blank");
      icon.classList.add("blank");
      name.classList.add("blank");

      name.textContent = "빈 페이지";
      sub.textContent = "병합 시 1페이지 추가";
      sizeSpan.textContent = "—";
      pagesHint.textContent = "1 p";

      icon.textContent = "BLK";
    }

    nameWrap.appendChild(name);
    nameWrap.appendChild(sub);
    main.appendChild(indexBadge);
    main.appendChild(icon);
    main.appendChild(nameWrap);

    // 삭제 버튼
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "이 항목 삭제";

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      filesState.splice(index, 1);
      renderFileList();
      setStatus("항목을 삭제했습니다.");
    });

    meta.appendChild(sizeSpan);
    meta.appendChild(dot);
    meta.appendChild(pagesHint);
    meta.appendChild(deleteBtn);

    li.appendChild(main);
    li.appendChild(meta);

    addDragHandlers(li);
    fileListEl.appendChild(li);
  });

  // ==========================================
  // ✨ 3. 워딩 변경 로직 (여기가 핵심입니다!)
  // ==========================================
  const dropZoneTextEl = document.getElementById("dropZoneText");
  const dropZoneSubEl = document.getElementById("dropZoneSub");
  const sectionTitleText = document.getElementById("sectionTitleText");

  if (filesState.length === 0) {
    // 📂 파일이 하나도 없을 때
    if (sectionTitleText) sectionTitleText.textContent = "파일 선택"; // 제목 변경
    
    if (dropZoneTextEl)
      dropZoneTextEl.innerHTML = `여기로 PDF 파일을 <b>드래그해서 놓기</b>`;
    if (dropZoneSubEl)
      dropZoneSubEl.innerHTML = `또는 <b>여기 클릭</b>하여 파일 선택`;
  
  } else {
    // ➕ 파일이 하나라도 있을 때
    if (sectionTitleText) sectionTitleText.textContent = "파일 추가"; // 제목 변경
    
    if (dropZoneTextEl)
      dropZoneTextEl.innerHTML = `여기로 PDF 파일을 <b>드래그해서 추가</b>`;
    if (dropZoneSubEl)
      dropZoneSubEl.innerHTML = `또는 <b>여기 클릭</b>하여 파일 추가`;
  }

  updateFileCount();
  updateSummary();
}

// 드래그 앤 드롭 로직
let dragSrcIndex = null;
let dropIndex = null;
const dropMarker = document.createElement("div");
dropMarker.className = "drop-marker";

function addDragHandlers(li) {
  li.addEventListener("dragstart", (e) => {
    dragSrcIndex = Number(li.dataset.index);
    dropIndex = null;
    li.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", li.dataset.index);
    }
  });

  li.addEventListener("dragend", () => {
    li.classList.remove("dragging");
    dragSrcIndex = dropIndex = null;
    if (dropMarker.parentNode) dropMarker.parentNode.removeChild(dropMarker);
  });
}

fileInput.addEventListener("change", async () => {
  if (!fileInput.files || fileInput.files.length === 0) return;
  await addFilesToState(fileInput.files, { append: true });
  fileInput.value = "";
});

addBlankBtn.addEventListener("click", () => {
  filesState.push({ kind: "blank" });
  renderFileList();
  setStatus("빈 페이지를 추가했습니다. 드래그해서 원하는 위치로 옮기세요.");
});

clearBtn.addEventListener("click", () => {
  filesState = [];
  fileInput.value = "";
  renderFileList();
  setStatus("리스트를 비웠습니다. 새로운 PDF 파일을 선택해 주세요.");
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add("drag-over");
  });
});

["dragleave", "dragend"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("drag-over");
  });
});

dropZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove("drag-over");
  const dt = e.dataTransfer;
  if (!dt || !dt.files || dt.files.length === 0) return;
  await addFilesToState(dt.files, { append: true });
  fileInput.value = "";
});

// ✅ dropZone 클릭 시 파일 선택창 열기 (수정됨)
dropZone.addEventListener("click", (e) => {
  // 1. 이미 리스트에 있는 파일 아이템(또는 삭제버튼 등)을 클릭했다면 무시
  // (파일을 드래그하거나 삭제하려고 클릭했을 때 파일 창이 뜨면 안 되니까요)
  if (e.target.closest(".file-item")) {
    return;
  }

  // 2. 빈 공간을 클릭했을 때만 숨겨둔 fileInput을 대신 클릭해줌
  fileInput.click();
});

fileListEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (dragSrcIndex == null) return;

  const children = Array.from(fileListEl.querySelectorAll(".file-item"));
  if (children.length === 0) {
    dropIndex = 0;
    if (!dropMarker.parentNode) fileListEl.appendChild(dropMarker);
    return;
  }

  const y = e.clientY;
  let newIndex = children.length;
  for (let i = 0; i < children.length; i++) {
    const rect = children[i].getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (y < mid) {
      newIndex = i;
      break;
    }
  }

  if (dropIndex === newIndex && dropMarker.parentNode) return;
  dropIndex = newIndex;
  if (dropMarker.parentNode) dropMarker.parentNode.removeChild(dropMarker);
  if (children[newIndex])
    fileListEl.insertBefore(dropMarker, children[newIndex]);
  else fileListEl.appendChild(dropMarker);
});

fileListEl.addEventListener("drop", (e) => {
  e.preventDefault();
  if (dragSrcIndex == null || dropIndex == null) return;
  let from = dragSrcIndex;
  let to = dropIndex;
  if (to === from || to === from + 1) {
    dragSrcIndex = null;
    dropIndex = null;
    if (dropMarker.parentNode) dropMarker.parentNode.removeChild(dropMarker);
    return;
  }
  const moved = filesState[from];
  filesState.splice(from, 1);
  if (to > from) to -= 1;
  filesState.splice(to, 0, moved);
  renderFileList();
});

fileListEl.addEventListener("dragleave", (e) => {
  const rect = fileListEl.getBoundingClientRect();
  const x = e.clientX;
  const y = e.clientY;
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    if (dropMarker.parentNode) dropMarker.parentNode.removeChild(dropMarker);
    dropIndex = null;
  }
});

mergeBtn.addEventListener("click", async () => {
  if (filesState.length === 0) {
    alert("병합할 PDF 또는 빈 페이지가 없습니다.");
    return;
  }

  try {
    setStatus("PDF 병합 중입니다...", { loading: true });

    const blob = await buildMergedPdfBlob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;

    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");

    let baseName = (outputNameInput?.value || "").trim();
    if (!baseName) baseName = `merged-${stamp}`;
    if (!baseName.toLowerCase().endsWith(".pdf")) baseName += ".pdf";

    a.download = baseName;
    a.click();
    URL.revokeObjectURL(url);

    setStatus(`병합 완료! ${baseName} 가 내려받기 되었습니다.`);
  } catch (err) {
    console.error(err);
    setStatus("병합 중 오류가 발생했습니다.", { error: true });
  }
});

const themeToggleBtn = document.getElementById("themeToggleBtn");
const savedTheme = localStorage.getItem("pdfToolTheme");
if (savedTheme === "light") {
  document.documentElement.classList.add("light");
  themeToggleBtn.textContent = "☀️ 라이트 모드";
} else {
  themeToggleBtn.textContent = "🌙 다크 모드";
}

themeToggleBtn.addEventListener("click", () => {
  const html = document.documentElement;
  if (html.classList.contains("light")) {
    html.classList.remove("light");
    themeToggleBtn.textContent = "🌙 다크 모드";
    localStorage.setItem("pdfToolTheme", "dark");
  } else {
    html.classList.add("light");
    themeToggleBtn.textContent = "☀️ 라이트 모드";
    localStorage.setItem("pdfToolTheme", "light");
  }
});

// ✅ 섹션 제목("📂 파일 선택/추가")을 클릭해도 파일 창이 열리도록 설정
const sectionTitleEl = document.querySelector(".section-title");
if (sectionTitleEl) {
  sectionTitleEl.addEventListener("click", () => {
    // 파일이 하나도 없거나, 클릭이 드래그 중이 아닐 때만 실행
    if (filesState.length === 0 || !document.querySelector('.dragging')) {
      fileInput.click();
    }
  });
}

setStatus("PDF 파일을 선택해 주세요.");
renderFileList();
