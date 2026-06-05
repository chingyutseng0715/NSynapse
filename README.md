# NEXUS — Deep Tech Due Diligence Platform

AI-powered investment due diligence tool. Upload a pitch deck, technical document, or research report and receive a structured 7-section analysis from a local LLM.

---

## Requirements

- Node.js 20+
- Ollama
- A pulled LLM model (see below)

---

## Windows Setup (Local Development)

### 1. Clone the repo

```powershell
git clone https://github.com/chingyutseng0715/NSynapse.git
cd NSynapse
```

### 2. Install Ollama

Download and install from https://ollama.com/download — choose Windows.

### 3. Set the model folder permanently

Run this once in PowerShell so Ollama always looks in the project folder:

```powershell
[System.Environment]::SetEnvironmentVariable("OLLAMA_MODELS", "C:\path\to\NSynapse\model", "User")
```

Replace `C:\path\to\NSynapse` with your actual path.

### 4. Pull a model

Open a new PowerShell window (so the env var is active) and pull a model:

```powershell
# Recommended for 6GB VRAM (RTX 3050 etc.)
ollama pull llama3.1:8b

# Recommended for 8GB+ VRAM (RTX 4070 etc.)
ollama pull llama3.3:70b
```

> **Tip:** If `ollama` is not recognized, use the full path:
> `& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" pull llama3.1:8b`

### 5. Install app dependencies

```powershell
npm install
```

### 6. Create `.env`

Create a file called `.env` in the project root:

```
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
OLLAMA_MODELS=./model
PORT=3000
```

### 7. Restart Ollama

Right-click the Ollama icon in the system tray → Quit, then reopen Ollama from the Start menu. This ensures it picks up the `OLLAMA_MODELS` env var.

### 8. Start the app

```powershell
node server.js
```

Open http://localhost:3000 in your browser.

---

## Ubuntu Server Setup (Production)

### Requirements

- Ubuntu 20.04+
- Node.js 20+ (installed by deploy.sh)
- Ollama binary (see below — server may have no internet access)
- Dual RTX 5090 recommended (runs llama3.3:70b)

---

### Step 1 — Download everything on Windows first

Since the Ubuntu server may have port 443 blocked, download all files on your Windows machine and SCP them over.

**Download Ollama Linux binary:**

```powershell
Invoke-WebRequest -Uri "https://ollama.com/download/ollama-linux-amd64" -OutFile "C:\Users\eugen\Downloads\ollama-linux-amd64"
```

**Pull the model on Windows (downloads to the project model folder):**

```powershell
ollama pull llama3.3:70b
```

---

### Step 2 — Copy files to the server

```powershell
# Copy app files
scp -r C:\path\to\NSynapse ubuntu@<server-ip>:~/NSynapse

# Copy Ollama binary
scp C:\Users\eugen\Downloads\ollama-linux-amd64 ubuntu@<server-ip>:~/

# Copy models
scp -r C:\path\to\NSynapse\model ubuntu@<server-ip>:~/NSynapse/model
```

---

### Step 3 — Install Ollama on the server

SSH into the server and run:

```bash
sudo mv ~/ollama-linux-amd64 /usr/local/bin/ollama
sudo chmod +x /usr/local/bin/ollama
ollama --version   # verify
```

---

### Step 4 — Create `.env` on the server

```bash
cd ~/NSynapse
cat > .env << EOF
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.3:70b
OLLAMA_MODELS=$(pwd)/model
PORT=3000
EOF
```

---

### Step 5 — Run deploy.sh

```bash
cd ~/NSynapse
bash deploy.sh
```

This will:
- Install Node.js 20
- Set `OLLAMA_MODELS` permanently in `~/.bashrc`
- Skip model download if already present in `model/`
- Install npm dependencies
- Start the app with PM2 (keeps it running after logout)

---

### Step 6 — Start Ollama as a background service

```bash
OLLAMA_MODELS=~/NSynapse/model ollama serve &
```

To make it start automatically on reboot:

```bash
sudo tee /etc/systemd/system/ollama.service > /dev/null << EOF
[Unit]
Description=Ollama Service
After=network.target

[Service]
User=$USER
Environment="OLLAMA_MODELS=/home/$USER/NSynapse/model"
ExecStart=/usr/local/bin/ollama serve
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl start ollama
```

---

### Step 7 — Open firewall

```bash
sudo ufw allow 3000   # direct access
sudo ufw allow 22     # keep SSH open
```

Access the app at `http://<server-ip>:3000`.

---

## Adding New Models

Edit `models.json` in the project root — no code changes needed:

```json
{
  "id": "mistral:7b",
  "label": "Mistral 7B",
  "description": "Lightweight — requires ~5GB VRAM"
}
```

Pull the model with Ollama and it will appear in the dropdown immediately.

---

## Project Structure

```
NSynapse/
├── server.js          — Express backend, Ollama streaming
├── public/
│   ├── index.html     — Frontend UI
│   └── marked.umd.js  — Markdown renderer
├── models.json        — Available model list
├── model/             — Downloaded model files (not in git)
├── deploy.sh          — One-command Ubuntu server setup
├── .env               — Local config (not in git)
└── .gitignore
```

---

## Useful Commands

```bash
ollama list            # show downloaded models
ollama pull <model>    # download a model
pm2 logs nexus         # view app logs on server
pm2 restart nexus      # restart app on server
pm2 stop nexus         # stop app on server
```
