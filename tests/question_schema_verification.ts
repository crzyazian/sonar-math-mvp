/**
 * Verification Test: questions.json Schema & Structure Validation
 * 
 * Runs via Node 24:
 * node --experimental-strip-types tests/question_schema_verification.ts
 */

import * as fs from 'fs';
import * as path from 'path';

function validateQuestions() {
  console.log('================================================================');
  console.log('  QUESTION SCHEMA & PEDAGOGICAL STRUCTURE VALIDATION');
  console.log('================================================================\n');

  const filePath = path.resolve('src/data/questions.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`questions.json not found at: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);

  console.log(`Assessment ID: ${data.assessment_id}`);
  console.log(`Grade Level: ${data.grade_level}`);
  console.log(`Total Items Declared: ${data.total_items}`);
  console.log(`ODE Validity Threshold: ${data.ode_validity_threshold}\n`);

  if (!Array.isArray(data.questions)) {
    throw new Error('questions field must be an array.');
  }

  if (data.questions.length !== 15) {
    throw new Error(`Expected exactly 15 questions, found ${data.questions.length}.`);
  }

  const validPhases = new Set([1, 2, 3]);
  const validModalities = new Set(['discrete', 'continuous', 'abstract']);
  const validMechanics = new Set([
    'graduated_cylinder_pour',
    'unit_block_grid',
    'number_line_slider',
    'multiple_choice',
    'numeric_fraction_input',
  ]);

  console.log('--- VALIDATING FIRST 5 QUESTIONS (PROMPT 2 VALIDATION MILESTONE) ---');

  for (let i = 0; i < 5; i++) {
    const q = data.questions[i];
    console.log(`\n[Question ${q.item_index} - Phase ${q.target_phase} - ${q.modality.toUpperCase()}]`);
    console.log(`  Mechanic: ${q.mechanic_type}`);
    console.log(`  Prompt: "${q.prompt_text}"`);
    console.log(`  Correct Answer: ${q.correct_answer.display_string} (${q.correct_answer.normalized_value})`);
    console.log(`  SEDA Objective: ${q.pedagogical_objective}`);

    if (q.item_index !== i + 1) {
      throw new Error(`Item ${i + 1} has incorrect item_index: ${q.item_index}`);
    }
    if (!validPhases.has(q.target_phase)) {
      throw new Error(`Item ${q.item_index} has invalid target_phase: ${q.target_phase}`);
    }
    if (!validModalities.has(q.modality)) {
      throw new Error(`Item ${q.item_index} has invalid modality: ${q.modality}`);
    }
    if (!validMechanics.has(q.mechanic_type)) {
      throw new Error(`Item ${q.item_index} has invalid mechanic_type: ${q.mechanic_type}`);
    }
    if (!q.correct_answer || typeof q.correct_answer.normalized_value !== 'number') {
      throw new Error(`Item ${q.item_index} is missing normalized_value in correct_answer.`);
    }
    if (!q.mechanic_payload || q.mechanic_payload.type !== q.mechanic_type) {
      throw new Error(`Item ${q.item_index} mechanic_payload type mismatch.`);
    }

    // Specific mechanic config validations
    if (q.mechanic_type === 'graduated_cylinder_pour') {
      const cfg = q.mechanic_payload.config;
      if (typeof cfg.max_capacity_ml !== 'number' || typeof cfg.target_ratio !== 'number') {
        throw new Error(`Item ${q.item_index} graduated_cylinder config invalid.`);
      }
      if (cfg.snap_tolerance_ratio !== 0.02) {
        throw new Error(`Item ${q.item_index} must specify exactly 0.02 (±2%) snap tolerance.`);
      }
      console.log(`  ✓ Cylinder capacity: ${cfg.max_capacity_ml}mL | Snap tolerance: ${cfg.snap_tolerance_ratio * 100}%`);
    } else if (q.mechanic_type === 'unit_block_grid') {
      const cfg = q.mechanic_payload.config;
      if (cfg.total_cells !== cfg.grid_rows * cfg.grid_columns) {
        throw new Error(`Item ${q.item_index} grid rows x columns does not equal total_cells.`);
      }
      console.log(`  ✓ Grid: ${cfg.grid_rows}x${cfg.grid_columns} (${cfg.total_cells} cells) | Target count: ${cfg.target_cell_count}`);
    } else if (q.mechanic_type === 'multiple_choice') {
      const cfg = q.mechanic_payload.config;
      if (!Array.isArray(cfg.options) || cfg.options.length < 2) {
        throw new Error(`Item ${q.item_index} multiple choice needs at least 2 options.`);
      }
      console.log(`  ✓ Multiple choice options: ${cfg.options.length} options with distractor rationales`);
    }
  }

  console.log('\n--- VALIDATING REMAINING ITEMS (ITEMS 6 TO 15) ---');
  for (let i = 5; i < 15; i++) {
    const q = data.questions[i];
    if (q.item_index !== i + 1) throw new Error(`Item ${i + 1} item_index mismatch.`);
    if (!validPhases.has(q.target_phase)) throw new Error(`Item ${q.item_index} invalid phase.`);
    if (!validModalities.has(q.modality)) throw new Error(`Item ${q.item_index} invalid modality.`);
    if (!validMechanics.has(q.mechanic_type)) throw new Error(`Item ${q.item_index} invalid mechanic.`);
    if (!q.correct_answer) throw new Error(`Item ${q.item_index} missing answer.`);
    if (!q.mechanic_payload) throw new Error(`Item ${q.item_index} missing mechanic payload.`);
  }

  // Distribution audit
  const phases = { 1: 0, 2: 0, 3: 0 };
  const modalities = { discrete: 0, continuous: 0, abstract: 0 };
  for (const q of data.questions) {
    phases[q.target_phase as 1 | 2 | 3]++;
    modalities[q.modality as 'discrete' | 'continuous' | 'abstract']++;
  }

  console.log('\n--- PSYCHOMETRIC & TAXONOMY BALANCE AUDIT ---');
  console.log(`  Phase 1 (Foundation/Equivalence): ${phases[1]} items`);
  console.log(`  Phase 2 (Operations/Mixed):       ${phases[2]} items`);
  console.log(`  Phase 3 (Multiplication/Compare): ${phases[3]} items`);
  console.log(`  Discrete Modality:   ${modalities.discrete} items`);
  console.log(`  Continuous Modality: ${modalities.continuous} items`);
  console.log(`  Abstract Modality:   ${modalities.abstract} items`);

  console.log('\n================================================================');
  console.log('  QUESTIONS.JSON VALIDATION COMPLETED SUCCESSFULLY!');
  console.log('================================================================');
}

validateQuestions();
