// ═══════════════════════════════════════════════════════════════
// workflow-engine.js — Qudozen Brain Workflow Engine
// Enforces step ordering, handles failures/blockers,
// and auto-generates next steps based on dependency graph.
// ═══════════════════════════════════════════════════════════════

const { loadBrainState, saveBrainState } = require('./brain-controller');

// ─────────────────────────────────────────────
// enforceStepOrder — Verify a step is allowed to start
// Checks all dependencies are completed before allowing execution
// Returns { allowed: boolean, reason: string }
// ─────────────────────────────────────────────

async function enforceStepOrder(stepNumber) {
  try {
    const state = await loadBrainState();

    // Check if step exists in pending
    const step = state.pending_steps.find(s => s.step_number === stepNumber);
    if (!step) {
      // Check if already completed
      const completed = state.completed_steps.find(s => s.step_number === stepNumber);
      if (completed) {
        return {
          allowed: false,
          reason: `Step ${stepNumber} already completed at ${completed.timestamp_completed}`
        };
      }
      // Check if it's the current in-progress step
      if (state.execution_state.current_step_number === stepNumber && state.execution_state.step_status === 'in_progress') {
        return {
          allowed: true,
          reason: `Step ${stepNumber} is currently in progress`
        };
      }
      return {
        allowed: false,
        reason: `Step ${stepNumber} not found in pending steps`
      };
    }

    // Check dependencies
    const completedNumbers = new Set(state.completed_steps.map(s => s.step_number));
    const unmetDeps = step.depends_on.filter(dep => !completedNumbers.has(dep));

    if (unmetDeps.length > 0) {
      const depNames = unmetDeps.map(dep => {
        const pendingDep = state.pending_steps.find(s => s.step_number === dep);
        return pendingDep ? `${dep} (${pendingDep.step_name})` : `${dep}`;
      });
      return {
        allowed: false,
        reason: `Unmet dependencies: ${depNames.join(', ')}`
      };
    }

    // Check if another step is currently in progress
    if (state.execution_state.step_status === 'in_progress' && state.execution_state.current_step_number !== stepNumber) {
      return {
        allowed: false,
        reason: `Step ${state.execution_state.current_step_number} (${state.execution_state.current_step_name}) is currently in progress. Complete or fail it first.`
      };
    }

    console.log(`[Workflow] ✅ Step ${stepNumber} (${step.step_name}) is allowed to start`);
    return {
      allowed: true,
      reason: `All dependencies met: [${step.depends_on.join(', ')}]`
    };
  } catch (err) {
    console.error(`[Workflow] ❌ Failed to enforce step order for step ${stepNumber}:`, err.message);
    return { allowed: false, reason: `Error: ${err.message}` };
  }
}

// ─────────────────────────────────────────────
// validateStepCompletion — Verify that a step's outputs are valid
// Checks files_created exist, no empty insights, etc.
// Returns { valid: boolean, issues: string[] }
// ─────────────────────────────────────────────

async function validateStepCompletion(stepNumber, completionData = {}) {
  try {
    const issues = [];
    const state = await loadBrainState();

    const { files_created = [], files_modified = [], insights = [] } = completionData;

    // Validate step number matches current execution
    if (state.execution_state.current_step_number !== stepNumber) {
      issues.push(`Step ${stepNumber} is not the current step (current: ${state.execution_state.current_step_number})`);
    }

    // Validate step is in progress
    if (state.execution_state.step_status !== 'in_progress') {
      issues.push(`Current step status is '${state.execution_state.step_status}', expected 'in_progress'`);
    }

    // Validate files_created is not empty (every step should produce something)
    if (files_created.length === 0 && files_modified.length === 0) {
      issues.push('No files_created or files_modified reported — every step should produce artifacts');
    }

    // Validate insights has at least one entry
    if (insights.length === 0) {
      issues.push('No insights provided — every step should generate at least one insight');
    }

    // Validate no empty strings in arrays
    for (const file of files_created) {
      if (!file || file.trim() === '') {
        issues.push('Empty string in files_created');
      }
    }
    for (const insight of insights) {
      if (!insight || insight.trim() === '') {
        issues.push('Empty string in insights');
      }
    }

    const valid = issues.length === 0;
    console.log(`[Workflow] ${valid ? '✅' : '⚠️'} Step ${stepNumber} completion validation: ${valid ? 'passed' : issues.join('; ')}`);
    return { valid, issues };
  } catch (err) {
    console.error(`[Workflow] ❌ Failed to validate step ${stepNumber}:`, err.message);
    return { valid: false, issues: [err.message] };
  }
}

// ─────────────────────────────────────────────
// handleFailure — Mark current step as failed, increment retry
// If retry_count >= max_retries, mark as blocked
// ─────────────────────────────────────────────

async function handleFailure(stepNumber, errorMessage, maxRetries = 3) {
  try {
    const state = await loadBrainState();

    state.execution_state.retry_count = (state.execution_state.retry_count || 0) + 1;

    const entry = {
      action: 'step_failed',
      step_number: stepNumber,
      step_name: state.execution_state.current_step_name,
      error: errorMessage,
      retry_count: state.execution_state.retry_count,
      timestamp: new Date().toISOString()
    };

    state.workflow_history.push(entry);

    if (state.execution_state.retry_count >= maxRetries) {
      state.execution_state.step_status = 'blocked';
      state.execution_state.blocker_reason = `Failed ${maxRetries} times. Last error: ${errorMessage}`;

      state.workflow_history.push({
        action: 'step_blocked',
        step_number: stepNumber,
        reason: state.execution_state.blocker_reason,
        timestamp: new Date().toISOString()
      });

      console.error(`[Workflow] 🚫 Step ${stepNumber} BLOCKED after ${maxRetries} retries: ${errorMessage}`);
    } else {
      state.execution_state.step_status = 'retry_pending';
      console.warn(`[Workflow] ⚠️ Step ${stepNumber} failed (attempt ${state.execution_state.retry_count}/${maxRetries}): ${errorMessage}`);
    }

    await saveBrainState(state);
    return state;
  } catch (err) {
    console.error(`[Workflow] ❌ Failed to handle failure for step ${stepNumber}:`, err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────
// handleBlocker — Manually mark a step as blocked with a reason
// Used when human intervention is required
// ─────────────────────────────────────────────

async function handleBlocker(stepNumber, blockerReason) {
  try {
    const state = await loadBrainState();

    state.execution_state.step_status = 'blocked';
    state.execution_state.blocker_reason = blockerReason;

    state.workflow_history.push({
      action: 'step_blocked',
      step_number: stepNumber,
      step_name: state.execution_state.current_step_name,
      reason: blockerReason,
      timestamp: new Date().toISOString()
    });

    state.insights.push({
      timestamp: new Date().toISOString(),
      step_number: stepNumber,
      insight: `BLOCKER: ${blockerReason}`
    });

    await saveBrainState(state);
    console.warn(`[Workflow] 🚫 Step ${stepNumber} blocked: ${blockerReason}`);
    return state;
  } catch (err) {
    console.error(`[Workflow] ❌ Failed to handle blocker for step ${stepNumber}:`, err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────
// autoGenerateNextStep — Determine the next executable step
// Walks the dependency graph, finds steps whose deps are all met
// Returns the next step object or null if all done/blocked
// ─────────────────────────────────────────────

async function autoGenerateNextStep() {
  try {
    const state = await loadBrainState();

    // If current step is still in progress, return it
    if (state.execution_state.step_status === 'in_progress') {
      return {
        action: 'continue',
        step_number: state.execution_state.current_step_number,
        step_name: state.execution_state.current_step_name,
        message: 'Current step still in progress. Complete it first.'
      };
    }

    // If blocked, report it
    if (state.execution_state.step_status === 'blocked') {
      return {
        action: 'blocked',
        step_number: state.execution_state.current_step_number,
        step_name: state.execution_state.current_step_name,
        message: `Blocked: ${state.execution_state.blocker_reason}`,
        blocker: state.execution_state.blocker_reason
      };
    }

    // Find all steps whose dependencies are fully met
    const completedNumbers = new Set(state.completed_steps.map(s => s.step_number));
    const readySteps = state.pending_steps.filter(s =>
      s.depends_on.every(dep => completedNumbers.has(dep))
    );

    if (readySteps.length === 0) {
      if (state.pending_steps.length === 0) {
        return {
          action: 'all_complete',
          step_number: 0,
          step_name: 'None',
          message: 'All steps completed. System fully built.'
        };
      }
      return {
        action: 'dependency_wait',
        step_number: 0,
        step_name: 'None',
        message: 'No steps are ready — all have unmet dependencies.',
        blocked_steps: state.pending_steps.map(s => ({
          step: s.step_number,
          name: s.step_name,
          waiting_on: s.depends_on.filter(d => !completedNumbers.has(d))
        }))
      };
    }

    // Sort by priority (critical > high > medium > low), then by step_number
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    readySteps.sort((a, b) => {
      const pDiff = (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
      if (pDiff !== 0) return pDiff;
      return a.step_number - b.step_number;
    });

    const next = readySteps[0];

    console.log(`[Workflow] ▶ Next step: ${next.step_number} — ${next.step_name} (${next.priority}, ~${next.estimated_effort_minutes}min)`);
    return {
      action: 'execute',
      step_number: next.step_number,
      step_name: next.step_name,
      priority: next.priority,
      estimated_effort_minutes: next.estimated_effort_minutes,
      risk_level: next.risk_level,
      depends_on: next.depends_on,
      message: `Ready to execute step ${next.step_number}: ${next.step_name}`
    };
  } catch (err) {
    console.error('[Workflow] ❌ Failed to auto-generate next step:', err.message);
    return { action: 'error', message: err.message };
  }
}

module.exports = {
  enforceStepOrder,
  validateStepCompletion,
  handleFailure,
  handleBlocker,
  autoGenerateNextStep
};
