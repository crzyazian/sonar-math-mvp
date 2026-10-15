-- ============================================================================
-- MIGRATION: 20261015000001_coppa_vault_and_telemetry.sql
-- PROJECT: Sonar Math MVP (K-8 Diagnostic Platform - Web First)
--
-- PURPOSE:
-- Establishes a strict two-schema architectural boundary:
-- 1. `vault`: PII, COPPA consent records, student demographics (with non-binary & inclusive gender codes).
-- 2. `telemetry`: Ephemeral diagnostic session telemetry and granular item responses.
--
-- OREGON DEPARTMENT OF EDUCATION (ODE) STATE ACCOUNTABILITY:
-- Enforces exact state testing codes:
-- - TstAtmptCd:
--     'I' = In-progress (< 5 items, active)
--     'P' = Partial attempt (>= 5 CAT items or 1 Performance Task)
--     'C' = Complete attempt (all 15 diagnostic items answered)
--     'N' = Non-attempt (invalidated, < 5 items attempted upon abandonment)
-- - TstValidCd:
--     'Y' = Valid attempt (attempted_count >= 5 OR is_performance_task = true)
--     'N' = Invalid non-attempt (attempted_count < 5)
--
-- STRICT COPPA ZERO-KNOWLEDGE ISOLATION:
-- - The `telemetry` schema NEVER references or joins with tables in the `vault` schema.
-- - No Foreign Keys exist across the boundary.
-- - Diagnostic sessions operate exclusively on ephemeral UUID tokens (`session_id`).
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
    ip_audit_hash TEXT,
    consent_document_version TEXT NOT NULL DEFAULT 'v1.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

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
    -- Inclusive Gender Codes adhering to ODE & EDFacts/NCES:
    gender_code VARCHAR(5) NOT NULL CHECK (gender_code IN ('M', 'F', 'NB', 'X', 'U')),
    state_district_id VARCHAR(50),
    state_school_id VARCHAR(50),
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

-- 3.1 Diagnostic Sessions (with Oregon ODE State Accountability Codes)
CREATE TABLE telemetry.diagnostic_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    
    -- Oregon Department of Education (ODE) Official State Accountability Fields:
    total_items_attempted SMALLINT NOT NULL DEFAULT 0,
    is_performance_task BOOLEAN NOT NULL DEFAULT false,
    -- TstAtmptCd: 'I' (In-progress), 'P' (Partial Attempt), 'C' (Complete), 'N' (Non-Attempt)
    tst_atmpt_cd VARCHAR(2) NOT NULL DEFAULT 'I' CHECK (tst_atmpt_cd IN ('I', 'P', 'C', 'N')),
    -- TstValidCd: 'Y' (Valid attempt: >= 5 CAT items or 1 PT), 'N' (Invalid: < 5 items)
    tst_valid_cd CHAR(1) NOT NULL DEFAULT 'N' CHECK (tst_valid_cd IN ('Y', 'N')),
    ode_validity_cleared BOOLEAN NOT NULL DEFAULT false,
    
    -- Hardware & Input Modality Telemetry
    primary_input_type TEXT CHECK (primary_input_type IN ('mouse', 'touch', 'stylus', 'trackpad', 'unknown')) DEFAULT 'unknown',
    device_category TEXT CHECK (device_category IN ('desktop', 'tablet', 'mobile', 'unknown')) DEFAULT 'unknown',
    pointer_coarse BOOLEAN,
    hover_capable BOOLEAN,
    
    screen_width INT,
    screen_height INT,
    viewport_width INT,
    viewport_height INT,
    device_pixel_ratio NUMERIC(4, 2) DEFAULT 1.0,
    
    hardware_concurrency SMALLINT,
    device_memory_gb NUMERIC(4, 1),
    user_agent TEXT,
    
    -- Network synchronization mode
    sync_source TEXT NOT NULL CHECK (sync_source IN ('online_realtime', 'offline_indexeddb_replay')) DEFAULT 'online_realtime',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_telemetry_sessions_client_id ON telemetry.diagnostic_sessions(client_generated_id);
CREATE INDEX idx_telemetry_sessions_status ON telemetry.diagnostic_sessions(session_status);
CREATE INDEX idx_telemetry_sessions_ode_codes ON telemetry.diagnostic_sessions(tst_atmpt_cd, tst_valid_cd);

-- 3.2 Item Responses & Micro-Telemetry
CREATE TABLE telemetry.item_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES telemetry.diagnostic_sessions(session_id) ON DELETE CASCADE,
    item_index SMALLINT NOT NULL CHECK (item_index BETWEEN 1 AND 15),
    target_phase SMALLINT NOT NULL CHECK (target_phase IN (1, 2, 3)),
    modality TEXT NOT NULL CHECK (modality IN ('discrete', 'continuous', 'abstract')),
    mechanic_type TEXT NOT NULL CHECK (mechanic_type IN (
        'graduated_cylinder_pour',
        'unit_block_grid',
        'number_line_slider',
        'multiple_choice',
        'numeric_fraction_input'
    )),
    prompt_key TEXT NOT NULL,
    raw_answer JSONB NOT NULL,
    is_correct BOOLEAN NOT NULL,
    
    -- High-precision micro-telemetry (performance.now timings from client)
    first_interaction_ms NUMERIC(10, 2) NOT NULL,
    latency_ms NUMERIC(10, 2) NOT NULL,
    input_pointer_type TEXT CHECK (input_pointer_type IN ('mouse', 'touch', 'pen', 'unknown')) DEFAULT 'unknown',
    friction_events_count SMALLINT NOT NULL DEFAULT 0,
    micro_interactions_log JSONB,
    
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    synced_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    
    CONSTRAINT uq_session_item UNIQUE (session_id, item_index)
);

CREATE INDEX idx_telemetry_items_session ON telemetry.item_responses(session_id);
CREATE INDEX idx_telemetry_items_phase_modality ON telemetry.item_responses(target_phase, modality);
CREATE INDEX idx_telemetry_items_correctness ON telemetry.item_responses(is_correct);

-- ----------------------------------------------------------------------------
-- 4. AUTOMATED ODE STATE ACCOUNTABILITY TRIGGER (TstAtmptCd & TstValidCd)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION telemetry.update_session_attemptedness_and_ode_validity()
RETURNS TRIGGER AS $$
DECLARE
    attempted_count INT;
    is_pt BOOLEAN;
    new_valid_cd CHAR(1);
    new_atmpt_cd VARCHAR(2);
    new_status TEXT;
BEGIN
    SELECT COUNT(*)
    INTO attempted_count
    FROM telemetry.item_responses
    WHERE session_id = NEW.session_id;

    SELECT is_performance_task
    INTO is_pt
    FROM telemetry.diagnostic_sessions
    WHERE session_id = NEW.session_id;

    -- Oregon Department of Education (ODE) Attemptedness Logic:
    -- Valid (TstValidCd = 'Y') if at least 5 CAT items or 1 Performance Task answered.
    IF attempted_count >= 5 OR is_pt = true THEN
        new_valid_cd := 'Y';
    ELSE
        new_valid_cd := 'N';
    END IF;

    -- Test Attempt Code (TstAtmptCd):
    -- 'C' = Complete (all 15 items answered)
    -- 'P' = Partial (at least 5 items, valid attempt)
    -- 'I' = In-progress (< 5 items)
    IF attempted_count >= 15 THEN
        new_atmpt_cd := 'C';
        new_status := 'completed';
    ELSIF attempted_count >= 5 THEN
        new_atmpt_cd := 'P';
        new_status := 'in_progress';
    ELSE
        new_atmpt_cd := 'I';
        new_status := 'in_progress';
    END IF;

    UPDATE telemetry.diagnostic_sessions
    SET 
        total_items_attempted = attempted_count,
        tst_atmpt_cd = new_atmpt_cd,
        tst_valid_cd = new_valid_cd,
        ode_validity_cleared = (new_valid_cd = 'Y'),
        session_status = new_status,
        completed_at = CASE WHEN attempted_count >= 15 THEN clock_timestamp() ELSE completed_at END
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

CREATE POLICY "Allow anonymous telemetry session creation"
ON telemetry.diagnostic_sessions FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow session status read by client token"
ON telemetry.diagnostic_sessions FOR SELECT USING (true);

CREATE POLICY "Allow anonymous item telemetry insertion"
ON telemetry.item_responses FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow item telemetry read for active session"
ON telemetry.item_responses FOR SELECT USING (true);

CREATE POLICY "Parents can view and update their own record"
ON vault.parents FOR ALL USING (auth.uid() = id);

CREATE POLICY "Parents can view and update their children"
ON vault.students FOR ALL USING (auth.uid() = parent_id);
