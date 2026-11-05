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
const SCHEMA_DESCRIPTION = `
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
    // Pure string manipulation for security guardrails
    const trimmedQuery = typeof sql_query === 'string' ? sql_query.trim() : '';
    const upperQuery = trimmedQuery.toUpperCase();

    // Guardrail 1: Convert query to uppercase and enforce it MUST start with "SELECT "
    if (!upperQuery.startsWith('SELECT ')) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'SECURITY BLOCKED: Query must start with SELECT '
            })
          }
        ]
      };
    }

    // Guardrail 2: Block destructive keywords
    const destructiveKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE'];
    for (const keyword of destructiveKeywords) {
      if (upperQuery.includes(keyword)) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `SECURITY BLOCKED: Destructive keyword detected: ${keyword}`
              })
            }
          ]
        };
      }
    }

    // Guardrail 3: Block access to password_hash
    if (upperQuery.includes('PASSWORD_HASH')) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'SECURITY BLOCKED: Access to sensitive column PASSWORD_HASH is forbidden'
            })
          }
        ]
      };
    }

    // Passed all guardrails: execute query safely
    try {
      const result = await pool.query(sql_query);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.rows, null, 2)
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
