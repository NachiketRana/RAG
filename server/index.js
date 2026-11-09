import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { executeTool } from './mcp_server.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Middleware: CORS and JSON body parser
app.use(cors());
app.use(express.json());

// 2. Initialize OpenAI SDK pointing to local Ollama (or custom baseURL / OpenAI via env)
const openai = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL || 'http://localhost:11434/v1',
  apiKey: process.env.OPENAI_API_KEY || 'ollama'
});

// Select model: configurable via env, defaulting to gemma4:12b
const LLM_MODEL = process.env.LLM_MODEL || 'gemma4:12b';

// 3. OpenAI tool definitions corresponding to secure MCP tools
const MCP_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_schema',
      description: 'Returns the database schema for analytical queries with sensitive fields omitted',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_select_query',
      description: 'Executes a read-only SELECT SQL query with strict security validation',
      parameters: {
        type: 'object',
        properties: {
          sql_query: {
            type: 'string',
            description: 'The SELECT SQL query to execute'
          }
        },
        required: ['sql_query']
      }
    }
  }
];

// System prompt guiding the assistant to use security-first MCP analytics
const SYSTEM_PROMPT = `
You are a Senior Data Security & Analytics Assistant for a fintech platform.
You have access to MCP tools:
- get_schema: retrieve available tables and allowed columns. Call this if you need to know the schema before querying.
- run_select_query: execute validated read-only SELECT queries.
Rules:
- Never attempt to modify or destroy data (no INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE).
- Never request or query sensitive authentication data (e.g., PASSWORD_HASH).
- Always use the tools when database information is requested.
- If a security guardrail blocks a query, politely explain the security policy violation.
- Provide clear, professional plain-English answers based on the tool results.
`.trim();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    model: LLM_MODEL,
    mcp_tools: MCP_TOOLS.map((t) => t.function.name)
  });
});

// 4. POST route /api/chat with Multi-Step Agentic Tool Calling & Conversation Memory
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "message" in request body'
      });
    }

    // Build conversation history including prior turns if provided
    const conversationHistory = [{ role: 'system', content: SYSTEM_PROMPT }];

    if (Array.isArray(history)) {
      for (const item of history.slice(-8)) {
        if (item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string') {
          conversationHistory.push({ role: item.role, content: item.content });
        }
      }
    }

    // Add current user request
    conversationHistory.push({ role: 'user', content: message });

    let currentIteration = 0;
    const MAX_ITERATIONS = 5;
    let latestAuditLog = null;

    // Agentic Loop: executes tools until LLM produces a final answer or max iterations reached
    while (currentIteration < MAX_ITERATIONS) {
      currentIteration++;

      const response = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: conversationHistory,
        tools: MCP_TOOLS,
        tool_choice: 'auto'
      });

      const choiceMessage = response.choices[0]?.message;
      if (!choiceMessage) {
        break;
      }

      const toolCalls = choiceMessage.tool_calls;

      // When no further tools are requested, we have the final assistant response
      if (!toolCalls || toolCalls.length === 0) {
        const finalAnswer = choiceMessage.content || choiceMessage.reasoning_content || 'No response generated.';
        return res.json({
          answer: finalAnswer,
          audit_log: latestAuditLog || {
            action: 'none',
            query_attempted: null,
            status: 'VALIDATED',
            raw_data: null
          }
        });
      }

      // Record assistant choice message containing tool calls
      conversationHistory.push(choiceMessage);

      // Execute all tool calls in parallel or sequence and collect responses
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        let toolArgs = {};
        try {
          toolArgs = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
        } catch (parseErr) {
          console.warn('Failed to parse tool arguments:', parseErr);
          toolArgs = {};
        }

        let resultText = '';
        try {
          const toolResult = await executeTool(toolName, toolArgs);
          resultText = toolResult?.content?.[0]?.text || '';
        } catch (toolExecError) {
          resultText = JSON.stringify({
            error: `Tool execution failed: ${toolExecError.message}`
          });
        }

        const isBlocked = resultText.includes('SECURITY BLOCKED');
        latestAuditLog = {
          action: toolName,
          query_attempted: toolArgs.sql_query || null,
          status: isBlocked ? 'BLOCKED' : 'VALIDATED',
          raw_data: resultText
        };

        // Add tool response to history for subsequent LLM reasoning turn
        conversationHistory.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: resultText
        });
      }
    }

    // Fallback if max iterations exceeded
    return res.json({
      answer: latestAuditLog?.status === 'BLOCKED'
        ? `Security policy blocked the database operation: ${latestAuditLog.raw_data}`
        : 'Query was executed. Please inspect the audit log for telemetry results.',
      audit_log: latestAuditLog
    });

  } catch (error) {
    console.error('Error in /api/chat endpoint:', error);
    return res.status(500).json({
      error: 'Internal server error processing chat request',
      details: error.message
    });
  }
});

// Start Express server
app.listen(PORT, () => {
  console.log(`Fintech MCP Router API listening on http://localhost:${PORT}`);
  console.log(`LLM Model: ${LLM_MODEL}`);
  console.log(`LLM Endpoint: ${process.env.OPENAI_BASE_URL || 'http://localhost:11434/v1'}`);
});
