-- =============================================================================
-- Fintech Mock Database Schema & Seed Data
-- Production-Grade Financial Ledger & Audit Store
-- =============================================================================

DROP TABLE IF EXISTS audit_logs CASCADE;
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

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

-- -----------------------------------------------------------------------------
-- Audit Logs Table
-- Immutable record of intercepted LLM queries & security events
-- -----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    query_attempted TEXT,
    status VARCHAR(20) NOT NULL,
    raw_data TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_status ON audit_logs(status);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- -----------------------------------------------------------------------------
-- Seed Data: Users
-- Passwords are simulated bcrypt hashes
-- -----------------------------------------------------------------------------
INSERT INTO users (id, full_name, email, password_hash, kyc_status, created_at)
VALUES
    (1, 'Sarah Connor', 'sarah.connor@cyberdyne.io', '$2b$12$e8w6Q1L2s3Zk9w5t4y0u1O8v7m6n5b4v3c2x1z9a8s7d6f5g4h3j2', 'VERIFIED', NOW() - INTERVAL '90 days'),
    (2, 'David Miller', 'd.miller@fintechcorp.internal', '$2b$12$K1m2N3b4V5c6X7z8A9s0D1f2G3h4J5k6L7p8O9i0U1y2T3r4E5w6Q', 'VERIFIED', NOW() - INTERVAL '60 days'),
    (3, 'Elena Rostova', 'elena.rostova@shadowdomain.net', '$2b$12$Z9x8C7v6B5n4M3l2K1j0H9g8F7d6S5a4P3o2I1u0Y9t8R7e6W5q4A', 'PENDING', NOW() - INTERVAL '14 days'),
    (4, 'Marcus Vance', 'm.vance@apexcapital.co', '$2b$12$p0o9i8u7y6t5r4e3w2q1a2s3d4f5g6h7j8k9l0z1x2c3v4b5n6m7', 'VERIFIED', NOW() - INTERVAL '45 days'),
    (5, 'Amina Al-Mansoor', 'amina@qatar-holdings.qa', '$2b$12$q1w2e3r4t5y6u7i8o9p0l9k8j7h6g5f4d3s2a1z0x9c8v7b6n5m4', 'VERIFIED', NOW() - INTERVAL '30 days'),
    (6, 'Viktor Krum', 'v.krum@durmstrang-trade.bg', '$2b$12$m1n2b3v4c5x6z7a8s9d0f1g2h3j4k5l6p7o8i9u0y1t2r3e4w5q6', 'REJECTED', NOW() - INTERVAL '10 days'),
    (7, 'Chloe Zhao', 'chloe.zhao@pacific-venture.sg', '$2b$12$x1c2v3b4n5m6a7s8d9f0g1h2j3k4l5p6o7i8u9y0t1r2e3w4q5a6', 'VERIFIED', NOW() - INTERVAL '25 days'),
    (8, 'Liam O''Connor', 'liam.oc@celtic-pay.ie', '$2b$12$l1k2j3h4g5f6d7s8a9z0x1c2v3b4n5m6q7w8e9r0t1y2u3i4o5p6', 'PENDING', NOW() - INTERVAL '5 days');

SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users));

-- -----------------------------------------------------------------------------
-- Seed Data: Transactions
-- Realistic financial distribution: wires, payroll, failed compliance, chargebacks
-- -----------------------------------------------------------------------------
INSERT INTO transactions (id, user_id, amount, currency, status, created_at)
VALUES
    -- User 1: Sarah Connor (Verified Tech Executive)
    (1, 1, 2500.00, 'USD', 'COMPLETED', NOW() - INTERVAL '45 days'),
    (2, 1, 149.99, 'USD', 'COMPLETED', NOW() - INTERVAL '30 days'),
    (3, 1, 8450.00, 'USD', 'COMPLETED', NOW() - INTERVAL '12 days'),
    (4, 1, 320.00, 'EUR', 'COMPLETED', NOW() - INTERVAL '5 days'),

    -- User 2: David Miller (Corporate Controller)
    (5, 2, 12500.50, 'USD', 'COMPLETED', NOW() - INTERVAL '40 days'),
    (6, 2, 45000.00, 'USD', 'COMPLETED', NOW() - INTERVAL '22 days'),
    (7, 2, 850.00, 'GBP', 'COMPLETED', NOW() - INTERVAL '8 days'),

    -- User 3: Elena Rostova (Pending KYC - blocked transactions)
    (8, 3, 450.00, 'USD', 'FAILED', NOW() - INTERVAL '12 days'),
    (9, 3, 1200.00, 'USD', 'FAILED', NOW() - INTERVAL '6 days'),
    (10, 3, 3000.00, 'USD', 'FAILED', NOW() - INTERVAL '2 days'),

    -- User 4: Marcus Vance (Venture Partner)
    (11, 4, 75000.00, 'USD', 'COMPLETED', NOW() - INTERVAL '35 days'),
    (12, 4, 1500.00, 'USD', 'COMPLETED', NOW() - INTERVAL '18 days'),
    (13, 4, 9800.00, 'USD', 'COMPLETED', NOW() - INTERVAL '4 days'),
    (14, 4, 250.00, 'USD', 'COMPLETED', NOW() - INTERVAL '1 day'),

    -- User 5: Amina Al-Mansoor (High-Net-Worth International)
    (15, 5, 85000.00, 'USD', 'COMPLETED', NOW() - INTERVAL '28 days'),
    (16, 5, 14500.00, 'EUR', 'COMPLETED', NOW() - INTERVAL '15 days'),
    (17, 5, 2200.00, 'USD', 'COMPLETED', NOW() - INTERVAL '7 days'),

    -- User 6: Viktor Krum (Rejected KYC - Sanction Flagged)
    (18, 6, 10000.00, 'USD', 'FAILED', NOW() - INTERVAL '9 days'),
    (19, 6, 5000.00, 'EUR', 'CANCELLED', NOW() - INTERVAL '8 days'),

    -- User 7: Chloe Zhao (APAC Operations)
    (20, 7, 3400.00, 'USD', 'COMPLETED', NOW() - INTERVAL '20 days'),
    (21, 7, 670.00, 'USD', 'COMPLETED', NOW() - INTERVAL '11 days'),
    (22, 7, 18900.00, 'USD', 'COMPLETED', NOW() - INTERVAL '3 days'),

    -- User 8: Liam O'Connor (Pending Merchant)
    (23, 8, 89.00, 'EUR', 'PENDING', NOW() - INTERVAL '2 days'),
    (24, 8, 420.00, 'USD', 'PENDING', NOW() - INTERVAL '1 day'),
    (25, 8, 15.50, 'USD', 'COMPLETED', NOW() - INTERVAL '12 hours');

SELECT setval(pg_get_serial_sequence('transactions', 'id'), (SELECT MAX(id) FROM transactions));
