// ═══════════════════════════════════════════════════════════════
// brain-controller.js — Qudozen Brain Orchestration Controller
// Manages project state, step execution, insights, and decisions.
// ═══════════════════════════════════════════════════════════════

const fs = require('fs/promises');
const path = require('path');

const BRAIN_PATH = path.join(__dirname, 'qudozen-brain.json');
const INSIGHTS_PATH = path.join(__dirname, 'insights-log.md');

// ─────────────────────────────────────────────
// loadBrainState — Read and parse the master state file
// Returns the full brain state object or throws on corruption
// ─────────────────────────────────────────────

async function loadBrainState() {
  try {
    const raw = await fs.readFile(BRAIN_PATH, 'utf-8');
    const state = JSON.parse(raw);
    console.log(`[Brain] State loaded — phase: ${state.execution_state.current_phase}, step: ${state.execution_state.current_step_number}`);
    return state;
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error('[Brain] ❌ qudozen-brain.json not found. Run brain initialization first.');
      throw new Error('Brain state file missing');
    }
    console.error('[Brain] ❌ Failed to load brain state:', err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────
// saveBrainState — Atomic write of brain state to disk
// Writes to .tmp first, then renames to prevent corruption
// ─────────────────────────────────────────────

async function saveBrainState(state) {
  try {
    state.meta.last_updated = new Date().toISOString();
    const json = JSON.stringify(state, null, 2);
    const tmpPath = BRAIN_PATH + '.tmp';
    await fs.writeFile(tmpPath, json, 'utf-8');
    await fs.rename(tmpPath, BRAIN_PATH);
    console.log(`[Brain] State saved — step ${state.execution_state.current_step_number}: ${state.execution_state.step_status}`);
    return true;
  } catch (err) {
    console.error('[Brain] ❌ Failed to save brain state:', err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────
// startStep — Begin execution of a specific step
// Updates execution_state, logs to workflow_history
// ─────────────────────────────────────────────

async function startStep(stepNumber, stepName) {
  try {
    const state = await loadBrainState();

    // Validate step isn't already completed
    const alreadyDone = state.completed_steps.find(s => s.step_number === stepNumber);
    if (alreadyDone) {
      console.warn(`[Brain] ⚠️ Step ${stepNumber} already completed at ${alreadyDone.timestamp_completed}`);
      return state;
    }

    state.execution_state.current_step_number = stepNumber;
    state.execution_state.current_step_name = stepName;
    state.execution_state.step_status = 'in_progress';
    state.execution_state.blocker_reason = '';
    state.execution_state.retry_count = 0;

    state.workflow_history.push({
      action: 'step_started',
      step_number: stepNumber,
      step_name: stepName,
      timestamp: new Date().toISOString()
    });

    // Remove from pending_steps
    state.pending_steps = state.pending_steps.filter(s => s.step_number !== stepNumber);

    await saveBrainState(state);
    console.log(`[Brain] ▶ Step ${stepNumber} started: ${stepName}`);
    return state;
  } catch (err) {
    console.error(`[Brain] ❌ Failed to start step ${stepNumber}:`, err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────
// completeStep — Mark a step as completed with full metadata
// Moves step to completed_steps, updates next_action
// ─────────────────────────────────────────────

async function completeStep(stepNumber, completionData = {}) {
  try {
    const state = await loadBrainState();

    const {
      files_created = [],
      files_modified = [],
      insights = [],
      decisions = [],
      issues_found = [],
      fixes_applied = []
    } = completionData;

    // Build completion record
    const record = {
      step_number: stepNumber,
      step_name: state.execution_state.current_step_name,
      timestamp_completed: new Date().toISOString(),
      files_created,
      files_modified,
      insights,
      decisions,
      issues_found,
      fixes_applied
    };

    state.completed_steps.push(record);

    state.execution_state.step_status = 'completed';

    state.workflow_history.push({
      action: 'step_completed',
      step_number: stepNumber,
      step_name: record.step_name,
      timestamp: record.timestamp_completed,
      files_created: files_created.length,
      files_modified: files_modified.length,
      issues_found: issues_found.length
    });

    // Auto-advance: find the next step whose dependencies are all met
    const completedNumbers = new Set(state.completed_steps.map(s => s.step_number));
    const nextStep = state.pending_steps.find(s =>
      s.depends_on.every(dep => completedNumbers.has(dep))
    );

    if (nextStep) {
      state.next_action = {
        step_number: nextStep.step_number,
        step_name: nextStep.step_name,
        instruction: `Execute step ${nextStep.step_number}: ${nextStep.step_name}`,
        success_criteria: '',
        rollback_plan: ''
      };
      state.execution_state.current_step_number = nextStep.step_number;
      state.execution_state.current_step_name = nextStep.step_name;
      state.execution_state.step_status = 'pending';
    } else if (state.pending_steps.length === 0) {
      state.execution_state.current_phase = 'COMPLETE';
      state.execution_state.step_status = 'all_done';
      state.next_action = {
        step_number: 0,
        step_name: 'None',
        instruction: 'All steps completed. System ready for production.',
        success_criteria: '',
        rollback_plan: ''
      };
    }

    // Append insights to global list
    for (const insight of insights) {
      state.insights.push({
        timestamp: new Date().toISOString(),
        step_number: stepNumber,
        insight
      });
    }

    // Append decisions to global list
    for (const decision of decisions) {
      state.decisions.push({
        timestamp: new Date().toISOString(),
        step_number: stepNumber,
        decision
      });
    }

    await saveBrainState(state);
    console.log(`[Brain] ✅ Step ${stepNumber} completed: ${record.step_name}`);
    return state;
  } catch (err) {
    console.error(`[Brain] ❌ Failed to complete step ${stepNumber}:`, err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────
// recordInsight — Log a single insight during execution
// ─────────────────────────────────────────────

async function recordInsight(insight, stepNumber = null) {
  try {
    const state = await loadBrainState();
    const step = stepNumber || state.execution_state.current_step_number;

    const entry = {
      timestamp: new Date().toISOString(),
      step_number: step,
      insight
    };

    state.insights.push(entry);

    state.workflow_history.push({
      action: 'insight_recorded',
      step_number: step,
      insight,
      timestamp: entry.timestamp
    });

    await saveBrainState(state);

    // Also append to insights-log.md
    const logLine = `\n| ${entry.timestamp} | ${step} | ${insight} |`;
    await fs.appendFile(INSIGHTS_PATH, logLine, 'utf-8');

    console.log(`[Brain] 💡 Insight recorded: ${insight}`);
    return entry;
  } catch (err) {
    console.error('[Brain] ❌ Failed to record insight:', err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────
// recordDecision — Log a decision with rationale
// ─────────────────────────────────────────────

async function recordDecision(decision, rationale = '', stepNumber = null) {
  try {
    const state = await loadBrainState();
    const step = stepNumber || state.execution_state.current_step_number;

    const entry = {
      timestamp: new Date().toISOString(),
      step_number: step,
      decision,
      rationale
    };

    state.decisions.push(entry);

    state.workflow_history.push({
      action: 'decision_recorded',
      step_number: step,
      decision,
      timestamp: entry.timestamp
    });

    await saveBrainState(state);
    console.log(`[Brain] 🧭 Decision recorded: ${decision}`);
    return entry;
  } catch (err) {
    console.error('[Brain] ❌ Failed to record decision:', err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────
// refinePlan — Modify pending steps (add, remove, reorder)
// ─────────────────────────────────────────────

async function refinePlan(modifications = {}) {
  try {
    const state = await loadBrainState();

    const { add = [], remove = [], update = [] } = modifications;

    // Remove steps
    for (const stepNumber of remove) {
      state.pending_steps = state.pending_steps.filter(s => s.step_number !== stepNumber);
      state.workflow_history.push({
        action: 'step_removed',
        step_number: stepNumber,
        timestamp: new Date().toISOString()
      });
    }

    // Add new steps
    for (const step of add) {
      const exists = state.pending_steps.find(s => s.step_number === step.step_number)
        || state.completed_steps.find(s => s.step_number === step.step_number);
      if (!exists) {
        state.pending_steps.push(step);
        state.workflow_history.push({
          action: 'step_added',
          step_number: step.step_number,
          step_name: step.step_name,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Update existing steps
    for (const upd of update) {
      const idx = state.pending_steps.findIndex(s => s.step_number === upd.step_number);
      if (idx !== -1) {
        state.pending_steps[idx] = { ...state.pending_steps[idx], ...upd };
        state.workflow_history.push({
          action: 'step_updated',
          step_number: upd.step_number,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Sort pending by step_number
    state.pending_steps.sort((a, b) => a.step_number - b.step_number);

    await saveBrainState(state);
    console.log(`[Brain] 🔧 Plan refined: +${add.length} added, -${remove.length} removed, ~${update.length} updated`);
    return state;
  } catch (err) {
    console.error('[Brain] ❌ Failed to refine plan:', err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────
// getResumeContext — Generate context for any LLM to resume work
// Returns a structured summary of where we are
// ─────────────────────────────────────────────

async function getResumeContext() {
  try {
    const state = await loadBrainState();

    const context = {
      project: state.meta.project,
      version: state.meta.version,
      last_updated: state.meta.last_updated,
      system_health: state.system_status.overall_health,
      render_status: state.system_status.render_status,
      current_phase: state.execution_state.current_phase,
      current_step: {
        number: state.execution_state.current_step_number,
        name: state.execution_state.current_step_name,
        status: state.execution_state.step_status,
        blocker: state.execution_state.blocker_reason || null
      },
      completed_count: state.completed_steps.length,
      pending_count: state.pending_steps.length,
      total_steps: state.completed_steps.length + state.pending_steps.length + (state.execution_state.step_status === 'in_progress' ? 1 : 0),
      last_3_completed: state.completed_steps.slice(-3).map(s => ({
        step: s.step_number,
        name: s.step_name,
        when: s.timestamp_completed
      })),
      next_action: state.next_action,
      recent_insights: state.insights.slice(-5).map(i => i.insight),
      recent_decisions: state.decisions.slice(-3).map(d => d.decision),
      growth_swarm_status: {
        modules_built: state.growth_swarm.modules_built.length,
        modules_pending: state.growth_swarm.modules_pending.length,
        target_conversion: state.growth_swarm.target_conversion_rate
      }
    };

    console.log(`[Brain] 📋 Resume context generated — step ${context.current_step.number}/${context.total_steps}`);
    return context;
  } catch (err) {
    console.error('[Brain] ❌ Failed to generate resume context:', err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────
// validateHealth — Check system integrity
// Verifies all brain files exist and state is consistent
// ─────────────────────────────────────────────

async function validateHealth() {
  try {
    const issues = [];

    // Check brain file exists
    try {
      await fs.access(BRAIN_PATH);
    } catch {
      issues.push('qudozen-brain.json missing');
    }

    // Check insights log exists
    try {
      await fs.access(INSIGHTS_PATH);
    } catch {
      issues.push('insights-log.md missing');
    }

    // Load and validate state
    let state;
    try {
      state = await loadBrainState();
    } catch {
      issues.push('Brain state failed to parse');
      return { healthy: false, issues };
    }

    // Check schema version
    if (state.meta.brain_schema_version !== '2.0') {
      issues.push(`Schema version mismatch: expected 2.0, got ${state.meta.brain_schema_version}`);
    }

    // Check for orphaned steps (completed step numbers should not be in pending)
    const completedNums = new Set(state.completed_steps.map(s => s.step_number));
    for (const pending of state.pending_steps) {
      if (completedNums.has(pending.step_number)) {
        issues.push(`Step ${pending.step_number} is in both completed and pending`);
      }
    }

    // Check for circular dependencies
    for (const step of state.pending_steps) {
      if (step.depends_on.includes(step.step_number)) {
        issues.push(`Step ${step.step_number} depends on itself`);
      }
    }

    // Check execution state consistency
    if (state.execution_state.step_status === 'in_progress') {
      const isInCompleted = completedNums.has(state.execution_state.current_step_number);
      if (isInCompleted) {
        issues.push(`Step ${state.execution_state.current_step_number} marked in_progress but already in completed_steps`);
      }
    }

    const healthy = issues.length === 0;
    const result = {
      healthy,
      issues,
      stats: {
        completed_steps: state.completed_steps.length,
        pending_steps: state.pending_steps.length,
        total_insights: state.insights.length,
        total_decisions: state.decisions.length,
        workflow_events: state.workflow_history.length,
        growth_modules_built: state.growth_swarm.modules_built.length,
        growth_modules_pending: state.growth_swarm.modules_pending.length
      }
    };

    console.log(`[Brain] ${healthy ? '✅ Health check passed' : '⚠️ Health check found issues: ' + issues.join(', ')}`);
    return result;
  } catch (err) {
    console.error('[Brain] ❌ Health check failed:', err.message);
    return { healthy: false, issues: [err.message] };
  }
}

// ─────────────────────────────────────────────
// generateMorningBrief — Create a summary for admin WhatsApp
// Returns a formatted string ready to send
// ─────────────────────────────────────────────

async function generateMorningBrief() {
  try {
    const state = await loadBrainState();
    const health = await validateHealth();

    const completedCount = state.completed_steps.length;
    const pendingCount = state.pending_steps.length;
    const totalSteps = completedCount + pendingCount + (state.execution_state.step_status === 'in_progress' ? 1 : 0);
    const progressPct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

    const lastCompleted = state.completed_steps.length > 0
      ? state.completed_steps[state.completed_steps.length - 1]
      : null;

    const recentInsights = state.insights.slice(-3).map(i => `  • ${i.insight}`).join('\n');

    const growthBuilt = state.growth_swarm.modules_built.length;
    const growthTotal = growthBuilt + state.growth_swarm.modules_pending.length;

    const brief = [
      `🧠 *Qudozen Brain — Morning Brief*`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `📊 Progress: ${completedCount}/${totalSteps} steps (${progressPct}%)`,
      `🔄 Phase: ${state.execution_state.current_phase}`,
      `📌 Current: Step ${state.execution_state.current_step_number} — ${state.execution_state.current_step_name}`,
      `📈 Status: ${state.execution_state.step_status}`,
      state.execution_state.blocker_reason ? `🚫 Blocker: ${state.execution_state.blocker_reason}` : '',
      ``,
      lastCompleted ? `✅ Last completed: Step ${lastCompleted.step_number} — ${lastCompleted.step_name}` : '',
      ``,
      `🎯 Growth Swarm: ${growthBuilt}/${growthTotal} modules`,
      `🏥 System: ${health.healthy ? '✅ Healthy' : '⚠️ Issues found'}`,
      ``,
      recentInsights ? `💡 Recent insights:\n${recentInsights}` : '',
      ``,
      `▶ Next: ${state.next_action.step_name}`,
      `━━━━━━━━━━━━━━━━━━━━━`
    ].filter(Boolean).join('\n');

    console.log('[Brain] 📰 Morning brief generated');
    return brief;
  } catch (err) {
    console.error('[Brain] ❌ Failed to generate morning brief:', err.message);
    return '🧠 Qudozen Brain — Morning brief generation failed. Check brain state.';
  }
}

module.exports = {
  loadBrainState,
  saveBrainState,
  startStep,
  completeStep,
  recordInsight,
  recordDecision,
  refinePlan,
  getResumeContext,
  validateHealth,
  generateMorningBrief
};
