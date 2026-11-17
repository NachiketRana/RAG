# 🛡️ Fintech MCP Sentinel — Zero-Trust AI Analytics & Guardrail Agent

[![Model Context Protocol](https://img.shields.io/badge/Protocol-MCP%20v1.32-0052FF?style=flat-square)](https://modelcontextprotocol.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%20Alpine-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![React 19](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Tailwind-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Ollama](https://img.shields.io/badge/LLM-Local%20Ollama%20(gemma4%20%2F%20llama3)-black?style=flat-square)](https://ollama.ai)
[![Security Tests](https://img.shields.io/badge/Security%20Tests-23%2F23%20Passing-brightgreen?style=flat-square)](server/test/guardrails.test.js)

A production-grade, zero-trust **Model Context Protocol (MCP)** analytics agent designed for financial platforms. This system bridges local Large Language Models (LLMs) with PostgreSQL while enforcing deterministic, string-level security guardrails that prevent data exfiltration, destructive SQL injection, and multi-statement piggybacking.

---

## 🏛️ System Architecture

```
┌────────────────────────────────────────────────────────┐
│           React Cyber-Fintech Terminal (UI)            │
│  Dual-Pane: Interactive Mission Control & Audit HUD    │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP POST /api/chat
                            ▼
┌────────────────────────────────────────────────────────┐
│             Express MCP Router (:3000)                 │
│  • Multi-step agentic loop (schema -> SQL -> answer)   │
│  • Asynchronously records to PostgreSQL audit ledger   │
└───────────────────────────┬────────────────────────────┘
                            │
             ┌──────────────┴──────────────┐
             ▼                             ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│   Local Ollama Engine    │  │   MCP Security Guardrail │
│      (gemma4:12b)        │◄─┤      (mcp_server.js)     │
└──────────────────────────┘  └────────────┬─────────────┘
                                           │
                                [5-TIER ZERO-TRUST PIPELINE]
                                1. Read-Only Prefix (SELECT/WITH)
                                2. Destructive Keyword Regex (\b)
                                3. Semicolon Injection Shield
                                4. Sensitive Column Masking
                                5. Automatic Result Row Redaction
                                           │
                                           ▼
                              ┌──────────────────────────┐
                              │  PostgreSQL 15 (Docker)  │
                              │  Port 5434 (fintech_mock)│
                              │  • Users (KYC compliance)│
                              │  • Financial Ledger (25) │
                              │  • Audit Logs (ledger)   │
                              └──────────────────────────┘
```

---

## 🔒 5-Tier Zero-Trust Security Guardrails

The Model Context Protocol (MCP) server implements strict zero-trust defenses between LLM-generated SQL and the database:

| Tier | Guardrail | Defense Mechanism | Action Taken |
| :--- | :--- | :--- | :--- |
| **1** | **Read-Only Enforcement** | Queries must strictly begin with `SELECT` or `WITH` (for Common Table Expressions). All other SQL operations are rejected. | `SECURITY BLOCKED: Query must start with SELECT ` |
| **2** | **Destructive & Admin Filter** | Scans queries with word-boundary regex (`\b`) for commands: `DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, `TRUNCATE`, `CREATE`, `GRANT`, `REVOKE`, `COPY`, `EXECUTE`, `CALL`, `PG_SLEEP`. | `SECURITY BLOCKED: Destructive keyword detected: [KEYWORD]` |
| **3** | **Semicolon Multi-Statement Shield** | Disallows unquoted semicolons inside query strings to prohibit query-chaining attacks (`SELECT 1; DROP TABLE users;`). | `SECURITY BLOCKED: Multiple statements or chained queries are forbidden` |
| **4** | **Anti-Exfiltration Masking** | 1. Schema introspection (`get_schema`) intentionally omits `password_hash`.<br>2. Explicit queries referencing sensitive tokens (`password_hash`, `token`, `secret`) are blocked. | `SECURITY BLOCKED: Access to sensitive column PASSWORD_HASH is forbidden` |
| **5** | **Automatic Result Redaction** | Database interceptor scans returned rows. If a query runs `SELECT *`, any sensitive column value is automatically masked before leaving the server. | Output replaced with `[REDACTED_BY_SECURITY_GUARDRAIL]` |

> [!NOTE]
> When a guardrail trips, the SQL query is **never passed to PostgreSQL**. The database connection pool remains untouched, and an immutable record is logged with status `BLOCKED`.

---

## 📦 Directory Structure

```
.
├── .agents/                 # Ponytail agent rules & skills
├── AGENTS.md                # Senior developer guidelines (YAGNI, minimal diffs)
├── README.md                # Project documentation
├── database/
│   ├── docker-compose.yml   # PostgreSQL 15 Alpine container setup (port 5434)
│   └── init.sql             # Mock schema & seed data (users, transactions, audit_logs)
├── server/
│   ├── index.js             # Express API & LLM agentic router (port 3000)
│   ├── mcp_server.js        # MCP server instance with guardrails & tools
│   ├── test/
│   │   ├── guardrails.test.js  # 23 automated security & guardrail unit tests
│   │   └── db_healthcheck.js   # Automated database connectivity verification
│   ├── package.json         # Node.js dependencies & scripts
│   ├── .env.example         # Environment variables template
│   └── .env                 # Local configuration
└── client/
    ├── index.html           # Single-page application entry point
    ├── vite.config.js       # Vite build configuration with /api proxy
    ├── tailwind.config.js   # Tailwind CSS configuration
    └── src/
        ├── App.jsx          # Dual-pane Bloomberg-style cyber terminal interface
        ├── index.css        # Cyber-grid theme, telemetry styles & scrollbars
        └── main.jsx         # React application entry point
```

---

## 🚀 Quickstart Guide

### Prerequisites
- [Docker Desktop](https://www.docker.com/) (running with Linux containers)
- [Node.js](https://nodejs.org/) (v18.0.0 or higher)
- [Ollama](https://ollama.ai/) running locally (`ollama run gemma4:12b` or `llama3:8b`)

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

2. Run the automated security test suite:
   ```bash
   npm test
   ```
   *(All 23 guardrail tests will pass).*

3. Start the API server:
   ```bash
   npm start
   ```
   *The server listens at `http://localhost:3000`.*

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
* **Prompt**: *"Which users are verified, and who is still pending KYC?"*
* **Action**: Tool `run_select_query` executes `SELECT id, full_name, email, kyc_status FROM users;`.
* **Telemetry**: Status displays **`VALIDATED` (Green)** with raw user rows rendered in an interactive financial data table.

### 2. Password Exfiltration Attempt (Trips Guardrail 4)
* **Prompt**: *"SELECT id, password_hash FROM users;"*
* **Action**: Guardrail detects the `PASSWORD_HASH` token.
* **Telemetry**: Status displays **`BLOCKED` (Red)** with payload `SECURITY BLOCKED: Access to sensitive column PASSWORD_HASH is forbidden`.

### 3. Destructive Injection Attempt (Trips Guardrail 2 & 3)
* **Prompt**: *"SELECT * FROM users; DROP TABLE users;"*
* **Action**: Guardrail detects semicolon chaining and the `DROP` token.
* **Telemetry**: Status displays **`BLOCKED` (Red)** with payload `SECURITY BLOCKED: Multiple statements or chained queries are forbidden`.

### 4. Full Table Probe (Trips Guardrail 5 - Redaction)
* **Prompt**: *"Show all data in the users table."*
* **Action**: Query executes, but sensitive columns are dynamically replaced with `[REDACTED_BY_SECURITY_GUARDRAIL]`.

---

## 💼 Interview Talking Points

When discussing this project in technical interviews:

1. **Why Model Context Protocol (MCP)?**  
   MCP standardizes how LLMs expose and invoke tools. Rather than binding prompts to proprietary SDKs, MCP provides clean separation between agent reasoning and infrastructure execution.
2. **Deterministic Security vs. LLM Prompts:**  
   Prompt-based security ("Please do not drop tables") is easily bypassed by adversarial jailbreaks. This project uses **deterministic, string-level AST guardrails** executed in code before SQL ever touches PostgreSQL.
3. **Defense-in-Depth:**  
   Even if an LLM queries `SELECT *` without naming `password_hash`, the data redaction interceptor scrubs credential keys from the output payload before transmitting telemetry.

---

## 📜 License

This project is open-source under the [MIT License](LICENSE).
