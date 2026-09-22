FROM python:3.13-slim

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY index.html server.py ./
COPY assets ./assets
COPY docs ./docs

ENV PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8080"]
