const { PDFDocument } = PDFLib;
const fileInput = document.getElementById("fileInput");
const fileListEl = document.getElementById("fileList");
const mergeBtn = document.getElementById("mergeBtn");
const clearBtn = document.getElementById("clearBtn");
const statusEl = document.getElementById("status");
const statusTextEl = document.querySelector(".status-text");
const fileCountText = document.getElementById("fileCountText");
const dropZone = document.getElementById("dropZone");
const addBlankBtn = document.getElementById("addBlankBtn");
const summaryBar = document.getElementById("summaryBar");
const outputNameInput = document.getElementById("outputNameInput");
const reverseOrderBtn = document.getElementById("reverseOrderBtn");
const previewBtn = document.getElementById("previewBtn");

// kind: 'file' | 'blank'
// 파일: { kind: 'file', file: File, pageCount: number|null, reversePages: boolean, pageRange?: { raw: string, indices: number[] } }
// 빈페이지: { kind: 'blank' }
let filesState = [];

previewBtn.addEventListener("click", async () => {
  if (filesState.length === 0) {
    alert("미리보기 할 PDF가 없습니다.");
    return;
  }

  try {
    setStatus("미리보기용 PDF를 생성 중입니다...", { loading: true });

    const blob = await buildMergedPdfBlob();
    const url = URL.createObjectURL(blob);

    window.open(url, "_blank"); // 브라우저 기본 PDF 뷰어로 새 탭 열기

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

// 기본 파일명 placeholder 자동 입력
(function setDefaultPlaceholder() {
  if (outputNameInput) {
    outputNameInput.placeholder = getDefaultOutputName();
  }
})();

// ✅ 요약 정보 업데이트 함수
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

// ✅ PDF 페이지 수 계산
async function getPdfPageCount(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer);
    return pdf.getPageCount();
  } catch (e) {
    console.error("페이지 수 읽기 실패:", file.name, e);
    return null;
  }
}

// "1-3,5,7-9" -> [0,1,2,4,6,7,8] (0-based)
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
      if (Number.isNaN(start) || Number.isNaN(end)) {
        return null;
      }
      const s = Math.min(start, end);
      const e = Math.max(start, end);
      for (let p = s; p <= e; p++) {
        const idx = p - 1; // 1-based -> 0-based
        if (idx >= 0 && idx < pageCount) {
          indices.add(idx);
        }
      }
    } else {
      const p = parseInt(part, 10);
      if (Number.isNaN(p)) {
        return null;
      }
      const idx = p - 1;
      if (idx >= 0 && idx < pageCount) {
        indices.add(idx);
      }
    }
  }

  if (indices.size === 0) {
    return null;
  }

  return {
    raw: cleaned,
    indices: Array.from(indices).sort((a, b) => a - b),
  };
}

// ✅ 파일 배열 추가/교체 공통 함수 (이제 kind: 'file'로 저장)
async function addFilesToState(newFiles, { append } = { append: true }) {
  const pdfFiles = Array.from(newFiles).filter(
    (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
  );

  if (pdfFiles.length === 0) return;

  const entries = [];
  for (const file of pdfFiles) {
    const pageCount = await getPdfPageCount(file);
    entries.push({
      kind: "file",
      file,
      pageCount,
      reversePages: false,
      pageRange: null,
    });
  }

  if (append) {
    filesState = filesState.concat(entries);
  } else {
    filesState = entries;
  }

  renderFileList();
  setStatus("순서를 드래그해서 조정한 후, [PDF 병합하기]를 누르세요.");
}

// 파일 크기를 사람이 읽기 좋은 형태로
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
  if (filesState.length === 0) {
    dropZone.classList.add("empty");
  } else {
    dropZone.classList.remove("empty");
  }
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
      sizeSpan.textContent = formatSize(file.size);
      pagesHint.textContent =
        item.pageCount != null ? `${item.pageCount} p` : "페이지 수 알 수 없음";

      icon.textContent = "PDF";

      // ✅ 페이지 범위 버튼
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

        if (input === null) {
          // 취소: 아무 것도 변경하지 않음
          return;
        }

        const trimmed = input.trim();
        if (!trimmed) {
          // 빈 값이면 전체 페이지 사용
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

      // ✅ 기존 reverse 버튼
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

      meta.appendChild(rangeBtn);
      meta.appendChild(reverseBtn);
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

    // ✅ 개별 삭제 버튼 생성
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "이 항목 삭제";

    // 드래그랑 안 섞이게 이벤트 막기
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      // 현재 index 기준으로 삭제
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
    if (dropMarker.parentNode) {
      dropMarker.parentNode.removeChild(dropMarker);
    }
  });
}

// 파일 선택 시 상태 갱신
fileInput.addEventListener("change", async () => {
  if (!fileInput.files || fileInput.files.length === 0) {
    filesState = [];
    renderFileList();
    setStatus("PDF 파일을 선택해 주세요.");
    return;
  }

  // ✅ 인풋으로 선택하면 기존 리스트 덮어쓰기
  await addFilesToState(fileInput.files, { append: false });
});

addBlankBtn.addEventListener("click", () => {
  // 리스트 끝에 '빈 페이지' 아이템 하나 추가
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

// ✅ 드래그 앤 드롭 업로드
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

  // ✅ 드래그&드롭은 기존 리스트에 추가
  await addFilesToState(dt.files, { append: true });

  // 같은 파일 다시 선택하는 상황 대비해서 인풋값 초기화
  fileInput.value = "";
});

// 리스트 전체에 대한 dragover: 마우스 위치 기준으로 dropIndex 계산
fileListEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (dragSrcIndex == null) return;

  const children = Array.from(fileListEl.querySelectorAll(".file-item"));
  if (children.length === 0) {
    dropIndex = 0;
    if (!dropMarker.parentNode) {
      fileListEl.appendChild(dropMarker);
    }
    return;
  }

  const y = e.clientY;
  let newIndex = children.length; // 기본은 맨 끝

  for (let i = 0; i < children.length; i++) {
    const rect = children[i].getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (y < mid) {
      newIndex = i;
      break;
    }
  }

  // 같은 위치라면 DOM 조작 안 함 → 떨림 방지
  if (dropIndex === newIndex && dropMarker.parentNode) return;

  dropIndex = newIndex;

  // 마커를 해당 위치로 이동
  if (dropMarker.parentNode) {
    dropMarker.parentNode.removeChild(dropMarker);
  }
  if (children[newIndex]) {
    fileListEl.insertBefore(dropMarker, children[newIndex]);
  } else {
    fileListEl.appendChild(dropMarker);
  }
});

// 실제 drop 시 순서 재배열
fileListEl.addEventListener("drop", (e) => {
  e.preventDefault();
  if (dragSrcIndex == null || dropIndex == null) return;

  let from = dragSrcIndex;
  let to = dropIndex;

  // 같은 위치면 아무 일도 안 하기
  if (to === from || to === from + 1) {
    dragSrcIndex = null;
    dropIndex = null;
    if (dropMarker.parentNode) {
      dropMarker.parentNode.removeChild(dropMarker);
    }
    return;
  }

  const moved = filesState[from];
  filesState.splice(from, 1);

  if (to > from) {
    to -= 1; // 앞에서 하나 빠졌으니 인덱스 보정
  }
  filesState.splice(to, 0, moved);

  renderFileList();
});

// 리스트 영역 밖으로 나갔을 때 마커 정리
fileListEl.addEventListener("dragleave", (e) => {
  // 리스트 전체 영역에서 벗어났을 때만 처리
  const rect = fileListEl.getBoundingClientRect();
  const x = e.clientX;
  const y = e.clientY;
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    if (dropMarker.parentNode) {
      dropMarker.parentNode.removeChild(dropMarker);
    }
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
    if (!baseName) {
      baseName = `merged-${stamp}`;
    }
    if (!baseName.toLowerCase().endsWith(".pdf")) {
      baseName += ".pdf";
    }

    a.download = baseName;
    a.click();
    URL.revokeObjectURL(url);

    setStatus(`병합 완료! ${baseName} 가 내려받기 되었습니다.`);
  } catch (err) {
    console.error(err);
    setStatus("병합 중 오류가 발생했습니다.", { error: true });
  }
});

// 초기 상태
setStatus("PDF 파일을 선택해 주세요.");
