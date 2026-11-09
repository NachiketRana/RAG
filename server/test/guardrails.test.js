import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuery, sanitizeRows, executeTool } from '../mcp_server.js';

test('Security Guardrail 1: Enforce Read-Only SELECT/WITH queries', async (t) => {
  await t.test('allows valid SELECT query', () => {
    const result = validateQuery('SELECT id, full_name, email FROM users');
    assert.equal(result.valid, true);
  });

  await t.test('allows valid SELECT query with trailing semicolon', () => {
    const result = validateQuery('SELECT id, amount, status FROM transactions;');
    assert.equal(result.valid, true);
  });

  await t.test('allows Common Table Expression (WITH ... SELECT)', () => {
    const result = validateQuery('WITH verified_users AS (SELECT * FROM users) SELECT * FROM verified_users');
    assert.equal(result.valid, true);
  });

  await t.test('blocks query not starting with SELECT or WITH', () => {
    const result = validateQuery('UPDATE users SET kyc_status = \'VERIFIED\' WHERE id = 1');
    assert.equal(result.valid, false);
    assert.match(result.error, /Query must start with SELECT/);
  });

  await t.test('blocks empty or whitespace-only query', () => {
    const result = validateQuery('   ');
    assert.equal(result.valid, false);
    assert.match(result.error, /Query cannot be empty/);
  });
});

test('Security Guardrail 2: Block Destructive & Administrative Commands', async (t) => {
  const attacks = [
    { query: 'DROP TABLE users', keyword: 'DROP' },
    { query: 'DELETE FROM transactions WHERE id = 1', keyword: 'DELETE' },
    { query: 'TRUNCATE TABLE users', keyword: 'TRUNCATE' },
    { query: 'ALTER TABLE users ADD COLUMN is_admin BOOLEAN', keyword: 'ALTER' },
    { query: 'CREATE TABLE backdoor (cmd TEXT)', keyword: 'CREATE' },
    { query: 'GRANT ALL PRIVILEGES ON users TO public', keyword: 'GRANT' }
  ];

  for (const attack of attacks) {
    await t.test(`blocks keyword ${attack.keyword}`, () => {
      const result = validateQuery(attack.query);
      assert.equal(result.valid, false);
    });
  }

  await t.test('does NOT block queries with words containing keywords (e.g. updated_at or created_at)', () => {
    const result = validateQuery('SELECT id, updated_at, created_at FROM transactions');
    assert.equal(result.valid, true);
  });
});

test('Security Guardrail 3: Block Exfiltration of Sensitive Columns', async (t) => {
  await t.test('blocks query explicitly requesting password_hash', () => {
    const result = validateQuery('SELECT id, password_hash FROM users');
    assert.equal(result.valid, false);
    assert.match(result.error, /Access to sensitive column PASSWORD_HASH is forbidden/);
  });

  await t.test('blocks query with password column in WHERE clause', () => {
    const result = validateQuery("SELECT id FROM users WHERE password_hash = 'test'");
    assert.equal(result.valid, false);
    assert.match(result.error, /Access to sensitive column PASSWORD_HASH is forbidden/);
  });

  await t.test('sanitizeRows strips password_hash from database query results', () => {
    const mockDbRows = [
      { id: 1, full_name: 'Sarah Connor', password_hash: '$2b$12$secretHashValue', kyc_status: 'VERIFIED' },
      { id: 2, full_name: 'David Miller', password_hash: '$2b$12$anotherSecret', kyc_status: 'VERIFIED' }
    ];

    const sanitized = sanitizeRows(mockDbRows);
    assert.equal(sanitized.length, 2);
    assert.equal(sanitized[0].password_hash, '[REDACTED_BY_SECURITY_GUARDRAIL]');
    assert.equal(sanitized[1].password_hash, '[REDACTED_BY_SECURITY_GUARDRAIL]');
    assert.equal(sanitized[0].full_name, 'Sarah Connor');
  });
});

test('Security Guardrail 4: Block Semicolon Multi-Statement Chaining', async (t) => {
  await t.test('blocks multiple chained SQL statements', () => {
    const result = validateQuery('SELECT * FROM users; DROP TABLE users;');
    assert.equal(result.valid, false);
    assert.match(result.error, /Multiple statements or chained queries are forbidden/);
  });

  await t.test('blocks piggybacked secondary SELECT', () => {
    const result = validateQuery('SELECT 1; SELECT 2;');
    assert.equal(result.valid, false);
    assert.match(result.error, /Multiple statements or chained queries are forbidden/);
  });
});

test('MCP Schema Tool Registration', async (t) => {
  await t.test('get_schema returns schema description without sensitive fields', async () => {
    const result = await executeTool('get_schema');
    assert.ok(result?.content?.[0]?.text);
    assert.ok(!result.content[0].text.includes('password_hash'));
    assert.ok(result.content[0].text.includes('users'));
    assert.ok(result.content[0].text.includes('transactions'));
  });
});

