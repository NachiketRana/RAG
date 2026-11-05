-- =============================================================================
-- Fintech Mock Database Schema & Seed Data
-- Designed with Security & Integrity Best Practices
-- =============================================================================

-- Clean up existing tables if recreating
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- -----------------------------------------------------------------------------
-- Users Table
-- Stores user identity and KYC compliance state
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    kyc_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (kyc_status IN ('VERIFIED', 'PENDING', 'REJECTED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for authentication and lookup lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_kyc_status ON users(kyc_status);

-- -----------------------------------------------------------------------------
-- Transactions Table
-- Immutable financial ledger records
-- -----------------------------------------------------------------------------
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('COMPLETED', 'PENDING', 'FAILED', 'CANCELLED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance and query indexes
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

-- -----------------------------------------------------------------------------
-- Seed Data: Users
-- Passwords are simulated bcrypt hashes (cost factor 12)
-- -----------------------------------------------------------------------------
INSERT INTO users (id, full_name, email, password_hash, kyc_status, created_at)
VALUES
    (
        1,
        'Sarah Connor',
        'sarah.connor@cyberdyne.io',
        '$2b$12$e8w6Q1L2s3Zk9w5t4y0u1O8v7m6n5b4v3c2x1z9a8s7d6f5g4h3j2',
        'VERIFIED',
        NOW() - INTERVAL '30 days'
    ),
    (
        2,
        'David Miller',
        'd.miller@fintechcorp.internal',
        '$2b$12$K1m2N3b4V5c6X7z8A9s0D1f2G3h4J5k6L7p8O9i0U1y2T3r4E5w6Q',
        'VERIFIED',
        NOW() - INTERVAL '20 days'
    ),
    (
        3,
        'Elena Rostova',
        'elena.rostova@shadowdomain.net',
        '$2b$12$Z9x8C7v6B5n4M3l2K1j0H9g8F7d6S5a4P3o2I1u0Y9t8R7e6W5q4A',
        'PENDING',
        NOW() - INTERVAL '3 days'
    );

-- Reset sequence for users
SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users));

-- -----------------------------------------------------------------------------
-- Seed Data: Transactions
-- 5 transactions: Elena (user 3, PENDING KYC) has failed transactions
-- -----------------------------------------------------------------------------
INSERT INTO transactions (id, user_id, amount, currency, status, created_at)
VALUES
    (
        1,
        1,
        2500.00,
        'USD',
        'COMPLETED',
        NOW() - INTERVAL '15 days'
    ),
    (
        2,
        1,
        149.99,
        'USD',
        'COMPLETED',
        NOW() - INTERVAL '10 days'
    ),
    (
        3,
        2,
        12500.50,
        'USD',
        'COMPLETED',
        NOW() - INTERVAL '5 days'
    ),
    (
        4,
        3,
        450.00,
        'USD',
        'FAILED',
        NOW() - INTERVAL '2 days'
    ),
    (
        5,
        3,
        1200.00,
        'USD',
        'FAILED',
        NOW() - INTERVAL '1 day'
    );

-- Reset sequence for transactions
SELECT setval(pg_get_serial_sequence('transactions', 'id'), (SELECT MAX(id) FROM transactions));
