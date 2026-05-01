/* ── State ── */
const state = {
  sessionId: null,
  pageCount: 0,
  currentPage: 0,
  pageCache: new Map(),   // page_num -> base64 image
  markdownPages: [],       // index = page number, value = markdown string
  isOcring: false,
  showRaw: false,
};

/* ── DOM ── */
const $ = id => document.getElementById(id);
const fileInput    = $("file-input");
const toolbar      = $("toolbar");
const dropZone     = $("drop-zone");
const splitView    = $("split-view");
const prevBtn      = $("prev-btn");
const nextBtn      = $("next-btn");
const pageLabel    = $("page-label");
const pageInfo     = $("page-info");
const filenameLabel= $("filename-label");
const ocrPageBtn   = $("ocr-page-btn");
const ocrAllBtn    = $("ocr-all-btn");
const toggleRawBtn = $("toggle-raw-btn");
const copyBtn      = $("copy-btn");
const downloadBtn  = $("download-btn");
const pageImg      = $("page-img");
const mdPreview    = $("md-preview");
const mdRaw        = $("md-raw");
const statusMsg    = $("status-msg");
const progressWrap = $("progress-wrap");
const progressBar  = $("progress-bar");
const splitter     = $("splitter");
const leftPanel    = $("left-panel");

/* ── Upload ── */
fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (file) handleFile(file);
  e.target.value = "";
});

// Drag & drop
dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file && file.type === "application/pdf") handleFile(file);
  else toast("Trascina un file PDF valido");
});

async function handleFile(file) {
  setStatus("Caricamento PDF...");
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Errore upload");
    }
    const data = await res.json();
    state.sessionId = data.session_id;
    state.pageCount = data.page_count;
    state.currentPage = 0;
    state.pageCache.clear();
    state.markdownPages = new Array(data.page_count).fill("");
    state.pageCache.set(0, data.first_page);

    filenameLabel.textContent = file.name;
    dropZone.hidden = true;
    splitView.hidden = false;
    toolbar.hidden = false;

    updatePageControls();
    renderPageImage(0);
    renderMarkdown(0);
    setStatus(`PDF caricato: ${data.page_count} pagine.`);
  } catch (e) {
    setStatus("Errore: " + e.message, true);
  }
}

/* ── Page navigation ── */
prevBtn.addEventListener("click", () => goToPage(state.currentPage - 1));
nextBtn.addEventListener("click", () => goToPage(state.currentPage + 1));

async function goToPage(n) {
  if (n < 0 || n >= state.pageCount || state.isOcring) return;
  state.currentPage = n;
  updatePageControls();
  renderPageImage(n);
  renderMarkdown(n);
}

async function renderPageImage(n) {
  if (state.pageCache.has(n)) {
    pageImg.src = "data:image/png;base64," + state.pageCache.get(n);
    return;
  }
  pageImg.src = "";
  setStatus("Caricamento pagina...");
  try {
    const res = await fetch(`/api/page/${state.sessionId}/${n}`);
    const data = await res.json();
    state.pageCache.set(n, data.image);
    if (state.currentPage === n) {
      pageImg.src = "data:image/png;base64," + data.image;
    }
    setStatus("Pronto.");
  } catch (e) {
    setStatus("Errore caricamento pagina", true);
  }
}

function updatePageControls() {
  const n = state.currentPage;
  const total = state.pageCount;
  pageLabel.textContent = `${n + 1} / ${total}`;
  pageInfo.textContent  = `Pagina ${n + 1}`;
  prevBtn.disabled = n === 0 || state.isOcring;
  nextBtn.disabled = n === total - 1 || state.isOcring;
}

/* ── OCR ── */
ocrPageBtn.addEventListener("click", () => ocrPage(state.currentPage));
ocrAllBtn.addEventListener("click", ocrAllPages);

async function ocrPage(n) {
  if (state.isOcring) return;
  state.isOcring = true;
  setOcring(true);
  updatePageControls();

  const el = $("ocr-status");
  el.textContent = "Elaborazione in corso...";

  let accumulated = "";

  try {
    await new Promise((resolve, reject) => {
      const es = new EventSource(`/api/ocr/${state.sessionId}/${n}`);
      es.onmessage = e => {
        const payload = JSON.parse(e.data);
        if (payload.error) {
          es.close();
          reject(new Error(payload.error));
          return;
        }
        accumulated += payload.text;
        state.markdownPages[n] = accumulated;
        renderMarkdown(n);
        if (payload.done) {
          es.close();
          resolve();
        }
      };
      es.onerror = () => {
        es.close();
        reject(new Error("Errore connessione SSE"));
      };
    });
    el.textContent = "Completato.";
    setStatus(`OCR completato per la pagina ${n + 1}.`);
  } catch (e) {
    setStatus("Errore OCR: " + e.message, true);
    el.textContent = "";
  } finally {
    state.isOcring = false;
    setOcring(false);
    updatePageControls();
  }
}

async function ocrAllPages() {
  if (state.isOcring) return;
  const total = state.pageCount;
  for (let i = 0; i < total; i++) {
    await goToPage(i);
    setStatus(`OCR pagina ${i + 1} di ${total}...`);
    setProgress((i / total) * 100);
    await ocrPage(i);
  }
  setProgress(100);
  setTimeout(() => setProgress(-1), 1000);
  setStatus(`OCR completato: ${total} pagine elaborate.`);
}

function setOcring(active) {
  ocrPageBtn.disabled = active;
  ocrAllBtn.disabled  = active;
}

/* ── Markdown render ── */
function renderMarkdown(n) {
  const md = state.markdownPages[n] || "";
  if (state.showRaw) {
    mdRaw.value = md;
  } else {
    if (!md) {
      mdPreview.innerHTML = '<p class="empty-state">Nessun testo ancora. Premi "OCR Pagina" per elaborare.</p>';
    } else {
      mdPreview.innerHTML = marked.parse(md);
    }
  }
}

/* ── View toggle (preview / raw) ── */
toggleRawBtn.addEventListener("click", () => {
  state.showRaw = !state.showRaw;
  if (state.showRaw) {
    mdPreview.hidden = true;
    mdRaw.hidden = false;
    toggleRawBtn.textContent = "Anteprima";
    mdRaw.value = state.markdownPages[state.currentPage] || "";
  } else {
    mdPreview.hidden = false;
    mdRaw.hidden = true;
    toggleRawBtn.textContent = "Raw";
    renderMarkdown(state.currentPage);
  }
});

/* ── Copy ── */
copyBtn.addEventListener("click", () => {
  const md = state.markdownPages[state.currentPage] || "";
  if (!md) { toast("Nessun testo da copiare"); return; }
  navigator.clipboard.writeText(md).then(() => toast("Copiato negli appunti!"));
});

/* ── Download all ── */
downloadBtn.addEventListener("click", () => {
  const combined = state.markdownPages
    .map((md, i) => `<!-- Pagina ${i + 1} -->\n\n${md}`)
    .join("\n\n---\n\n");
  if (!combined.trim()) { toast("Nessun testo da scaricare"); return; }
  const blob = new Blob([combined], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "documento.md";
  a.click();
  URL.revokeObjectURL(a.href);
});

/* ── Status / Progress ── */
function setStatus(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.style.color = isError ? "var(--danger)" : "";
}

function setProgress(pct) {
  if (pct < 0) {
    progressWrap.hidden = true;
    progressBar.style.width = "0%";
  } else {
    progressWrap.hidden = false;
    progressBar.style.width = pct + "%";
  }
}

/* ── Toast ── */
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ── Splitter drag ── */
(function initSplitter() {
  let dragging = false;
  let startX = 0;
  let startW = 0;

  splitter.addEventListener("mousedown", e => {
    dragging = true;
    startX = e.clientX;
    startW = leftPanel.getBoundingClientRect().width;
    splitter.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const container = splitView.getBoundingClientRect().width;
    const newW = Math.max(180, Math.min(startW + e.clientX - startX, container - 180 - 5));
    leftPanel.style.flex = "none";
    leftPanel.style.width = newW + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });
})();
