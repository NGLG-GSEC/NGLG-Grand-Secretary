FROM python:3.12-slim
WORKDIR /app
# Γραμματοσειρές με ελληνικούς χαρακτήρες για τα PDF (core/pdf.py → _pdf_fonts)
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
# PORT ορίζεται από το Google Cloud Run (8080)· αλλού 8000
CMD exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'
