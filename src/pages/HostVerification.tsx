import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2, Search, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { recordClientError } from "@/utils/clientErrorLog";
import { notifyAgencyHostRequest } from "@/utils/agencyNotifications";

/**
 * Host Registration = Agency join (mandatory) + Face Verification (same API as user flow).
 * After agency is joined (or skipped if already joined), navigate to /face-verification
 * which runs the real, single source-of-truth verification pipeline.
 */
const HostVerification = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [agencyCode, setAgencyCode] = useState((searchParams.get("ref") || "").toUpperCase());
  const [searching, setSearching] = useState(false);
  const [joining, setJoining] = useState(false);
  const [agencyInfo, setAgencyInfo] = useState<any>(null);
  const [alreadyInAgency, setAlreadyInAgency] = useState(false);

  // Boot: ensure auth, female gender, not-yet-approved host, and detect existing agency
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("gender, is_host, host_status, agency_id, is_face_verified")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) {
        setBootLoading(false);
        return;
      }

      // Only female users can register as host
      const isFemale = profile.gender === "female" || profile.gender === "Female";
      if (!isFemale) {
        toast({
          title: "Not Eligible",
          description: "Host registration is only available for female users.",
          variant: "destructive",
        });
        navigate("/profile");
        return;
      }

      if (profile.is_host && profile.host_status === "approved") {
        toast({ title: "Already Approved", description: "You are already an approved host." });
        navigate("/profile");
        return;
      }

      // If already in an agency, skip straight to face verification
      if (profile.agency_id) {
        setAlreadyInAgency(true);
      }

      setBootLoading(false);
    })();
  }, [navigate, toast]);

  // Auto-search if referral ref present
  useEffect(() => {
    if (searchParams.get("ref") && !agencyInfo) {
      void searchAgency();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchAgency = async () => {
    const code = agencyCode.trim().toUpperCase();
    if (!code) {
      toast({ title: "Enter Agency Code", description: "Please enter the agency code provided to you.", variant: "destructive" });
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase.rpc("get_agency_by_code", { agency_code: code });
      if (error) throw error;
      if (data && data.length > 0) {
        setAgencyInfo(data[0]);
        toast({ title: "✅ Agency Found", description: `${data[0].name} • Level ${data[0].level}` });
      } else {
        setAgencyInfo(null);
        toast({ title: "Agency Not Found", description: "Please double-check the code.", variant: "destructive" });
      }
    } catch (e) {
      recordClientError({ label: "HostVerification.searchAgency", message: e instanceof Error ? e.message : String(e) });
      toast({ title: "Error", description: "Failed to search agency.", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const joinAndContinue = async () => {
    if (!agencyInfo || !userId) return;
    setJoining(true);
    try {
      const { error } = await supabase.rpc("join_agency", { _target_agency_id: agencyInfo.id });
      if (error) throw error;
      try { notifyAgencyHostRequest(agencyInfo.id, "New Host Applicant"); } catch {}
      toast({ title: "Joined Agency", description: `Welcome to ${agencyInfo.name}. Continue with face verification.` });
      navigate("/face-verification");
    } catch (e: any) {
      recordClientError({ label: "HostVerification.joinAgency", message: e?.message || String(e) });
      toast({ title: "Could Not Join", description: e?.message || "Failed to join agency.", variant: "destructive" });
    } finally {
      setJoining(false);
    }
  };

  if (bootLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-base font-semibold text-foreground">Host Registration</h1>
            <p className="text-xs text-muted-foreground">Join an agency, then complete face verification</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {alreadyInAgency ? (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Agency Already Joined</h2>
                <p className="text-sm text-muted-foreground">Continue to complete face verification.</p>
              </div>
            </div>
            <Button
              className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white"
              onClick={() => navigate("/face-verification")}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Continue to Face Verification
            </Button>
          </div>
        ) : (
          <>
            {/* Step indicator */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Step 1 of 2</span>
              <span>Agency · Face Verification</span>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-pink-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Join an Agency</h2>
                  <p className="text-xs text-muted-foreground">Required to become a host</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agency-code">Agency Code</Label>
                <div className="flex gap-2">
                  <Input
                    id="agency-code"
                    value={agencyCode}
                    onChange={(e) => setAgencyCode(e.target.value.toUpperCase())}
                    placeholder="e.g. AG12345"
                    className="uppercase"
                    disabled={searching || joining}
                  />
                  <Button onClick={searchAgency} disabled={searching || joining} variant="secondary">
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ask your agency owner for their code, or open the referral link they shared.
                </p>
              </div>

              {agencyInfo && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <p className="font-semibold text-green-800">{agencyInfo.name}</p>
                  </div>
                  <p className="text-xs text-green-700">
                    Level {agencyInfo.level} • {agencyInfo.total_hosts || 0} Hosts
                  </p>
                </div>
              )}

              <Button
                className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white"
                disabled={!agencyInfo || joining}
                onClick={joinAndContinue}
              >
                {joining ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Join & Continue to Face Verification
                  </>
                )}
              </Button>

              {/* Optional: skip agency and go straight to face verification */}
              <Button
                variant="ghost"
                className="w-full text-muted-foreground hover:text-foreground"
                disabled={joining}
                onClick={() => navigate("/face-verification")}
              >
                Skip — I don't have an agency code
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center px-4">
              Agency is optional. You can apply as an independent host and join an agency later from your profile.
              The next step captures your profile photo, 3 gallery photos, intro video, and a live face scan — all using
              the same secure verification pipeline.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default HostVerification;

