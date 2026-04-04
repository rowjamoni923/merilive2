 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 Deno.serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response("ok", { headers: corsHeaders });
   }
 
   try {
     const { userId, deviceId } = await req.json();
 
     if (!userId || !deviceId) {
       return new Response(
         JSON.stringify({ error: "userId and deviceId are required" }),
         { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
     const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
     const supabase = createClient(supabaseUrl, supabaseKey);
 
     // Update the profile with the new device ID
     const { data, error } = await supabase
       .from("profiles")
       .update({ device_id: deviceId })
       .eq("id", userId)
       .select("id, display_name, device_id")
       .single();
 
     if (error) {
       console.error("Update error:", error);
       return new Response(
         JSON.stringify({ error: error.message }),
         { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     return new Response(
       JSON.stringify({ success: true, profile: data }),
       { headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   } catch (err) {
     console.error("Error:", err);
     return new Response(
       JSON.stringify({ error: "Internal server error" }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
 });