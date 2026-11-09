# 🛡️ Secure Fintech MCP Analytics Agent

A production-grade, zero-trust **Model Context Protocol (MCP)** analytics agent designed for financial platforms. This system bridges local Large Language Models (LLMs) with PostgreSQL while enforcing deterministic, string-level security guardrails that prevent data exfiltration, destructive SQL injection, and hallucinated modifications.

---

## 🏛️ System Architecture

```
                    ┌────────────────────────────────────────┐
                    │      React Bloomberg Terminal (UI)     │
                    │   Dual-Pane: Chat & Live Audit Log     │
                    └───────────────────┬────────────────────┘
                                        │ HTTP / JSON
                                        ▼
                    ┌────────────────────────────────────────┐
                    │     Express MCP Router (Port 3000)     │
                    │   • Intercepts LLM tool calls          │
                    │   • Emits audit telemetry logs         │
                    └───────────────┬────────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌──────────────────────┐                         ┌──────────────────────┐
│  Local Ollama LLM    │                         │  MCP Security Layer  │
│  (gemma4 / llama3)   │ ◄─── Tool Definitions ─►│  (mcp_server.js)     │
└──────────────────────┘                         └───────────┬──────────┘
                                                             │
                                                  [SECURITY GUARDRAILS]
                                                  1. SELECT Only
                                                  2. Anti-Destruction
                                                  3. Anti-Exfiltration
                                                             │
                                                             ▼
                                                 ┌──────────────────────┐
                                                 │ PostgreSQL 15 Alpine │
                                                 │ (Port 5434 / Docker) │
                                                 │ • Users (KYC status) │
                                                 │ • Transactions       │
                                                 └──────────────────────┘
```

---

## 🔒 Security Guardrails

The Model Context Protocol (MCP) server implements strict zero-trust defenses between LLM-generated SQL and the database:

| Guardrail | Defense Mechanism | Action Taken |
| :--- | :--- | :--- |
| **1. Read-Only Enforcement** | Validates that queries strictly start with `SELECT ` (case-insensitive). Non-SELECT operations are blocked. | `SECURITY BLOCKED: Query must start with SELECT ` |
| **2. Destructive Keyword Filter** | Scans queries for destructive commands: `DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, `TRUNCATE`. | `SECURITY BLOCKED: Destructive keyword detected: [KEYWORD]` |
| **3. Anti-Exfiltration Masking** | 1. Schema introspection (`get_schema`) **intentionally omits** `password_hash`.<br>2. Any query containing `PASSWORD_HASH` is denied. | `SECURITY BLOCKED: Access to sensitive column PASSWORD_HASH is forbidden` |

> [!NOTE]
> When a guardrail trips, the SQL query is **never passed to PostgreSQL**. The database connection pool remains untouched and an audit record is logged with status `BLOCKED`.

---

## 📦 Directory Structure

```
.
├── .gitignore               # Protects .env secrets & node_modules
├── README.md                # Project documentation
├── database/
│   ├── docker-compose.yml   # PostgreSQL 15 Alpine container setup (port 5434)
│   └── init.sql             # Mock schema & seed data (users, transactions)
├── server/
│   ├── index.js             # Express API & LLM router (port 3000)
│   ├── mcp_server.js        # MCP server instance with guardrails & tools
│   ├── package.json         # Node.js dependencies
│   ├── .env.example         # Environment variables template
│   └── .env                 # Local configuration (untracked)
└── client/
    ├── index.html           # Single-page application entry point
    ├── vite.config.js       # Vite build configuration
    ├── tailwind.config.js   # Tailwind CSS configuration
    └── src/
        ├── App.jsx          # Dual-pane Bloomberg-style terminal interface
        └── index.css        # Tailwind directives and theme styles
```

---

## 🚀 Quickstart Guide

### Prerequisites
- [Docker Desktop](https://www.docker.com/) (running with Linux containers)
- [Node.js](https://nodejs.org/) (v18.0.0 or higher)
- [Ollama](https://ollama.ai/) running locally (`ollama run gemma4:12b` or `llama3`)

---

### Step 1: Start the PostgreSQL Database

Navigate to the `database` directory and start the container:


```bash
cd database
docker compose up -d
```

Verify that the container is healthy:
```bash
docker compose ps
```
The database runs on port `5434` with default credentials (`admin` / `securepassword`).

---

### Step 2: Configure & Start the Backend Router

1. Navigate to the `server` directory and install dependencies:
   ```bash
   cd ../server
   npm install
   ```

2. Verify your `.env` configuration (created automatically from `.env.example`):
   ```env
   PORT=3000
   DATABASE_URL=postgres://admin:securepassword@localhost:5434/fintech_mock
   OPENAI_BASE_URL=http://localhost:11434/v1
   OPENAI_API_KEY=ollama
   LLM_MODEL=gemma4:12b
   ```

3. Start the API server:
   ```bash
   npm start
   ```
   *The server will listen at `http://localhost:3000`.*

---

### Step 3: Start the React Terminal Frontend

1. In a new terminal, navigate to the `client` directory:
   ```bash
   cd ../client
   npm install
   ```

2. Start the Vite development server:
   ```bash
   npm run dev
   ```

3. Open **`http://localhost:5173`** in your browser.

---

## 🧪 Testing the Guardrails (Attack Simulations)

Try submitting these prompts via the React interface to test live security interception:

### 1. Legitimate Analytical Query (Passes Guardrails)
- **Prompt**: *"Which users are verified, and who is still pending KYC?"*
- **Action**: Tool `run_select_query` executes `SELECT id, full_name, email, kyc_status FROM users;`.
- **Telemetry**: Status displays **`VALIDATED` (Green)** with raw user rows.

### 2. Password Exfiltration Attempt (Trips Guardrail 3)
- **Prompt**: *"SELECT id, password_hash FROM users;"*
- **Action**: Guardrail detects the `PASSWORD_HASH` token.
- **Telemetry**: Status displays **`BLOCKED` (Red)** with payload `SECURITY BLOCKED: Access to sensitive column PASSWORD_HASH is forbidden`.

### 3. Destructive Injection Attempt (Trips Guardrail 2)
- **Prompt**: *"SELECT * FROM users; DROP TABLE users;"*
- **Action**: Guardrail detects the `DROP` token.
- **Telemetry**: Status displays **`BLOCKED` (Red)** with payload `SECURITY BLOCKED: Destructive keyword detected: DROP`.

---

## 📜 License

This project is open-source under the [MIT License](LICENSE).
