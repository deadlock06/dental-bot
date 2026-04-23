const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function adjustScoringWeights() {
  console.log('[feedback-loop] Running weekly scoring weight adjustments based on conversion data...');
  try {
    // 1. Fetch handoffs and opt-outs
    const { data: feedbackData, error } = await supabase
      .from('gs_feedback')
      .select('feedback_type, lead_id');
      
    if (error) throw error;
    
    let optOuts = 0;
    let handoffs = 0;
    
    feedbackData.forEach(f => {
      if (f.feedback_type === 'opt_out') optOuts++;
      if (f.feedback_type === 'handoff') handoffs++;
    });
    
    console.log(`[feedback-loop] Weekly analysis: ${handoffs} handoffs, ${optOuts} opt-outs.`);
    
    // In a full implementation, we'd adjust the weights in scoring-engine.js based on correlation.
    // For now, this serves as the analytical foundation.
    
    return { success: true, analysis: { handoffs, optOuts } };
  } catch (err) {
    console.error('[feedback-loop] Error adjusting weights:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { adjustScoringWeights };
