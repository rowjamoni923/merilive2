import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();

    switch (path) {
      case "search-user": {
        const query = url.searchParams.get("q") || "";
        if (!query || query.length < 2) {
          return new Response(JSON.stringify({ users: [] }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: users, error } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, app_uid, gender, is_host, is_verified, is_blocked, country_flag, user_level")
          .or(`app_uid.ilike.%${query}%,display_name.ilike.%${query}%`)
          .limit(20);

        if (error) throw error;

        return new Response(JSON.stringify({ users: users || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "user-conversations": {
        const userId = url.searchParams.get("userId");
        if (!userId) {
          return new Response(JSON.stringify({ error: "userId required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: conversations, error } = await supabase
          .from("conversations")
          .select("*")
          .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
          .order("last_message_at", { ascending: false })
          .limit(50);

        if (error) throw error;

        const participantIds = new Set<string>();
        (conversations || []).forEach((c: any) => {
          participantIds.add(c.participant_1);
          participantIds.add(c.participant_2);
        });

        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, app_uid, is_host, is_blocked, country_flag")
          .in("id", Array.from(participantIds));

        const profileMap: Record<string, any> = {};
        (profiles || []).forEach((p: any) => {
          profileMap[p.id] = p;
        });

        const conversationsWithDetails = await Promise.all(
          (conversations || []).map(async (conv: any) => {
            const otherId = conv.participant_1 === userId ? conv.participant_2 : conv.participant_1;

            const { data: lastMsg } = await supabase
              .from("messages")
              .select("content, message_type, sender_id, created_at")
              .eq("conversation_id", conv.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .single();

            const { count } = await supabase
              .from("messages")
              .select("id", { count: "exact", head: true })
              .eq("conversation_id", conv.id);

            // Check if any messages in this conversation have phone violations
            const { count: violationCount } = await supabase
              .from("chat_moderation_logs")
              .select("id", { count: "exact", head: true })
              .eq("conversation_id", conv.id)
              .eq("violation_type", "phone_number");

            return {
              ...conv,
              other_user: profileMap[otherId] || { id: otherId, display_name: "Unknown" },
              target_user: profileMap[userId] || { id: userId, display_name: "Unknown" },
              last_message: lastMsg,
              message_count: count || 0,
              has_violations: (violationCount || 0) > 0,
            };
          })
        );

        return new Response(JSON.stringify({ conversations: conversationsWithDetails }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "conversation-messages": {
        const conversationId = url.searchParams.get("conversationId");
        const page = parseInt(url.searchParams.get("page") || "1");
        const limit = 50;
        const offset = (page - 1) * limit;

        if (!conversationId) {
          return new Response(JSON.stringify({ error: "conversationId required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fetch messages and moderation logs in parallel
        const [messagesResult, moderationResult] = await Promise.all([
          supabase
            .from("messages")
            .select("*", { count: "exact" })
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true })
            .range(offset, offset + limit - 1),
          supabase
            .from("chat_moderation_logs")
            .select("message_id, detected_content, notes, user_id, created_at")
            .eq("conversation_id", conversationId)
            .in("violation_type", ["phone_number", "contact_sharing", "social_media", "image_contact"])
        ]);

        const { data: messages, error, count } = messagesResult;
        if (error) throw error;

        // Build moderation lookup by message_id
        const moderationMap: Record<string, any> = {};
        (moderationResult.data || []).forEach((log: any) => {
          if (log.message_id) {
            moderationMap[log.message_id] = {
              detected_content: log.detected_content,
              original_message: log.notes?.match(/Original: "(.+?)\.\.\."/)?.[1] || log.detected_content,
            };
          }
        });

        const senderIds = new Set<string>();
        (messages || []).forEach((m: any) => {
          if (m.sender_id) senderIds.add(m.sender_id);
        });

        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, app_uid")
          .in("id", Array.from(senderIds));

        const profileMap: Record<string, any> = {};
        (profiles || []).forEach((p: any) => {
          profileMap[p.id] = p;
        });

        const messagesWithProfiles = (messages || []).map((m: any) => {
          const modLog = moderationMap[m.id];
          return {
            ...m,
            sender: profileMap[m.sender_id] || null,
            // Admin-only: original content before masking
            original_content: modLog?.original_message || null,
            detected_numbers: modLog?.detected_content || null,
          };
        });

        return new Response(
          JSON.stringify({ messages: messagesWithProfiles, total: count, page, limit }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "resolve-user": {
        const identifier = url.searchParams.get("id") || "";
        if (!identifier) {
          return new Response(JSON.stringify({ error: "id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
        
        let userId = identifier;
        if (!isUUID) {
          const { data: profile, error: lookupErr } = await supabase
            .from("profiles")
            .select("id")
            .eq("app_uid", identifier)
            .maybeSingle();
          
          if (lookupErr || !profile) {
            return new Response(JSON.stringify({ error: `User "${identifier}" not found` }), {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          userId = profile.id;
        }

        return new Response(JSON.stringify({ userId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create-ban": {
        const body = await req.json();
        const { user_id, ban_reason, violation_type, ban_duration_hours, ban_end, is_active, auto_banned } = body;

        if (!user_id) {
          return new Response(JSON.stringify({ error: "user_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Resolve user_id if not UUID
        let resolvedUserId = user_id;
        const isUserUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user_id);
        if (!isUserUUID) {
          const { data: prof, error: le } = await supabase
            .from("profiles")
            .select("id")
            .eq("app_uid", user_id)
            .maybeSingle();
          if (le || !prof) {
            return new Response(JSON.stringify({ error: `User "${user_id}" not found` }), {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          resolvedUserId = prof.id;
        }

        const { error: insertErr } = await supabase
          .from("live_bans")
          .insert({
            user_id: resolvedUserId,
            ban_reason: ban_reason || "Manual ban by admin",
            violation_type: violation_type || "manual",
            ban_duration_hours: ban_duration_hours || null,
            ban_end: ban_end || null,
            is_active: is_active !== false,
            auto_banned: auto_banned || false,
          });

        if (insertErr) {
          console.error("Ban insert error:", insertErr);
          return new Response(JSON.stringify({ error: insertErr.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Force-end any active live stream for this user
        const { data: activeStreams } = await supabase
          .from("live_streams")
          .select("id")
          .eq("host_id", resolvedUserId)
          .eq("is_active", true);

        if (activeStreams && activeStreams.length > 0) {
          for (const stream of activeStreams) {
            await supabase
              .from("live_streams")
              .update({ is_active: false, ended_at: new Date().toISOString() })
              .eq("id", stream.id);
          }
          console.log(`Force-ended ${activeStreams.length} active stream(s) for banned user ${resolvedUserId}`);
        }

        return new Response(JSON.stringify({ success: true, user_id: resolvedUserId, streams_ended: activeStreams?.length || 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "gift-transactions": {
        // Support timezone offset from client (default UTC+6 for Bangladesh)
        const tzOffset = parseInt(url.searchParams.get("tzOffset") || "6");
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
        const pageSize = Math.min(200, Math.max(10, parseInt(url.searchParams.get("pageSize") || "50")));
        const offset = (page - 1) * pageSize;

        const now = new Date();
        const todayStart = new Date(now.getTime());
        todayStart.setUTCHours(-tzOffset, 0, 0, 0); // Start of day in client timezone
        const fromIso = todayStart.toISOString();

        // 1) Lightweight aggregate query — stats are independent of pagination
        const { data: aggRows, error: aggErr } = await supabase
          .from("gift_transactions")
          .select("coin_amount, sender_id, receiver_id")
          .gte("created_at", fromIso)
          .limit(10000);
        if (aggErr) throw aggErr;

        const stats = {
          total_beans: 0,
          total_count: aggRows?.length || 0,
          unique_senders: 0,
          unique_receivers: 0,
        };
        const senderSet = new Set<string>();
        const receiverSet = new Set<string>();
        (aggRows || []).forEach((r: any) => {
          stats.total_beans += r.coin_amount || 0;
          if (r.sender_id) senderSet.add(r.sender_id);
          if (r.receiver_id) receiverSet.add(r.receiver_id);
        });
        stats.unique_senders = senderSet.size;
        stats.unique_receivers = receiverSet.size;

        // 2) Paginated rows with enrichment
        const { data: txns, error: txErr } = await supabase
          .from("gift_transactions")
          .select("*")
          .gte("created_at", fromIso)
          .order("created_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (txErr) throw txErr;

        const userIds = new Set<string>();
        const giftIds = new Set<string>();
        (txns || []).forEach((t: any) => {
          if (t.sender_id) userIds.add(t.sender_id);
          if (t.receiver_id) userIds.add(t.receiver_id);
          if (t.gift_id) giftIds.add(t.gift_id);
        });

        const [profilesRes, giftsRes] = await Promise.all([
          userIds.size > 0
            ? supabase.from("profiles").select("id, display_name, avatar_url, app_uid").in("id", Array.from(userIds))
            : Promise.resolve({ data: [] as any[] }),
          giftIds.size > 0
            ? supabase.from("gifts").select("id, name, icon_url").in("id", Array.from(giftIds))
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const profileMap: Record<string, any> = {};
        (profilesRes.data || []).forEach((p: any) => { profileMap[p.id] = p; });
        const giftMap: Record<string, any> = {};
        (giftsRes.data || []).forEach((g: any) => { giftMap[g.id] = g; });

        const enriched = (txns || []).map((t: any) => ({
          ...t,
          sender: profileMap[t.sender_id] || null,
          receiver: profileMap[t.receiver_id] || null,
          gift: giftMap[t.gift_id] || null,
        }));

        const hasMore = offset + enriched.length < stats.total_count;

        return new Response(
          JSON.stringify({ transactions: enriched, stats, page, pageSize, hasMore }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "phone-alerts": {
        const limit = parseInt(url.searchParams.get("limit") || "50");

        // Get from both chat_moderation_logs AND host_contact_violations
        const [moderationRes, violationsRes] = await Promise.all([
          supabase
            .from("chat_moderation_logs")
            .select(`
              id, user_id, conversation_id, detected_content, action_taken, created_at, notes, violation_type
            `)
            .neq("violation_type", "user_report")
            .order("created_at", { ascending: false })
            .limit(limit),
          supabase
            .from("host_contact_violations")
            .select(`
              id, host_id, detected_content, detected_pattern, source_type, source_id, 
              beans_deducted, violation_number, created_at
            `)
            .order("created_at", { ascending: false })
            .limit(limit),
        ]);

        // Collect all user IDs
        const userIds = new Set<string>();
        (moderationRes.data || []).forEach((a: any) => userIds.add(a.user_id));
        (violationsRes.data || []).forEach((v: any) => userIds.add(v.host_id));

        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, app_uid, is_host, is_blocked, country_flag")
          .in("id", Array.from(userIds));

        const profileMap: Record<string, any> = {};
        (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

        // Merge and deduplicate alerts
        const alertMap = new Map<string, any>();

        (moderationRes.data || []).forEach((a: any) => {
          alertMap.set(a.id, {
            id: a.id,
            user_id: a.user_id,
            conversation_id: a.conversation_id,
            detected_content: a.detected_content,
            action_taken: a.action_taken,
            created_at: a.created_at,
            notes: a.notes,
            source: 'chat_moderation',
            user: profileMap[a.user_id] || null,
          });
        });

        (violationsRes.data || []).forEach((v: any) => {
          alertMap.set('v_' + v.id, {
            id: 'v_' + v.id,
            user_id: v.host_id,
            conversation_id: v.source_id || null,
            detected_content: v.detected_content,
            action_taken: v.beans_deducted > 0 ? `${v.beans_deducted} beans deducted` : 'warned',
            created_at: v.created_at,
            notes: `Violation #${v.violation_number} | ${v.source_type} | Pattern: ${v.detected_pattern}`,
            source: 'host_violation',
            violation_number: v.violation_number,
            beans_deducted: v.beans_deducted,
            user: profileMap[v.host_id] || null,
          });
        });

        // Sort by created_at desc
        const alerts = Array.from(alertMap.values())
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, limit);

        return new Response(JSON.stringify({ alerts }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error: unknown) {
    console.error("Chat inspector error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
