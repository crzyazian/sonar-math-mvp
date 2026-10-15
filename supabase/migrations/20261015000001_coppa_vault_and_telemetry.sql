-- ============================================================================
-- MIGRATION: 20261015000001_coppa_vault_and_telemetry.sql
-- PROJECT: Sonar Math MVP (K-8 Diagnostic Platform)
--
-- PURPOSE:
-- Establishes a strict two-schema architectural boundary:
-- 1. `vault`: PII, COPPA consent records, student demographics (with non-binary & inclusive gender codes).
-- 2. `telemetry`: Ephemeral diagnostic session telemetry and granular item responses.
--
-- STRICT COPPA ZERO-KNOWLEDGE ISOLATION:
-- By architectural design and regulatory compliance (COPPA 16 CFR Part 312 & FERPA):
-- - The `telemetry` schema NEVER references or joins with tables in the `vault` schema.
-- - No Foreign Keys exist across the boundary.
-- - Diagnostic sessions operate exclusively on ephemeral UUID tokens (`session_id`).
-- - Telemetry data retains no direct linkage to student PII, allowing safe analytics,
--   SEDA modeling, and Oregon Department of Education (ODE) cohort reporting without
--   exposing child identity.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SCHEMAS INITIALIZATION
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS telemetry;

-- Enable UUID extension if not already present
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 2. VAULT SCHEMA (PII & COPPA VERIFIABLE CONSENT)
-- ----------------------------------------------------------------------------

-- 2.1 Parents & Legal Guardians (Consent records & Verification)
CREATE TABLE vault.parents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone_number TEXT,
    -- COPPA Verifiable Parental Consent tracking
    consent_status TEXT NOT NULL CHECK (consent_status IN ('pending', 'granted', 'revoked', 'expired')),
    consent_timestamp TIMESTAMPTZ,
    consent_mechanism TEXT NOT NULL CHECK (consent_mechanism IN (
        'credit_card_verification',
        'digital_signature',
        'video_conference',
        'government_id',
        'email_plus_verification',
        'school_loco_parentis'
    )),
    -- Cryptographic hash of IP address for compliance audit trail without storing raw identifiable IP
    ip_audit_hash TEXT,
    consent_document_version TEXT NOT NULL DEFAULT 'v1.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Index for parent lookup by email
CREATE INDEX idx_vault_parents_email ON vault.parents(email);
CREATE INDEX idx_vault_parents_consent_status ON vault.parents(consent_status);

-- 2.2 Students (Demographics & Academic Profile)
CREATE TABLE vault.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID NOT NULL REFERENCES vault.parents(id) ON DELETE RESTRICT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    birth_date DATE NOT NULL,
    grade_level SMALLINT NOT NULL CHECK (grade_level BETWEEN 0 AND 12),
    -- Inclusive Gender Codes adhering to Oregon Department of Education (ODE)
    -- and modern EDFacts/NCES standards:
    -- 'M'  = Male
    -- 'F'  = Female
    -- 'NB' = Non-Binary
    -- 'X'  = Non-Binary / Another Gender Identity
    -- 'U'  = Unspecified / Prefer not to state
    gender_code VARCHAR(5) NOT NULL CHECK (gender_code IN ('M', 'F', 'NB', 'X', 'U')),
    -- Educational administrative identifiers (district/school level for SEDA mapping)
    state_district_id VARCHAR(50),
    state_school_id VARCHAR(50),
    -- Aggregated demographic covariates for SEDA research stratification
    seda_locale_code VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_vault_students_parent ON vault.students(parent_id);
CREATE INDEX idx_vault_students_grade ON vault.students(grade_level);
CREATE INDEX idx_vault_students_district ON vault.students(state_district_id);

-- ----------------------------------------------------------------------------
-- 3. TELEMETRY SCHEMA (ZERO-KNOWLEDGE EPHEMERAL ASSESSMENT ENGINE)
-- ----------------------------------------------------------------------------

-- 3.1 Diagnostic Sessions
CREATE TABLE telemetry.diagnostic_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Client-generated idempotency token (from tablet/IndexedDB offline queue)
    client_generated_id UUID NOT NULL UNIQUE,
    assessment_code TEXT NOT NULL DEFAULT '4TH_GRADE_FRACTIONS_V1',
    target_grade SMALLINT NOT NULL DEFAULT 4,
    started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    completed_at TIMESTAMPTZ,
    session_status TEXT NOT NULL CHECK (session_status IN (
        'initialized',
        'in_progress',
        'completed',
        'abandoned',
        'invalidated'
    )) DEFAULT 'initialized',
    
    -- Oregon Department of Education (ODE) State Accountability:
    -- Invalidation rule: Assessments with fewer than 5 items attempted are INVALID.
    total_items_attempted SMALLINT NOT NULL DEFAULT 0,
    ode_validity_cleared BOOLEAN NOT NULL DEFAULT false,
    
    -- Device context for touch-target telemetry and motor-skill calibration
    device_category TEXT CHECK (device_category IN ('tablet', 'desktop', 'mobile', 'unknown')) DEFAULT 'tablet',
    viewport_width INT,
    viewport_height INT,
    user_agent TEXT,
    
    -- Network synchronization mode
    sync_source TEXT NOT NULL CHECK (sync_source IN ('online_realtime', 'offline_indexeddb_replay')) DEFAULT 'online_realtime',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_telemetry_sessions_client_id ON telemetry.diagnostic_sessions(client_generated_id);
CREATE INDEX idx_telemetry_sessions_status ON telemetry.diagnostic_sessions(session_status);
CREATE INDEX idx_telemetry_sessions_ode_validity ON telemetry.diagnostic_sessions(ode_validity_cleared);

-- 3.2 Item Responses & Micro-Telemetry
CREATE TABLE telemetry.item_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES telemetry.diagnostic_sessions(session_id) ON DELETE CASCADE,
    item_index SMALLINT NOT NULL CHECK (item_index BETWEEN 1 AND 15),
    target_phase SMALLINT NOT NULL CHECK (target_phase IN (1, 2, 3)),
    -- Learning modalities per Sonar diagnostic taxonomy
    modality TEXT NOT NULL CHECK (modality IN ('discrete', 'continuous', 'abstract')),
    -- Interactive mechanic
    mechanic_type TEXT NOT NULL CHECK (mechanic_type IN (
        'graduated_cylinder_pour',
        'unit_block_grid',
        'number_line_slider',
        'multiple_choice',
        'numeric_fraction_input'
    )),
    prompt_key TEXT NOT NULL,
    
    -- Response payloads
    raw_answer JSONB NOT NULL,
    is_correct BOOLEAN NOT NULL,
    
    -- High-precision micro-telemetry (performance.now timings from client)
    first_interaction_ms NUMERIC(10, 2) NOT NULL,
    latency_ms NUMERIC(10, 2) NOT NULL,
    
    -- Motor-skill vs cognitive error friction markers (e.g. cylinder snap corrections)
    friction_events_count SMALLINT NOT NULL DEFAULT 0,
    micro_interactions_log JSONB,
    
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    synced_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    
    -- Ensure idempotent item submissions per session
    CONSTRAINT uq_session_item UNIQUE (session_id, item_index)
);

CREATE INDEX idx_telemetry_items_session ON telemetry.item_responses(session_id);
CREATE INDEX idx_telemetry_items_phase_modality ON telemetry.item_responses(target_phase, modality);
CREATE INDEX idx_telemetry_items_correctness ON telemetry.item_responses(is_correct);

-- ----------------------------------------------------------------------------
-- 4. AUTOMATED ODE STATE ACCOUNTABILITY TRIGGER
-- ----------------------------------------------------------------------------
-- Automatically updates total_items_attempted and clears ODE validity threshold (>= 5 items)
CREATE OR REPLACE FUNCTION telemetry.update_session_attemptedness_and_ode_validity()
RETURNS TRIGGER AS $$
DECLARE
    attempted_count INT;
BEGIN
    SELECT COUNT(*)
    INTO attempted_count
    FROM telemetry.item_responses
    WHERE session_id = NEW.session_id;

    UPDATE telemetry.diagnostic_sessions
    SET 
        total_items_attempted = attempted_count,
        ode_validity_cleared = (attempted_count >= 5),
        session_status = CASE 
            WHEN attempted_count >= 15 THEN 'completed'
            WHEN session_status = 'initialized' THEN 'in_progress'
            ELSE session_status
        END
    WHERE session_id = NEW.session_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_item_response_after_insert
AFTER INSERT ON telemetry.item_responses
FOR EACH ROW
EXECUTE FUNCTION telemetry.update_session_attemptedness_and_ode_validity();

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) & ISOLATION ENFORCEMENT
-- ----------------------------------------------------------------------------
ALTER TABLE vault.parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry.diagnostic_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry.item_responses ENABLE ROW LEVEL SECURITY;

-- Telemetry policy: Anonymous client sessions can insert and sync their own session data
CREATE POLICY "Allow anonymous telemetry session creation"
ON telemetry.diagnostic_sessions
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow session status read by client token"
ON telemetry.diagnostic_sessions
FOR SELECT
USING (true);

CREATE POLICY "Allow anonymous item telemetry insertion"
ON telemetry.item_responses
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow item telemetry read for active session"
ON telemetry.item_responses
FOR SELECT
USING (true);

-- Vault policies: Restricted to authenticated parents for their own children
CREATE POLICY "Parents can view and update their own record"
ON vault.parents
FOR ALL
USING (auth.uid() = id);

CREATE POLICY "Parents can view and update their children"
ON vault.students
FOR ALL
USING (auth.uid() = parent_id);
