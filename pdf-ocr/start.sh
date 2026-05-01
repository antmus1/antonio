#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if ! command -v python3 &>/dev/null; then
  echo "Python3 non trovato."
  exit 1
fi

# Create virtual environment if missing
if [ ! -d ".venv" ]; then
  echo "Creazione ambiente virtuale..."
  python3 -m venv .venv
fi

source .venv/bin/activate

echo "Installazione dipendenze..."
pip install -q -r requirements.txt

echo ""
echo "Avvio PDF OCR Converter su http://localhost:8000"
echo "Assicurati che Ollama sia in esecuzione: ollama serve"
echo ""

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
