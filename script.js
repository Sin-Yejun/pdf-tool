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

// 파일 상태를 저장할 배열 (순서를 여기서 관리)
let filesState = [];

// 기본 파일명 placeholder 자동 입력
(function setDefaultPlaceholder() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  if (outputNameInput) {
    outputNameInput.placeholder = `merged-${stamp}`;
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
      totalPages += item.pageCount || 0;
    } else if (item.kind === "blank") {
      totalPages += 1; // 빈 페이지는 1장씩
    }
  }

  summaryBar.textContent = `현재: 파일 ${fileCount}개, 빈 페이지 ${blankCount}개, 총 ${totalPages}페이지`;
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

// ✅ 파일 배열 추가/교체 공통 함수 (이제 kind: 'file'로 저장)
async function addFilesToState(newFiles, { append } = { append: true }) {
  const pdfFiles = Array.from(newFiles).filter(
    (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
  );

  if (pdfFiles.length === 0) return;

  const entries = [];
  for (const file of pdfFiles) {
    const pageCount = await getPdfPageCount(file);
    entries.push({ kind: "file", file, pageCount });
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

    // ✅ 파일 vs 빈 페이지 분기
    if (item.kind === "file") {
      const file = item.file;

      name.textContent = file.name;
      sizeSpan.textContent = formatSize(file.size);
      pagesHint.textContent =
        item.pageCount != null ? `${item.pageCount} p` : "페이지 수 알 수 없음";

      icon.textContent = "PDF";
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

function addDragHandlers(li) {
  li.addEventListener("dragstart", (e) => {
    dragSrcIndex = Number(li.dataset.index);
    li.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", li.dataset.index);
    }
  });

  li.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
  });

  li.addEventListener("drop", (e) => {
    e.preventDefault();
    const targetIndex = Number(li.dataset.index);
    if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;

    const moved = filesState[dragSrcIndex];
    filesState.splice(dragSrcIndex, 1);
    filesState.splice(targetIndex, 0, moved);

    dragSrcIndex = null;
    renderFileList();
  });

  li.addEventListener("dragend", () => {
    li.classList.remove("dragging");
    dragSrcIndex = null;
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

mergeBtn.addEventListener("click", async () => {
  if (filesState.length === 0) {
    alert("PDF 파일을 하나 이상 선택해 주세요.");
    return;
  }

  setStatus(`PDF 병합 중... (파일 ${filesState.length}개)`, { loading: true });

  try {
    const mergedPdf = await PDFDocument.create();
    const DEFAULT_PAGE_SIZE = [595.28, 841.89];

    for (const item of filesState) {
      if (item.kind === "file") {
        const file = item.file;
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(
          pdf,
          pdf.getPageIndices()
        );
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      } else if (item.kind === "blank") {
        // 현재까지 병합된 마지막 페이지 크기와 동일한 빈 페이지 추가
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
    const blob = new Blob([mergedPdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;

    // ✅ 기본 이름: merged-YYYY-MM-DD
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

    // .pdf 확장자 없으면 자동으로 추가
    if (!baseName.toLowerCase().endsWith(".pdf")) {
      baseName += ".pdf";
    }

    a.download = baseName;
    a.click();
    URL.revokeObjectURL(url);

    setStatus(`병합 완료! ${baseName}.pdf 가 내려받기 되었습니다.`);
  } catch (err) {
    console.error(err);
    setStatus("에러가 발생했습니다. (콘솔을 확인해 주세요)", { error: true });
  }
});

// 초기 상태
setStatus("PDF 파일을 선택해 주세요.");
