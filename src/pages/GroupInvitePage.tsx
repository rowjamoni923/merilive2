import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Users, CheckCircle2, XCircle, LogIn } from "lucide-react";
import { toast } from "sonner";

type State = "loading" | "ready" | "joining" | "done" | "error" | "needs_auth";

export default function GroupInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<State>("loading");
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        setAuthed(!!sess.session);

        // Public preview RPC — works whether signed in or not
        const { data, error } = await supabase.rpc("get_group_invite_preview", { p_token: token! });
        if (error) throw error;
        const res: any = data;
        if (!res || res.status !== "ok") {
          setError(
            res?.status === "expired" ? "This invite link has expired."
            : res?.status === "exhausted" ? "This invite link has reached its maximum uses."
            : res?.status === "inactive" ? "This group is no longer active."
            : "Invite link is invalid."
          );
          setState("error");
          return;
        }
        setGroupInfo(res);
        setState(sess.session ? "ready" : "needs_auth");
      } catch (e: any) {
        setError(e?.message || "Failed to load invite.");
        setState("error");
      }
    })();
  }, [token]);

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
        toast.success("Join request sent. Waiting for admin approval.");
        setState("done");
      } else {
        toast.error(res?.message || "Could not join group");
        setState("ready");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to join");
      setState("ready");
    }
  };

  const goSignIn = () => {
    navigate(`/auth?next=${encodeURIComponent(`/invite/${token}`)}`);
  };

  if (state === "loading") {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  if (state === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-3">
        <XCircle className="w-12 h-12 text-destructive" />
        <div className="font-semibold">{error}</div>
        <Button onClick={() => navigate("/")}>Go home</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-background to-muted/30">
      <div className="max-w-sm w-full bg-card border rounded-2xl shadow-lg p-6 text-center">
        <div className="mx-auto w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-white text-3xl font-bold mb-4">
          {groupInfo?.avatar_url
            ? <img src={groupInfo.avatar_url} alt="" className="w-full h-full object-cover" />
            : (groupInfo?.name || "G").slice(0, 2).toUpperCase()}
        </div>
        <div className="text-xl font-bold">{groupInfo?.name}</div>
        <div className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
          <Users className="w-4 h-4" />{groupInfo?.member_count} members · {groupInfo?.group_type}
        </div>
        {groupInfo?.description && <p className="text-sm text-muted-foreground mt-3">{groupInfo.description}</p>}

        {state === "done" ? (
          <div className="mt-5 flex flex-col items-center gap-2 text-emerald-600">
            <CheckCircle2 className="w-8 h-8" />
            <div className="text-sm">Request sent</div>
            <Button variant="outline" onClick={() => navigate("/chat")}>Back to chat</Button>
          </div>
        ) : state === "needs_auth" ? (
          <div className="mt-5 space-y-2">
            <Button className="w-full" onClick={goSignIn}>
              <LogIn className="w-4 h-4 mr-2" />Sign in to join
            </Button>
            <p className="text-xs text-muted-foreground">You'll come back here after signing in.</p>
          </div>
        ) : (
          <Button className="w-full mt-5" disabled={state === "joining"} onClick={join}>
            {state === "joining" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Join group
          </Button>
        )}
      </div>
    </div>
  );
}
