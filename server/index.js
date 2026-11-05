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

// Select model: configurable via env, defaulting to locally available model
const LLM_MODEL = process.env.LLM_MODEL || 'gemma4:12b';

// 4. OpenAI tool definitions corresponding to secure MCP tools
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
- get_schema: retrieve available tables and allowed columns.
- run_select_query: execute validated read-only SELECT queries.
Rules:
- Never attempt to modify or destroy data (no INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE).
- Never request or query sensitive authentication data (e.g., PASSWORD_HASH).
- Always use the tools when database information is requested.
- Provide clear, professional plain-English answers based on the tool results.
`.trim();

// 3. POST route /api/chat
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "message" in request body'
      });
    }

    const conversationHistory = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: message }
    ];

    // 4. Initial call to LLM with tool definitions
    const firstResponse = await openai.chat.completions.create({
      model: LLM_MODEL,
      messages: conversationHistory,
      tools: MCP_TOOLS,
      tool_choice: 'auto'
    });

    const choiceMessage = firstResponse.choices[0]?.message;
    const toolCalls = choiceMessage?.tool_calls;

    // 5. Intercept tool_calls if generated
    if (toolCalls && toolCalls.length > 0) {
      const toolCall = toolCalls[0];
      const toolName = toolCall.function.name;

      let toolArgs = {};
      try {
        toolArgs = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
      } catch (parseErr) {
        console.warn('Failed to parse tool arguments:', parseErr);
        toolArgs = {};
      }

      // 6. Invoke the corresponding MCP tool directly
      let resultText = '';
      try {
        const toolResult = await executeTool(toolName, toolArgs);
        resultText = toolResult?.content?.[0]?.text || '';
      } catch (toolExecError) {
        resultText = JSON.stringify({
          error: `Tool execution failed: ${toolExecError.message}`
        });
      }

      // Audit status evaluation
      const isBlocked = resultText.includes('SECURITY BLOCKED');
      const auditLog = {
        action: toolName,
        query_attempted: toolArgs.sql_query || null,
        status: isBlocked ? 'BLOCKED' : 'VALIDATED',
        raw_data: resultText
      };

      // 7. Send tool execution result back to LLM for final plain-English answer
      conversationHistory.push(choiceMessage);
      conversationHistory.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: resultText
      });

      const secondResponse = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: conversationHistory
      });

      const secondMsg = secondResponse.choices[0]?.message;
      let finalAnswer = secondMsg?.content || secondMsg?.reasoning_content;

      if (!finalAnswer || !finalAnswer.trim()) {
        if (isBlocked) {
          finalAnswer = `Security policy blocked the requested database operation. Details: ${resultText}`;
        } else {
          finalAnswer = `The query was executed successfully against the database. Telemetry and raw records are available in the Live Security Audit Log.`;
        }
      }

      // 8. Return response containing exactly two keys: answer and audit_log
      return res.json({
        answer: finalAnswer,
        audit_log: auditLog
      });
    }

    // Direct response when no tools were invoked
    return res.json({
      answer: choiceMessage?.content || 'No response generated.',
      audit_log: {
        action: 'none',
        query_attempted: null,
        status: 'VALIDATED',
        raw_data: null
      }
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
