# Stage 1: Build WASM module using emscripten/emsdk
FROM --platform=linux/amd64 emscripten/emsdk:latest AS builder

WORKDIR /app

# Install git (no need for libssl-dev since we’re disabling OpenSSL)
RUN apt-get update && \
    apt-get install -y git && \
    rm -rf /var/lib/apt/lists/* && \
    git config --global http.sslverify false && \
    git clone --depth=1 --branch 0.12.0 https://github.com/open-quantum-safe/liboqs.git liboqs

# Build liboqs for WebAssembly without OpenSSL
RUN cd liboqs && \
    cmake -S . -B build-wasm \
          -DCMAKE_TOOLCHAIN_FILE=/emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake \
          -DCMAKE_BUILD_TYPE=Release \
          -DOQS_ALGS_ENABLED="KEM" \
          -DOQS_KEM_ALGS="Kyber768" \
          -DBUILD_SHARED_LIBS=OFF \
          -DOQS_USE_OPENSSL=OFF && \
    cmake --build build-wasm --parallel 4

# Copy and compile the wrapper with liboqs
COPY oqs-wrapper.c /app/
RUN mkdir -p /app/static && \
    emcc /app/oqs-wrapper.c /app/liboqs/build-wasm/lib/liboqs.a \
         -I /app/liboqs/build-wasm/include \
         -s EXPORTED_FUNCTIONS='["_kyber_generate_keypair", "_kyber_encapsulate", "_kyber_decapsulate", "_get_kyber_768_public_key_length", "_get_kyber_768_secret_key_length", "_get_kyber_768_shared_secret_length", "_get_kyber_768_ciphertext_length"]' \
         -s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap"]' \
         -s MODULARIZE=1 \
         -s EXPORT_NAME="OQS" \
         -o /app/static/oqs.js \
         -O3

# Stage 2: Runtime image using ubuntu:latest
FROM ubuntu:latest

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install runtime dependencies
RUN apt-get -y update && \
    apt-get install -y \
    python3 \
    python3-venv \
    python3-pip \
    ca-certificates \
    && update-ca-certificates --fresh && \
    rm -rf /var/lib/apt/lists/*

# Set up Python virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip config set global.trusted-host "pypi.org files.pythonhosted.org pypi.python.org" && \
    pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir fastapi "uvicorn[standard]" "passlib[bcrypt]"

# Copy WASM artifacts from builder stage
COPY --from=builder /app/static/oqs.js /app/static/oqs.js
COPY --from=builder /app/static/oqs.wasm /app/static/oqs.wasm

# Copy application files
COPY app.py /app/
COPY connection_manager.py /app/
COPY websocket_handler.py /app/
COPY static/ /app/static/

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "debug"]