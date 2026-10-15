/**
 * Question Schema Specification: Sonar Math MVP
 * 
 * Strict data contract for the 4th-Grade Fractions Diagnostic Assessment.
 * Ensures zero math logic is hardcoded inside UI components.
 */

export type TargetPhase = 1 | 2 | 3;

export type QuestionModality = 'discrete' | 'continuous' | 'abstract';

export type MechanicType =
  | 'graduated_cylinder_pour'
  | 'unit_block_grid'
  | 'number_line_slider'
  | 'multiple_choice'
  | 'numeric_fraction_input';

export interface GraduatedCylinderConfig {
  max_capacity_ml: number;
  tick_interval_ml: number;
  major_ticks: number[];
  target_volume_ml: number;
  target_ratio: number; // e.g. 0.75 for 3/4
  target_fraction: { numerator: number; denominator: number };
  snap_tolerance_ratio: number; // default 0.02 (±2%)
  liquid_color?: string;
  unit_label: string; // e.g. "mL"
}

export interface UnitBlockGridConfig {
  grid_rows: number;
  grid_columns: number;
  total_cells: number;
  target_fraction: { numerator: number; denominator: number };
  target_cell_count: number;
  action_mode: 'select_and_shade' | 'group_and_partition' | 'cross_out';
  initial_highlighted_cells?: number[];
  initial_crossed_out_cells?: number[];
}

export interface NumberLineConfig {
  min_value: number;
  max_value: number;
  step_fraction: { numerator: number; denominator: number }; // e.g. 1/8
  target_fraction: { numerator: number; denominator: number };
  target_decimal: number;
  snap_tolerance: number; // in fraction units
}

export interface MultipleChoiceConfig {
  options: Array<{
    id: string;
    text: string;
    fraction_display?: { numerator: number; denominator: number };
    svg_representation?: string;
    distractor_rationale?: string;
  }>;
}

export interface NumericInputConfig {
  require_simplified: boolean;
  allow_mixed_number: boolean;
  target_numerator: number;
  target_denominator: number;
  target_whole?: number;
}

export interface IsomorphicVariant {
  variant_id: string;
  prompt_text: string;
  sub_text?: string;
  target_fraction: { numerator: number; denominator: number };
  target_normalized: number;
  mechanic_payload: MechanicConfig;
}

export interface MetacognitiveFeedback {
  item_index: number;
  selected_misconception_tag:
    | 'conceptual_fractions_different_denominators'
    | 'motor_slip_or_touch_error'
    | 'misread_or_unclear_prompt'
    | 'wild_guess'
    | 'other';
  student_reflection_note?: string;
  isomorphic_retry_attempted: boolean;
  isomorphic_retry_correct?: boolean;
}

export type MechanicConfig =
  | { type: 'graduated_cylinder_pour'; config: GraduatedCylinderConfig }
  | { type: 'unit_block_grid'; config: UnitBlockGridConfig }
  | { type: 'number_line_slider'; config: NumberLineConfig }
  | { type: 'multiple_choice'; config: MultipleChoiceConfig }
  | { type: 'numeric_fraction_input'; config: NumericInputConfig };

export interface DiagnosticQuestion {
  item_index: number; // 1 to 15
  target_phase: TargetPhase; // 1: Foundation/Equivalence, 2: Operations/Mixed, 3: Advanced/Multiplication
  modality: QuestionModality; // discrete, continuous, abstract
  mechanic_type: MechanicType;
  prompt_text: string;
  sub_text?: string;
  correct_answer: {
    display_string: string;
    normalized_value: number; // float value for numerical comparisons
    fraction?: { numerator: number; denominator: number; whole?: number };
    acceptable_margin?: number; // e.g. 0.02 for continuous mechanics
    exact_match?: string | number | number[];
  };
  mechanic_payload: MechanicConfig;
  seda_domain: '4.NF.A (Equivalence)' | '4.NF.B (Operations)' | '4.NF.C (Decimals/Benchmarks)';
  pedagogical_objective: string;
  isomorphic_variant?: IsomorphicVariant;
}

export interface QuestionsPayload {
  assessment_id: string;
  version: string;
  grade_level: 4;
  domain: string;
  total_items: 15;
  ode_validity_threshold: 5;
  questions: DiagnosticQuestion[];
}
