import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pg from 'pg';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// 1. Initialize PostgreSQL pool connecting to fintech_mock database
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://admin:securepassword@localhost:5434/fintech_mock'
});

// 2. Initialize McpServer instance
export const server = new McpServer({
  name: 'fintech-analytics-mcp-server',
  version: '1.0.0'
});

// Hardcoded schema intentionally omitting sensitive fields like 'password_hash'
export const SCHEMA_DESCRIPTION = `
Database Schema (PostgreSQL):

Table: users
  - id: integer (primary key)
  - full_name: varchar(100) (not null)
  - email: varchar(255) (unique, not null)
  - kyc_status: varchar(20) (allowed: 'VERIFIED', 'PENDING', 'REJECTED')
  - created_at: timestamp with time zone

Table: transactions
  - id: integer (primary key)
  - user_id: integer (foreign key referencing users.id)
  - amount: numeric(14,2) (not null)
  - currency: varchar(3) (default 'USD')
  - status: varchar(20) (allowed: 'COMPLETED', 'PENDING', 'FAILED', 'CANCELLED')
  - created_at: timestamp with time zone
`.trim();

// Sensitive columns that must never be exposed or returned in query payloads
export const SENSITIVE_COLUMNS = new Set([
  'password_hash',
  'password',
  'passwd',
  'secret',
  'token',
  'auth_token',
  'api_key'
]);

// Blocked destructive, administrative, and multi-statement SQL keywords
export const DESTRUCTIVE_KEYWORDS = [
  'DROP',
  'DELETE',
  'UPDATE',
  'INSERT',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'GRANT',
  'REVOKE',
  'COPY',
  'EXECUTE',
  'CALL',
  'VACUUM',
  'REINDEX',
  'PG_SLEEP'
];

/**
 * Validates a SQL query string against security guardrails.
 * Returns { valid: true } or { valid: false, error: string }
 */
export function validateQuery(sql_query) {
  if (typeof sql_query !== 'string') {
    return {
      valid: false,
      error: 'SECURITY BLOCKED: Invalid query format'
    };
  }

  const trimmed = sql_query.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'SECURITY BLOCKED: Query cannot be empty'
    };
  }

  // Remove single-line comments (-- ...) and multi-line comments (/* ... */)
  const queryWithoutComments = trimmed
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
    .trim();

  if (!queryWithoutComments) {
    return {
      valid: false,
      error: 'SECURITY BLOCKED: Query contains only comments or whitespace'
    };
  }

  // Multi-statement check: disallow semicolons inside statement (allow only a single trailing semicolon)
  const statementWithoutTrailingSemicolon = queryWithoutComments.replace(/;\s*$/, '');
  if (statementWithoutTrailingSemicolon.includes(';')) {
    return {
      valid: false,
      error: 'SECURITY BLOCKED: Multiple statements or chained queries are forbidden'
    };
  }

  // Guardrail 1: Enforce read-only prefix (SELECT or WITH for CTEs)
  const normalizedUpper = statementWithoutTrailingSemicolon.toUpperCase();
  const startsWithSelect = normalizedUpper.startsWith('SELECT');
  const startsWithWith = normalizedUpper.startsWith('WITH');

  if (!startsWithSelect && !startsWithWith) {
    return {
      valid: false,
      error: 'SECURITY BLOCKED: Query must start with SELECT '
    };
  }

  // Guardrail 2: Block destructive or administrative keywords using word boundaries
  for (const keyword of DESTRUCTIVE_KEYWORDS) {
    const keywordRegex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (keywordRegex.test(statementWithoutTrailingSemicolon)) {
      return {
        valid: false,
        error: `SECURITY BLOCKED: Destructive keyword detected: ${keyword}`
      };
    }
  }

  // Guardrail 3: Explicit access to sensitive columns (like password_hash)
  for (const col of SENSITIVE_COLUMNS) {
    const colRegex = new RegExp(`\\b${col}\\b`, 'i');
    if (colRegex.test(statementWithoutTrailingSemicolon)) {
      return {
        valid: false,
        error: `SECURITY BLOCKED: Access to sensitive column ${col.toUpperCase()} is forbidden`
      };
    }
  }

  return { valid: true };
}

/**
 * Redacts any sensitive columns from returned database rows (defense-in-depth against SELECT *)
 */
export function sanitizeRows(rows) {
  if (!Array.isArray(rows)) return rows;

  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const cleanRow = { ...row };
    for (const key of Object.keys(cleanRow)) {
      if (SENSITIVE_COLUMNS.has(key.toLowerCase())) {
        cleanRow[key] = '[REDACTED_BY_SECURITY_GUARDRAIL]';
      }
    }
    return cleanRow;
  });
}

// 3. Tool 1: get_schema - returns the sanitized database schema
server.tool(
  'get_schema',
  'Returns the database schema for analytical queries (sensitive fields omitted)',
  async () => {
    return {
      content: [
        {
          type: 'text',
          text: SCHEMA_DESCRIPTION
        }
      ]
    };
  }
);

// 4. Tool 2: run_select_query - executes SELECT queries with strict security guardrails
server.tool(
  'run_select_query',
  'Executes a read-only SELECT SQL query with strict security validation',
  {
    sql_query: z.string().describe('The SELECT SQL query to execute')
  },
  async ({ sql_query }) => {
    // Validate SQL query against guardrails
    const validation = validateQuery(sql_query);
    if (!validation.valid) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: validation.error })
          }
        ]
      };
    }

    // Passed all guardrails: execute query safely
    try {
      const result = await pool.query(sql_query);
      const sanitizedData = sanitizeRows(result.rows);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(sanitizedData, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: `Database execution error: ${error.message}`
            })
          }
        ],
        isError: true
      };
    }
  }
);

// Helper function to invoke registered tools directly
export async function executeTool(toolName, args = {}) {
  const tool = server._registeredTools?.[toolName];
  if (!tool) {
    throw new Error(`Tool "${toolName}" is not registered on the MCP server.`);
  }
  return await tool.handler(args);
}

// Export server as default and named export
export default server;
