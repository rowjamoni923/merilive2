import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Users, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function GroupInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "ready" | "joining" | "done" | "error">("loading");
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) { navigate(`/auth?next=${encodeURIComponent(`/invite/${token}`)}`); return; }
        const { data, error } = await supabase.from("groups")
          .select("id,name,description,avatar_url,group_type,member_count,is_public,invite_expires_at,invite_max_uses,invite_used_count")
          .eq("invite_token", token!).maybeSingle();
        if (error || !data) { setError("Invite link is invalid or expired."); setState("error"); return; }
        setGroupInfo(data); setState("ready");
      } catch (e: any) { setError(e?.message || "Failed to load"); setState("error"); }
    })();
  }, [token, navigate]);

  const join = async () => {
    setState("joining");
    try {
      const { data, error } = await supabase.rpc("join_via_invite", { p_token: token! });
      if (error) throw error;
      const res: any = data;
      if (res?.status === "joined" || res?.status === "already_member") {
        toast.success(res.status === "joined" ? "Joined group!" : "You are already a member");
        navigate(`/chat?group=${res.group_id}`);
      } else if (res?.status === "pending") {
        toast.success("Join request sent. Waiting for approval.");
        setState("done");
      }
    } catch (e: any) { toast.error(e?.message || "Failed to join"); setState("ready"); }
  };

  if (state === "loading") return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (state === "error") return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-3">
      <XCircle className="w-12 h-12 text-destructive" />
      <div className="font-semibold">{error}</div>
      <Button onClick={() => navigate("/chat")}>Go to chat</Button>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="max-w-sm w-full bg-card border rounded-2xl shadow-lg p-6 text-center">
        <div className="mx-auto w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-white text-3xl font-bold mb-4">
          {groupInfo?.avatar_url ? <img src={groupInfo.avatar_url} alt="" className="w-full h-full object-cover" /> : (groupInfo?.name || "G").slice(0,2).toUpperCase()}
        </div>
        <div className="text-xl font-bold">{groupInfo?.name}</div>
        <div className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1"><Users className="w-4 h-4" />{groupInfo?.member_count} members · {groupInfo?.group_type}</div>
        {groupInfo?.description && <p className="text-sm text-muted-foreground mt-3">{groupInfo.description}</p>}
        {state === "done" ? (
          <div className="mt-5 flex flex-col items-center gap-2 text-emerald-600"><CheckCircle2 className="w-8 h-8" /><div className="text-sm">Request sent</div><Button variant="outline" onClick={() => navigate("/chat")}>Back to chat</Button></div>
        ) : (
          <Button className="w-full mt-5" disabled={state === "joining"} onClick={join}>
            {state === "joining" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Join group
          </Button>
        )}
      </div>
    </div>
  );
}
