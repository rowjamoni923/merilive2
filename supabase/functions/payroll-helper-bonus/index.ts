import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    let bonusAmount = 500000;
    let customNote = "";

    try {
      const body = await req.json();
      if (body.amount && Number(body.amount) > 0) bonusAmount = Number(body.amount);
      if (body.note) customNote = String(body.note);
    } catch { /* no body, use defaults */ }

    // Get all payroll helpers
    const { data: helpers, error: fetchError } = await supabase
      .from("topup_helpers")
      .select("id, user_id, wallet_balance")
      .eq("payroll_enabled", true)
      .eq("is_verified", true)
      .eq("is_active", true);

    if (fetchError) throw fetchError;
    if (!helpers || helpers.length === 0) {
      return new Response(JSON.stringify({ message: "No payroll helpers found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${helpers.length} payroll helpers, adding ${bonusAmount} diamonds each`);

    const results = [];

    for (const helper of helpers) {
      // Update wallet balance
      const newBalance = (helper.wallet_balance || 0) + bonusAmount;
      const { error: updateError } = await supabase
        .from("topup_helpers")
        .update({ 
          wallet_balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq("id", helper.id);

      if (updateError) {
        console.error(`Failed to update helper ${helper.id}:`, updateError);
        results.push({ helper_id: helper.id, success: false, error: updateError.message });
        continue;
      }

      // Record transaction
      try {
        await supabase.from("helper_transactions").insert({
          helper_id: helper.id,
          user_id: helper.user_id,
          transaction_type: "bonus",
          amount: bonusAmount,
          status: "completed",
          notes: customNote || `Payroll Helper Trader Diamond Bonus - ${bonusAmount.toLocaleString()} Diamonds`
        });
      } catch (e) { console.log("Transaction record error:", e); }

      // Send notification
      try {
        const noteSection = customNote ? `\n\n📝 Admin Note: ${customNote}` : "";
        const guideLink = "\n\n📖 Payroll Helper Guide: /payroll-helper-guide";
        await supabase.from("notifications").insert({
          user_id: helper.user_id,
          title: "🎉 Trader Diamond Bonus!",
          message: `Congratulations! You have received ${bonusAmount.toLocaleString()} Trader Diamonds as a Payroll Helper bonus!\n\n💎 Bonus: ${bonusAmount.toLocaleString()} Diamonds\n💰 You can sell these diamonds through your Helper Dashboard.\n\n📌 How to sell:\n1. Go to Helper Dashboard → Payment Methods\n2. Add your payment method\n3. Start selling diamonds to agencies${noteSection}${guideLink}\n\nThank you for being a valued Payroll Helper! 🙏`,
          type: "reward",
          is_read: false,
          data: { amount: bonusAmount, action_url: '/payroll-helper-guide' }
        });
      } catch (e) { console.log("Notification error:", e); }

      results.push({ helper_id: helper.id, user_id: helper.user_id, success: true, new_balance: newBalance });
      console.log(`✅ Helper ${helper.id} updated: +${bonusAmount} diamonds, new balance: ${newBalance}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        total_helpers: helpers.length,
        bonus_per_helper: bonusAmount,
        total_distributed: helpers.length * bonusAmount,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
