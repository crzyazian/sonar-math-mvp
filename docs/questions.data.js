window.SONAR_QUESTIONS = {
  "assessment_id": "4NF_FRACTIONS_DIAGNOSTIC_V1",
  "version": "1.0.0",
  "grade_level": 4,
  "domain": "Common Core State Standards / Oregon Department of Education (CCSS.MATH.CONTENT.4.NF)",
  "total_items": 15,
  "ode_validity_threshold": 5,
  "questions": [
    {
      "item_index": 1,
      "target_phase": 1,
      "modality": "continuous",
      "mechanic_type": "graduated_cylinder_pour",
      "prompt_text": "Pour water into the container until it is 3/4 full.",
      "sub_text": "Drag up to fill the water. Let go when it reaches 3/4.",
      "correct_answer": {
        "display_string": "3/4",
        "normalized_value": 0.75,
        "fraction": {
          "numerator": 3,
          "denominator": 4
        },
        "acceptable_margin": 0.02
      },
      "mechanic_payload": {
        "type": "graduated_cylinder_pour",
        "config": {
          "max_capacity_ml": 1000,
          "tick_interval_ml": 50,
          "major_ticks": [0, 250, 500, 750, 1000],
          "target_volume_ml": 750,
          "target_ratio": 0.75,
          "target_fraction": {
            "numerator": 3,
            "denominator": 4
          },
          "snap_tolerance_ratio": 0.02,
          "liquid_color": "#2563EB",
          "unit_label": "mL"
        }
      },
      "seda_domain": "4.NF.A (Equivalence)",
      "pedagogical_objective": "Benchmark visual identification of three-fourths in a continuous volume manipulative."
    },
    {
      "item_index": 2,
      "target_phase": 1,
      "modality": "discrete",
      "mechanic_type": "unit_block_grid",
      "prompt_text": "Shade blocks to show 2/3 of the rectangle.",
      "sub_text": "Tap the boxes to color them in.",
      "correct_answer": {
        "display_string": "8/12 (equivalent to 2/3)",
        "normalized_value": 0.6667,
        "fraction": {
          "numerator": 8,
          "denominator": 12
        },
        "exact_match": 8
      },
      "mechanic_payload": {
        "type": "unit_block_grid",
        "config": {
          "grid_rows": 3,
          "grid_columns": 4,
          "total_cells": 12,
          "target_fraction": {
            "numerator": 2,
            "denominator": 3
          },
          "target_cell_count": 8,
          "action_mode": "select_and_shade",
          "initial_highlighted_cells": []
        }
      },
      "seda_domain": "4.NF.A (Equivalence)",
      "pedagogical_objective": "Partitioning discrete area models to establish fraction equivalence across different denominators."
    },
    {
      "item_index": 3,
      "target_phase": 1,
      "modality": "continuous",
      "mechanic_type": "number_line_slider",
      "prompt_text": "Slide the dot to 5/8 on the number line.",
      "sub_text": "Move the slider between 0 and 1.",
      "correct_answer": {
        "display_string": "5/8",
        "normalized_value": 0.625,
        "fraction": {
          "numerator": 5,
          "denominator": 8
        },
        "acceptable_margin": 0.02
      },
      "mechanic_payload": {
        "type": "number_line_slider",
        "config": {
          "min_value": 0.0,
          "max_value": 1.0,
          "step_fraction": {
            "numerator": 1,
            "denominator": 8
          },
          "target_fraction": {
            "numerator": 5,
            "denominator": 8
          },
          "target_decimal": 0.625,
          "snap_tolerance": 0.02
        }
      },
      "seda_domain": "4.NF.A (Equivalence)",
      "pedagogical_objective": "Spatial placement of non-unit fractions on a continuous 1D interval."
    },
    {
      "item_index": 4,
      "target_phase": 1,
      "modality": "discrete",
      "mechanic_type": "unit_block_grid",
      "prompt_text": "Start with 1 whole bar (10 blocks). Cross out 3/10.",
      "sub_text": "Tap blocks to put an X on them. How many are left?",
      "correct_answer": {
        "display_string": "7/10",
        "normalized_value": 0.7,
        "fraction": {
          "numerator": 7,
          "denominator": 10
        },
        "exact_match": 3
      },
      "mechanic_payload": {
        "type": "unit_block_grid",
        "config": {
          "grid_rows": 1,
          "grid_columns": 10,
          "total_cells": 10,
          "target_fraction": {
            "numerator": 7,
            "denominator": 10
          },
          "target_cell_count": 7,
          "action_mode": "cross_out",
          "initial_highlighted_cells": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
        }
      },
      "seda_domain": "4.NF.B (Operations)",
      "pedagogical_objective": "Subtracting a unit-based fraction from a whole using discrete crossing-out action."
    },
    {
      "item_index": 5,
      "target_phase": 1,
      "modality": "abstract",
      "mechanic_type": "multiple_choice",
      "prompt_text": "Which fraction is equal to 2/4?",
      "sub_text": "Choose the best answer.",
      "correct_answer": {
        "display_string": "1/2",
        "normalized_value": 0.5,
        "fraction": {
          "numerator": 1,
          "denominator": 2
        },
        "exact_match": "opt_a"
      },
      "mechanic_payload": {
        "type": "multiple_choice",
        "config": {
          "options": [
            {
              "id": "opt_a",
              "text": "1/2",
              "fraction_display": {
                "numerator": 1,
                "denominator": 2
              },
              "distractor_rationale": "Correct benchmark simplification (dividing numerator and denominator by 2)."
            },
            {
              "id": "opt_b",
              "text": "2/3",
              "fraction_display": {
                "numerator": 2,
                "denominator": 3
              },
              "distractor_rationale": "Misconception: Keeping numerator identical while modifying denominator."
            },
            {
              "id": "opt_c",
              "text": "4/6",
              "fraction_display": {
                "numerator": 4,
                "denominator": 6
              },
              "distractor_rationale": "Misconception: Adding 2 to numerator and denominator rather than multiplying."
            },
            {
              "id": "opt_d",
              "text": "3/8",
              "fraction_display": {
                "numerator": 3,
                "denominator": 8
              },
              "distractor_rationale": "Arbitrary fraction distractor."
            }
          ]
        }
      },
      "seda_domain": "4.NF.A (Equivalence)",
      "pedagogical_objective": "Abstract symbolic identification of benchmark half-equivalence."
    },
    {
      "item_index": 6,
      "target_phase": 2,
      "modality": "continuous",
      "mechanic_type": "graduated_cylinder_pour",
      "prompt_text": "Add the two liquids: pour 1/6 + 3/6 into the container.",
      "sub_text": "Add the fractions together and fill the water.",
      "correct_answer": {
        "display_string": "4/6 (or 2/3)",
        "normalized_value": 0.6667,
        "fraction": {
          "numerator": 4,
          "denominator": 6
        },
        "acceptable_margin": 0.02
      },
      "mechanic_payload": {
        "type": "graduated_cylinder_pour",
        "config": {
          "max_capacity_ml": 600,
          "tick_interval_ml": 50,
          "major_ticks": [0, 100, 200, 300, 400, 500, 600],
          "target_volume_ml": 400,
          "target_ratio": 0.6667,
          "target_fraction": {
            "numerator": 4,
            "denominator": 6
          },
          "snap_tolerance_ratio": 0.02,
          "liquid_color": "#0D9488",
          "unit_label": "mL"
        }
      },
      "seda_domain": "4.NF.B (Operations)",
      "pedagogical_objective": "Visual continuous addition of fractions with identical denominators."
    },
    {
      "item_index": 7,
      "target_phase": 2,
      "modality": "discrete",
      "mechanic_type": "unit_block_grid",
      "prompt_text": "Solve 7/8 - 3/8 on the bar.",
      "sub_text": "Cross out 3 of the shaded blocks to find what is left.",
      "correct_answer": {
        "display_string": "4/8 (or 1/2)",
        "normalized_value": 0.5,
        "fraction": {
          "numerator": 4,
          "denominator": 8
        },
        "exact_match": 4
      },
      "mechanic_payload": {
        "type": "unit_block_grid",
        "config": {
          "grid_rows": 1,
          "grid_columns": 8,
          "total_cells": 8,
          "target_fraction": {
            "numerator": 4,
            "denominator": 8
          },
          "target_cell_count": 4,
          "action_mode": "cross_out",
          "initial_highlighted_cells": [0, 1, 2, 3, 4, 5, 6]
        }
      },
      "seda_domain": "4.NF.B (Operations)",
      "pedagogical_objective": "Decomposition and subtraction of like fractions on a discrete unit bar."
    },
    {
      "item_index": 8,
      "target_phase": 2,
      "modality": "abstract",
      "mechanic_type": "numeric_fraction_input",
      "prompt_text": "Add: 4/12 + 5/12 = ?",
      "sub_text": "Type the top number (numerator) and bottom number (denominator).",
      "correct_answer": {
        "display_string": "9/12 (or 3/4)",
        "normalized_value": 0.75,
        "fraction": {
          "numerator": 9,
          "denominator": 12
        }
      },
      "mechanic_payload": {
        "type": "numeric_fraction_input",
        "config": {
          "require_simplified": false,
          "allow_mixed_number": false,
          "target_numerator": 9,
          "target_denominator": 12
        }
      },
      "seda_domain": "4.NF.B (Operations)",
      "pedagogical_objective": "Direct symbolic addition of like-denominator fractions."
    },
    {
      "item_index": 9,
      "target_phase": 2,
      "modality": "continuous",
      "mechanic_type": "number_line_slider",
      "prompt_text": "Find 1 1/4 on the number line.",
      "sub_text": "Slide the dot past 1 to 1 1/4.",
      "correct_answer": {
        "display_string": "1 1/4 (or 5/4)",
        "normalized_value": 1.25,
        "fraction": {
          "whole": 1,
          "numerator": 1,
          "denominator": 4
        },
        "acceptable_margin": 0.02
      },
      "mechanic_payload": {
        "type": "number_line_slider",
        "config": {
          "min_value": 0.0,
          "max_value": 2.0,
          "step_fraction": {
            "numerator": 1,
            "denominator": 4
          },
          "target_fraction": {
            "numerator": 5,
            "denominator": 4
          },
          "target_decimal": 1.25,
          "snap_tolerance": 0.02
        }
      },
      "seda_domain": "4.NF.B (Operations)",
      "pedagogical_objective": "Recognizing mixed numbers beyond the unit interval on a continuous continuum."
    },
    {
      "item_index": 10,
      "target_phase": 2,
      "modality": "discrete",
      "mechanic_type": "multiple_choice",
      "prompt_text": "A pizza has 8 equal slices. Alex eats 2 slices and Jordan eats 3 slices. What fraction of the pizza is left?",
      "sub_text": "Choose the fraction that is left.",
      "correct_answer": {
        "display_string": "3/8",
        "normalized_value": 0.375,
        "fraction": {
          "numerator": 3,
          "denominator": 8
        },
        "exact_match": "opt_a"
      },
      "mechanic_payload": {
        "type": "multiple_choice",
        "config": {
          "options": [
            {
              "id": "opt_a",
              "text": "3/8",
              "fraction_display": {
                "numerator": 3,
                "denominator": 8
              },
              "distractor_rationale": "Correct calculation: 8/8 - (2/8 + 3/8) = 3/8 remaining."
            },
            {
              "id": "opt_b",
              "text": "5/8",
              "fraction_display": {
                "numerator": 5,
                "denominator": 8
              },
              "distractor_rationale": "Common misconception: Calculating total eaten rather than remaining."
            },
            {
              "id": "opt_c",
              "text": "4/8",
              "fraction_display": {
                "numerator": 4,
                "denominator": 8
              },
              "distractor_rationale": "Arithmetic slip: 8 - 5 = 4."
            },
            {
              "id": "opt_d",
              "text": "1/8",
              "fraction_display": {
                "numerator": 1,
                "denominator": 8
              },
              "distractor_rationale": "Arbitrary distractor."
            }
          ]
        }
      },
      "seda_domain": "4.NF.B (Operations)",
      "pedagogical_objective": "Two-step word problem decomposing fractions of a discrete whole."
    },
    {
      "item_index": 11,
      "target_phase": 3,
      "modality": "discrete",
      "mechanic_type": "unit_block_grid",
      "prompt_text": "Show 3 groups of 2/6 using the blocks.",
      "sub_text": "Color in the blocks to show 3 times 2/6.",
      "correct_answer": {
        "display_string": "6/6 (1 whole)",
        "normalized_value": 1.0,
        "fraction": {
          "numerator": 6,
          "denominator": 6
        },
        "exact_match": 6
      },
      "mechanic_payload": {
        "type": "unit_block_grid",
        "config": {
          "grid_rows": 2,
          "grid_columns": 3,
          "total_cells": 6,
          "target_fraction": {
            "numerator": 6,
            "denominator": 6
          },
          "target_cell_count": 6,
          "action_mode": "select_and_shade",
          "initial_highlighted_cells": []
        }
      },
      "seda_domain": "4.NF.B (Operations)",
      "pedagogical_objective": "Interpreting multiplication of a whole number by a fraction as repeated equal groups."
    },
    {
      "item_index": 12,
      "target_phase": 3,
      "modality": "continuous",
      "mechanic_type": "graduated_cylinder_pour",
      "prompt_text": "Pour 4 times 1/5 of a liter (4 x 1/5 L) into the container.",
      "sub_text": "Fill the container to show 4 x 1/5 L.",
      "correct_answer": {
        "display_string": "4/5 L (800 mL)",
        "normalized_value": 0.8,
        "fraction": {
          "numerator": 4,
          "denominator": 5
        },
        "acceptable_margin": 0.02
      },
      "mechanic_payload": {
        "type": "graduated_cylinder_pour",
        "config": {
          "max_capacity_ml": 1000,
          "tick_interval_ml": 50,
          "major_ticks": [0, 200, 400, 600, 800, 1000],
          "target_volume_ml": 800,
          "target_ratio": 0.8,
          "target_fraction": {
            "numerator": 4,
            "denominator": 5
          },
          "snap_tolerance_ratio": 0.02,
          "liquid_color": "#7C3AED",
          "unit_label": "mL"
        }
      },
      "seda_domain": "4.NF.B (Operations)",
      "pedagogical_objective": "Continuous measurement representation of fraction multiplication."
    },
    {
      "item_index": 13,
      "target_phase": 3,
      "modality": "abstract",
      "mechanic_type": "numeric_fraction_input",
      "prompt_text": "Multiply: 5 x 2/3. Write your answer as a fraction.",
      "sub_text": "Type the top number and bottom number.",
      "correct_answer": {
        "display_string": "10/3",
        "normalized_value": 3.3333,
        "fraction": {
          "numerator": 10,
          "denominator": 3
        }
      },
      "mechanic_payload": {
        "type": "numeric_fraction_input",
        "config": {
          "require_simplified": false,
          "allow_mixed_number": true,
          "target_numerator": 10,
          "target_denominator": 3,
          "target_whole": 3
        }
      },
      "seda_domain": "4.NF.B (Operations)",
      "pedagogical_objective": "Symbolic computation multiplying whole numbers by non-unit fractions (5 x 2/3 = 10/3)."
    },
    {
      "item_index": 14,
      "target_phase": 3,
      "modality": "continuous",
      "mechanic_type": "number_line_slider",
      "prompt_text": "Which fraction is bigger: 3/4 or 5/6? Slide the dot to the GREATER fraction.",
      "sub_text": "Move the slider to the fraction that is greater.",
      "correct_answer": {
        "display_string": "5/6 (approximately 0.833)",
        "normalized_value": 0.8333,
        "fraction": {
          "numerator": 5,
          "denominator": 6
        },
        "acceptable_margin": 0.025
      },
      "mechanic_payload": {
        "type": "number_line_slider",
        "config": {
          "min_value": 0.5,
          "max_value": 1.0,
          "step_fraction": {
            "numerator": 1,
            "denominator": 12
          },
          "target_fraction": {
            "numerator": 5,
            "denominator": 6
          },
          "target_decimal": 0.8333,
          "snap_tolerance": 0.025
        }
      },
      "seda_domain": "4.NF.A (Equivalence)",
      "pedagogical_objective": "Comparative ordering of non-like denominator fractions (9/12 vs 10/12) on an interval."
    },
    {
      "item_index": 15,
      "target_phase": 3,
      "modality": "abstract",
      "mechanic_type": "multiple_choice",
      "prompt_text": "Which problem gives the same answer as 4 x 3/8?",
      "sub_text": "Choose the correct answer.",
      "correct_answer": {
        "display_string": "12/8 (or 1 4/8)",
        "normalized_value": 1.5,
        "fraction": {
          "numerator": 12,
          "denominator": 8
        },
        "exact_match": "opt_c"
      },
      "mechanic_payload": {
        "type": "multiple_choice",
        "config": {
          "options": [
            {
              "id": "opt_a",
              "text": "7/8",
              "fraction_display": {
                "numerator": 7,
                "denominator": 8
              },
              "distractor_rationale": "Misconception: Adding 4 + 3 instead of multiplying 4 x 3."
            },
            {
              "id": "opt_b",
              "text": "12/32",
              "fraction_display": {
                "numerator": 12,
                "denominator": 32
              },
              "distractor_rationale": "Misconception: Multiplying both numerator and denominator by 4."
            },
            {
              "id": "opt_c",
              "text": "12/8",
              "fraction_display": {
                "numerator": 12,
                "denominator": 8
              },
              "distractor_rationale": "Correct application: (4 x 3) / 8 = 12/8."
            },
            {
              "id": "opt_d",
              "text": "3/32",
              "fraction_display": {
                "numerator": 3,
                "denominator": 32
              },
              "distractor_rationale": "Misconception: Dividing or multiplying denominator only."
            }
          ]
        }
      },
      "seda_domain": "4.NF.B (Operations)",
      "pedagogical_objective": "Evaluating conceptual and symbolic understanding of whole number x fraction arithmetic."
    }
  ]
}
;
