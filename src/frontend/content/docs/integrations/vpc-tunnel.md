---
title: VPC & Tunnel Settings
description: Secure Cloudflare Workers VPC Service connection to local FastAPI bridge via Cloudflare Tunnel.
date_last_updated: "2026-05-24"
---

# Workers VPC & Cloudflare Tunnel Configuration

To bypass external edge bot detection and prevent 1-hour cookie expirations during active NotebookLM requests, the Career Orchestrator routes requests through a local **FastAPI bridge** (`scripts/notebooklm_fastapi_server.py`) running in the host user session.

This local service is securely connected to the Cloudflare Worker using a private **Cloudflare Workers VPC Service** and an outbound **Cloudflare Tunnel** (`cloudflared`).

---

## 1. Architecture Overview

A private database or service inside a local environment is connected directly to the Cloudflare Worker via the following pipeline:

```mermaid
flowchart LR
    A[Cloudflare Worker] -->|VPC_SERVICE Binding| B[Workers VPC Service]
    B -->|macoffice Tunnel| C[Cloudflare Tunnel daemon]
    C -->|Local Loopback| D[FastAPI Bridge: Port 8770]
```

This isolates the bridge from the public internet entirely, utilizing a secure outbound TLS connection from your host machine (`cloudflared`) and linking it to the Worker's runtime environment.

---

## 2. Live Connection Diagnostics

Use the status card below to check the real-time status of your VPC and Cloudflare Tunnel connection. Clicking **Test Connection** triggers an end-to-end active probe check from the Cloudflare edge to your local loopback FastAPI health port.

---

## 3. Network Configuration Reference

Below are the exact settings configured in the Cloudflare Dashboard for the `macoffice-chrome` VPC Service.

### A. Service Configuration
* **Service Name:** `macoffice-chrome`
* **Service ID:** `019df0c3-7091-7613-895a-dd8995045be5`
* **Service Type:** `HTTP`
* **Created:** May 3, 2026
* **Last Updated:** May 3, 2026

### B. Host Configuration
* **Private IP / Host Address:** `127.0.0.1` (Points to localhost on the host machine running the tunnel connector)
* **Associated Tunnel:** `macoffice`
* **Tunnel Status:** `Healthy`

### C. Port Configuration
* **Exposed Ports:** `HTTP: 8770`

### D. TLS Settings
* **Certificate Verification Mode:** `Full verification`

---

## 4. Setting Up the Host Connection

Follow these step-by-step instructions to initialize and run the tunnel locally on your host macOS system.

### Step 1: Install and Authenticate cloudflared
Ensure that `cloudflared` is installed on your host system:
```bash
# Install via Homebrew
brew install cloudflared

# Authenticate cloudflared with your Cloudflare account
cloudflared tunnel login
```

### Step 2: Establish the Tunnel
Start the tunnel daemon targeting the `macoffice` connection:
```bash
# Start the tunnel daemon to bind port 8770 to localhost
cloudflared tunnel run macoffice
```
Verify that the tunnel status appears as **Healthy** in the Cloudflare Dashboard under **Zero Trust** -> **Networks** -> **Tunnels**.

### Step 3: Run the FastAPI Bridge Server
Run the local background server script to capture incoming prompts and relay them to NotebookLM securely using local session storage:
```bash
# Run the local FastAPI bridge
python3 scripts/notebooklm_fastapi_server.py --port 8770
```

---

## 5. Worker Wrangler Configuration

In `wrangler.jsonc`, the Worker registers a **VPC Service binding** which matches the `Service ID` of `macoffice-chrome`:

```json
{
  "vpc_services": [
    {
      "binding": "VPC_SERVICE",
      "service_id": "019df0c3-7091-7613-895a-dd8995045be5"
    }
  ],
  "vars": {
    "NOTEBOOKLM_FASTAPI_URL": "http://127.0.0.1:8770"
  }
}
```

Every outbound request initiated via `env.VPC_SERVICE.fetch("http://127.0.0.1:8770/health")` is intercepted at the Cloudflare edge, encrypted, routed through the `macoffice` tunnel, and delivered safely to your host terminal on port `8770`.
