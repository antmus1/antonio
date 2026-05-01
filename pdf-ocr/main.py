from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
import fitz  # PyMuPDF
import base64
import httpx
import json
import uuid

app = FastAPI(title="PDF OCR Converter")

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "glm-ocr:latest"
OCR_PROMPT = (
    "Convert this document image to clean Markdown format. "
    "Preserve all text exactly as written. "
    "Convert tables to Markdown table syntax. "
    "Use proper heading levels (# ## ###). "
    "Preserve lists (- or numbered). "
    "For figures or charts write a brief description as: ![figura](description). "
    "Output only the Markdown content, no explanations or preamble."
)

# session_id -> raw PDF bytes (keep last 10)
pdf_sessions: dict[str, bytes] = {}


def _evict_old():
    while len(pdf_sessions) > 10:
        pdf_sessions.pop(next(iter(pdf_sessions)))


def _page_to_b64(pdf_bytes: bytes, page_num: int, dpi: float = 200) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[page_num]
    zoom = dpi / 72
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
    return base64.b64encode(pix.tobytes("png")).decode()


@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Solo file PDF sono supportati")

    content = await file.read()
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        page_count = len(doc)
    except Exception as e:
        raise HTTPException(400, f"PDF non valido: {e}")

    session_id = str(uuid.uuid4())
    pdf_sessions[session_id] = content
    _evict_old()

    return {
        "session_id": session_id,
        "page_count": page_count,
        "filename": file.filename,
        "first_page": _page_to_b64(content, 0),
    }


@app.get("/api/page/{session_id}/{page_num}")
async def get_page(session_id: str, page_num: int):
    if session_id not in pdf_sessions:
        raise HTTPException(404, "Sessione non trovata")
    pdf_bytes = pdf_sessions[session_id]
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    if not (0 <= page_num < len(doc)):
        raise HTTPException(400, "Numero pagina non valido")
    return {"image": _page_to_b64(pdf_bytes, page_num)}


@app.get("/api/ocr/{session_id}/{page_num}")
async def ocr_page(session_id: str, page_num: int):
    if session_id not in pdf_sessions:
        raise HTTPException(404, "Sessione non trovata")
    pdf_bytes = pdf_sessions[session_id]
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    if not (0 <= page_num < len(doc)):
        raise HTTPException(400, "Numero pagina non valido")

    img_b64 = _page_to_b64(pdf_bytes, page_num)

    async def stream():
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                async with client.stream(
                    "POST",
                    OLLAMA_URL,
                    json={
                        "model": MODEL_NAME,
                        "prompt": OCR_PROMPT,
                        "images": [img_b64],
                        "stream": True,
                    },
                ) as resp:
                    if resp.status_code != 200:
                        body = await resp.aread()
                        yield f"data: {json.dumps({'error': f'Ollama error {resp.status_code}: {body.decode()[:200]}'})}\n\n"
                        return
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                            yield f"data: {json.dumps({'text': chunk.get('response', ''), 'done': chunk.get('done', False)})}\n\n"
                            if chunk.get("done"):
                                break
                        except json.JSONDecodeError:
                            continue
        except httpx.ConnectError:
            yield f"data: {json.dumps({'error': 'Impossibile connettersi a Ollama su localhost:11434. Avvia Ollama con: ollama serve'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


app.mount("/", StaticFiles(directory="static", html=True), name="static")
