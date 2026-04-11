// =====================================================
// SETUP VALIDATOR — schema checks for setup definitions
// =====================================================
// Validates setup objects before they enter the registry.
// Returns an array of error strings (empty = valid).
// =====================================================

const VALID_TYPES = ["pair", "basket", "standalone", "stack_reversal", "infra_follower"];

// -------------------------------------------------
// TYPE-SPECIFIC FIELD REQUIREMENTS
// -------------------------------------------------

const TYPE_RULES = {
  pair: {
    required: ["leader", "follower", "targets", "stop"],
    validate(setup) {
      const errors = [];
      if (!setup.leader?.symbol) errors.push("pair: leader.symbol is required");
      if (!setup.follower?.symbol) errors.push("pair: follower.symbol is required");
      if (!Array.isArray(setup.targets) || setup.targets.length === 0) errors.push("pair: targets must be a non-empty array");
      if (typeof setup.stop !== "number" || setup.stop <= 0) errors.push("pair: stop must be a positive number");
      if (setup.targets && setup.stop && setup.targets.some((t) => t <= setup.stop)) {
        errors.push("pair: all targets must be above stop level");
      }
      return errors;
    },
  },

  basket: {
    required: ["leader", "drivers"],
    validate(setup) {
      const errors = [];
      if (!setup.leader?.symbol) errors.push("basket: leader.symbol is required");
      if (!Array.isArray(setup.drivers) || setup.drivers.length === 0) errors.push("basket: drivers must be a non-empty array");
      if (setup.drivers?.some((d) => typeof d !== "string")) errors.push("basket: each driver must be a symbol string");
      return errors;
    },
  },

  standalone: {
    required: ["leader"],
    validate(setup) {
      const errors = [];
      if (!setup.leader?.symbol) errors.push("standalone: leader.symbol is required");
      return errors;
    },
  },

  stack_reversal: {
    required: ["leader", "powerGroup", "followerGroup"],
    validate(setup) {
      const errors = [];
      if (!setup.leader?.symbol) errors.push("stack_reversal: leader.symbol is required");
      if (!Array.isArray(setup.powerGroup) || setup.powerGroup.length === 0) errors.push("stack_reversal: powerGroup must be a non-empty array");
      if (!Array.isArray(setup.followerGroup) || setup.followerGroup.length === 0) errors.push("stack_reversal: followerGroup must be a non-empty array");

      const t = setup.thresholds;
      if (t) {
        if (t.minPowerStrength !== undefined && (t.minPowerStrength < 0 || t.minPowerStrength > 1)) {
          errors.push("stack_reversal: thresholds.minPowerStrength must be 0-1");
        }
        if (t.earlyMinDist !== undefined && t.earlyMaxDist !== undefined && t.earlyMinDist >= t.earlyMaxDist) {
          errors.push("stack_reversal: thresholds.earlyMinDist must be < earlyMaxDist");
        }
      }
      return errors;
    },
  },

  infra_follower: {
    required: ["follower", "aiLeaders", "infraDrivers"],
    validate(setup) {
      const errors = [];
      if (!setup.follower?.symbol) errors.push("infra_follower: follower.symbol is required");
      if (!Array.isArray(setup.aiLeaders) || setup.aiLeaders.length === 0) errors.push("infra_follower: aiLeaders must be a non-empty array");
      if (!Array.isArray(setup.infraDrivers) || setup.infraDrivers.length === 0) errors.push("infra_follower: infraDrivers must be a non-empty array");

      const t = setup.thresholds;
      if (t) {
        if (t.lagThreshold !== undefined && t.lagThreshold <= 0) errors.push("infra_follower: thresholds.lagThreshold must be positive");
        if (t.stopPct !== undefined && (t.stopPct <= 0 || t.stopPct > 0.5)) errors.push("infra_follower: thresholds.stopPct must be 0-0.5");
        if (t.targetsPct !== undefined) {
          if (!Array.isArray(t.targetsPct) || t.targetsPct.length === 0) errors.push("infra_follower: thresholds.targetsPct must be a non-empty array");
          if (t.targetsPct?.some((p) => p <= 0 || p > 1)) errors.push("infra_follower: each targetsPct must be 0-1");
        }
      }
      return errors;
    },
  },
};

// -------------------------------------------------
// MAIN VALIDATOR
// -------------------------------------------------

/**
 * Validate a setup object.
 * @param {object} setup — the setup to validate
 * @returns {string[]} — array of error messages (empty = valid)
 */
export function validateSetup(setup) {
  const errors = [];

  // Base fields
  if (!setup || typeof setup !== "object") {
    return ["Setup must be a non-null object"];
  }

  if (!setup.id || typeof setup.id !== "string") {
    errors.push("id is required and must be a string");
  }

  if (!setup.type || !VALID_TYPES.includes(setup.type)) {
    errors.push(`type must be one of: ${VALID_TYPES.join(", ")}`);
    return errors; // can't continue without valid type
  }

  if (typeof setup.enabled !== "boolean") {
    errors.push("enabled must be a boolean");
  }

  if (typeof setup.capital !== "number" || setup.capital <= 0) {
    errors.push("capital must be a positive number");
  }

  // Type-specific validation
  const rule = TYPE_RULES[setup.type];
  if (rule) {
    // Check required fields exist
    for (const field of rule.required) {
      if (setup[field] === undefined || setup[field] === null) {
        errors.push(`${setup.type}: ${field} is required`);
      }
    }

    // Run type-specific checks
    errors.push(...rule.validate(setup));
  }

  return errors;
}

/**
 * Validate all setups and return a report.
 * @param {object[]} setups — array of setups
 * @returns {{ valid: boolean, results: { id: string, errors: string[] }[] }}
 */
export function validateAll(setups) {
  const results = setups.map((s) => ({
    id: s.id || "(missing id)",
    errors: validateSetup(s),
  }));

  return {
    valid: results.every((r) => r.errors.length === 0),
    total: setups.length,
    passed: results.filter((r) => r.errors.length === 0).length,
    failed: results.filter((r) => r.errors.length > 0).length,
    results,
  };
}
