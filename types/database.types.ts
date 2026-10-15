/**
 * Database Types: Sonar Math MVP
 * 
 * Strict COPPA Zero-Knowledge Boundary:
 * - `vault`: PII, COPPA consent records, student demographic profiles (supporting inclusive gender codes).
 * - `telemetry`: Ephemeral diagnostic session and micro-telemetry response data.
 * 
 * Note: Under COPPA (16 CFR Part 312) & FERPA compliance standards, no join relationships exist 
 * between the `vault` and `telemetry` schemas.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ----------------------------------------------------------------------------
// VAULT SCHEMA TYPES (PII & CONSENT)
// ----------------------------------------------------------------------------

export type ConsentStatus = 'pending' | 'granted' | 'revoked' | 'expired';

export type ConsentMechanism =
  | 'credit_card_verification'
  | 'digital_signature'
  | 'video_conference'
  | 'government_id'
  | 'email_plus_verification'
  | 'school_loco_parentis';

/**
 * Inclusive Gender Codes adhering to:
 * - Oregon Department of Education (ODE) reporting rules
 * - Federal EDFacts / NCES demographic standards
 */
export type GenderCode =
  | 'M'   // Male
  | 'F'   // Female
  | 'NB'  // Non-Binary
  | 'X'   // Non-Binary / Another Gender Identity
  | 'U';  // Unspecified / Prefer not to state

export interface ParentRecord {
  id: string; // UUID
  email: string;
  first_name: string;
  last_name: string;
  phone_number?: string | null;
  consent_status: ConsentStatus;
  consent_timestamp?: string | null;
  consent_mechanism: ConsentMechanism;
  ip_audit_hash?: string | null;
  consent_document_version: string;
  created_at: string;
  updated_at: string;
}

export interface StudentRecord {
  id: string; // UUID
  parent_id: string; // References vault.parents(id)
  first_name: string;
  last_name: string;
  birth_date: string; // YYYY-MM-DD
  grade_level: number; // 0 (Kindergarten) to 12
  gender_code: GenderCode;
  state_district_id?: string | null;
  state_school_id?: string | null;
  seda_locale_code?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// TELEMETRY SCHEMA TYPES (ZERO-KNOWLEDGE ASSESSMENT ENGINE)
// ----------------------------------------------------------------------------

export type SessionStatus =
  | 'initialized'
  | 'in_progress'
  | 'completed'
  | 'abandoned'
  | 'invalidated';

export type DeviceCategory = 'tablet' | 'desktop' | 'mobile' | 'unknown';

export type SyncSource = 'online_realtime' | 'offline_indexeddb_replay';

export type DiagnosticModality = 'discrete' | 'continuous' | 'abstract';

export type MechanicType =
  | 'graduated_cylinder_pour'
  | 'unit_block_grid'
  | 'number_line_slider'
  | 'multiple_choice'
  | 'numeric_fraction_input';

export interface GraduatedCylinderAnswerPayload {
  target_volume_ml: number;
  poured_volume_ml: number;
  fill_ratio: number; // e.g. 0.75 for 3/4
  snap_applied: boolean;
  raw_pour_ratio: number;
}

export interface UnitBlockGridAnswerPayload {
  total_cells: number;
  highlighted_cells: number[];
  crossed_out_cells?: number[];
  fraction_represented: { numerator: number; denominator: number };
}

export interface GenericAnswerPayload {
  value: string | number;
  [key: string]: Json | undefined;
}

export type RawAnswerPayload =
  | GraduatedCylinderAnswerPayload
  | UnitBlockGridAnswerPayload
  | GenericAnswerPayload;

export interface MicroInteractionEvent {
  timestamp_ms: number;
  event_type: 'pointerdown' | 'pointermove' | 'pointerup' | 'snap_trigger' | 'reset';
  x?: number;
  y?: number;
  value?: number;
  friction_flag?: boolean;
}

export interface DiagnosticSessionRecord {
  session_id: string; // UUID
  client_generated_id: string; // Ephemeral UUID from IndexedDB client queue
  assessment_code: string;
  target_grade: number;
  started_at: string;
  completed_at?: string | null;
  session_status: SessionStatus;
  /** Total attempted items (ODE requirement: assessments < 5 items are invalidated) */
  total_items_attempted: number;
  ode_validity_cleared: boolean;
  device_category: DeviceCategory;
  viewport_width?: number | null;
  viewport_height?: number | null;
  user_agent?: string | null;
  sync_source: SyncSource;
  created_at: string;
}

export interface ItemResponseRecord {
  id: string; // UUID
  session_id: string; // References telemetry.diagnostic_sessions(session_id)
  item_index: number; // 1 to 15
  target_phase: 1 | 2 | 3;
  modality: DiagnosticModality;
  mechanic_type: MechanicType;
  prompt_key: string;
  raw_answer: RawAnswerPayload;
  is_correct: boolean;
  /** High precision latency from item mount to first user input (ms) */
  first_interaction_ms: number;
  /** Total item completion latency from mount to submission (ms) */
  latency_ms: number;
  friction_events_count: number;
  micro_interactions_log?: MicroInteractionEvent[] | null;
  submitted_at: string;
  synced_at: string;
}

// ----------------------------------------------------------------------------
// FULL SUPABASE DATABASE SCHEMA INTERFACE
// ----------------------------------------------------------------------------

export interface Database {
  vault: {
    Tables: {
      parents: {
        Row: ParentRecord;
        Insert: Omit<ParentRecord, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ParentRecord, 'id'>>;
      };
      students: {
        Row: StudentRecord;
        Insert: Omit<StudentRecord, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<StudentRecord, 'id'>>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
  telemetry: {
    Tables: {
      diagnostic_sessions: {
        Row: DiagnosticSessionRecord;
        Insert: Omit<DiagnosticSessionRecord, 'session_id' | 'created_at' | 'total_items_attempted' | 'ode_validity_cleared'> & {
          session_id?: string;
          total_items_attempted?: number;
          ode_validity_cleared?: boolean;
          created_at?: string;
        };
        Update: Partial<Omit<DiagnosticSessionRecord, 'session_id'>>;
      };
      item_responses: {
        Row: ItemResponseRecord;
        Insert: Omit<ItemResponseRecord, 'id' | 'submitted_at' | 'synced_at'> & {
          id?: string;
          submitted_at?: string;
          synced_at?: string;
        };
        Update: Partial<Omit<ItemResponseRecord, 'id'>>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      update_session_attemptedness_and_ode_validity: {
        Args: Record<string, never>;
        Returns: unknown;
      };
    };
  };
}

// ----------------------------------------------------------------------------
// OFFLINE SYNC & INDEXEDDB CACHE TYPES
// ----------------------------------------------------------------------------

export interface OfflineQueuedItemResponse {
  client_queue_id: string;
  session_client_id: string;
  item_index: number;
  target_phase: 1 | 2 | 3;
  modality: DiagnosticModality;
  mechanic_type: MechanicType;
  prompt_key: string;
  raw_answer: RawAnswerPayload;
  is_correct: boolean;
  first_interaction_ms: number;
  latency_ms: number;
  friction_events_count: number;
  micro_interactions_log?: MicroInteractionEvent[];
  client_timestamp: number;
  synced: boolean;
  retry_count: number;
}
