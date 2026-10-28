FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg espeak-ng libegl1 libgles2 libgl1 curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt qrcode
COPY . .
RUN pip install --no-cache-dir -e . && python -m autoedit.assets_setup
ENV AUTOEDIT_WORK_DIR=/data
VOLUME ["/data"]
EXPOSE 8765
CMD ["autoedit", "serve", "--host", "0.0.0.0", "--port", "8765"]
