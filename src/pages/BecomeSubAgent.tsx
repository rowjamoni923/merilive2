import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Users,
  TrendingUp,
  Gift,
  Loader2,
  CheckCircle2,
  Building2,
  Coins,
  Copy,
  Share2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const BecomeSubAgent = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  
  // Support both ?agency= and ?ref= parameters for backward compatibility
  const agencyParam = searchParams.get("agency") || searchParams.get("ref") || "";
  const [agencyCode, setAgencyCode] = useState(agencyParam);
  const [loading, setLoading] = useState(false);
  const [agency, setAgency] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isSubAgent, setIsSubAgent] = useState(false);
  const [myReferralCode, setMyReferralCode] = useState("");

  useEffect(() => {
    checkCurrentUser();
    if (agencyParam) {
      setAgencyCode(agencyParam);
      fetchAgency(agencyParam);
    }
  }, []);

  const checkCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const refCode = searchParams.get("agency") || searchParams.get("ref");
    
    if (!user) {
      // Save sub-agent agency code for after signup
      if (refCode) {
        localStorage.setItem("meri_pending_subagent", refCode);
      }
      // Redirect to auth, then after signup redirect to become-sub-agent
      navigate(`/auth?subagent=${refCode || ''}`);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    setCurrentUser(profile);

    // Check if user already owns an agency
    const { data: existingAgency } = await supabase
      .from("agencies")
      .select("id, agency_code")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (existingAgency) {
      // User already has an agency, go to dashboard
      toast({
        title: "You Already Have an Agency",
        description: "Redirecting you to the dashboard",
      });
      navigate("/agency-dashboard");
      return;
    }

    // Check if already a sub-agent
    const { data: existingSubAgent } = await supabase
      .from("sub_agents")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (existingSubAgent) {
      setIsSubAgent(true);
      setMyReferralCode(existingSubAgent.referral_code);
      
      // Fetch the agency for this sub-agent
      const { data: subAgentAgency } = await supabase
        .from("agencies")
        .select("agency_code")
        .eq("id", existingSubAgent.agency_id)
        .maybeSingle();
      
      if (subAgentAgency) {
        fetchAgency(subAgentAgency.agency_code);
      }
    } else if (refCode) {
      // Auto-search the agency so the user can become a sub-agent
      setAgencyCode(refCode);
      fetchAgency(refCode);
    }
  };

  const fetchAgency = async (code: string) => {
    const { data } = await supabase.rpc('get_agency_by_code', {
      agency_code: code.toUpperCase()
    });

    if (data && data.length > 0) {
      setAgency(data[0]);
    }
  };

  const searchAgency = async () => {
    if (!agencyCode.trim()) {
      toast({
        title: "Error",
        description: "Please enter agency code",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    
    const { data } = await supabase.rpc('get_agency_by_code', {
      agency_code: agencyCode.toUpperCase()
    });

    if (data && data.length > 0) {
      setAgency(data[0]);
    } else {
      setAgency(null);
      toast({
        title: "Agency not found",
        description: "Please enter a valid agency code",
        variant: "destructive",
      });
    }
    
    setLoading(false);
  };

  const becomeSubAgent = async () => {
    if (!currentUser || !agency) return;

    setLoading(true);
    try {
      // Pkg72: DB signature is (_agency_id, _user_id, _name, _commission_rate DEFAULT 5).
      // Previous call passed _referrer_id which doesn't exist → sub-agent creation 100% failed.
      const subAgentName =
        currentUser?.display_name?.trim() ||
        currentUser?.username?.trim() ||
        `Sub-Agent ${(currentUser?.app_uid || currentUser?.id || '').toString().slice(-6)}`;

      const { data, error } = await supabase.rpc('create_sub_agent', {
        _agency_id: agency.id,
        _user_id: currentUser.id,
        _name: subAgentName,
      });

      if (error) throw error;

      // Fetch the created sub-agent to get referral code
      const { data: subAgentData } = await supabase
        .from("sub_agents")
        .select("referral_code")
        .eq("id", data)
        .single();

      if (subAgentData) {
        setMyReferralCode(subAgentData.referral_code);
        setIsSubAgent(true);
      }

      toast({
        title: "✅ You're now a Sub-Agent!",
        description: "You have successfully joined as a sub-agent",
      });

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyReferralLink = async () => {
    const { generateSmartLink } = await import('@/utils/shareLinks');
    const link = generateSmartLink('/join-agency', { 
      code: agency?.agency_code || '', 
      ref: myReferralCode 
    });
    navigator.clipboard.writeText(link);
    toast({ title: "✅ Link Copied" });
  };

  const shareReferralLink = async () => {
    const { generateSmartLink, shareLink } = await import('@/utils/shareLinks');
    const link = generateSmartLink('/join-agency', { 
      code: agency?.agency_code || '', 
      ref: myReferralCode 
    });
    await shareLink(link, {
      title: "Join as Host",
      text: "Join this agency as a host and start earning!"
    });
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-10 bg-gradient-to-r from-orange-500 to-amber-500 text-white safe-area-top">
        <div className="flex items-center h-14 px-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-7">
            Become Sub-Agent
          </h1>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        {/* Hero */}
        <div className="mx-4 mt-4 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Sub-Agent Program</h2>
            <p className="text-slate-700 text-sm">Earn by referring</p>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-white/20 rounded-xl p-3 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1" />
            <p className="text-lg font-bold">2%</p>
            <p className="text-xs text-slate-700">Commission</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3 text-center">
            <Gift className="w-5 h-5 mx-auto mb-1" />
            <p className="text-lg font-bold">Bonus</p>
            <p className="text-xs text-slate-700">Top Referrer</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3 text-center">
            <Coins className="w-5 h-5 mx-auto mb-1" />
            <p className="text-lg font-bold">Unlimited</p>
            <p className="text-xs text-slate-700">Referrals</p>
          </div>
        </div>
      </div>

      {isSubAgent ? (
        /* Already a Sub-Agent */
        <div className="mx-4 mt-4 space-y-4">
          <div className="bg-green-50 rounded-2xl p-5 border border-green-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-bold text-green-800">You're a Sub-Agent!</h3>
                <p className="text-sm text-green-600">Start referring now</p>
              </div>
            </div>
            
            <div className="bg-white rounded-xl p-4 border">
              <Label className="text-sm text-gray-500">Your Referral Code</Label>
              <p className="text-2xl font-bold font-mono text-orange-600">{myReferralCode}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border">
            <h3 className="font-semibold mb-3">📢 Refer Hosts</h3>
            <p className="text-sm text-gray-600 mb-4">
              Share your referral link. When someone becomes a host through your link, you'll earn 2% commission from their earnings!
            </p>
            <div className="flex gap-2">
              <Button 
                onClick={copyReferralLink}
                variant="outline" 
                className="flex-1"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Link
              </Button>
              <Button 
                onClick={shareReferralLink}
                className="flex-1 bg-orange-500 hover:bg-orange-600"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
              <p className="text-3xl font-bold text-orange-600">0</p>
              <p className="text-sm text-gray-500">Total Referrals</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
              <p className="text-3xl font-bold text-green-600">0</p>
              <p className="text-sm text-gray-500">Total Earnings</p>
            </div>
          </div>
        </div>
      ) : (
        /* Become Sub-Agent Form */
        <div className="mx-4 mt-4 space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border">
            <Label className="text-sm font-semibold mb-3 block">Enter Agency Code</Label>
            <div className="flex gap-2">
              <Input
                placeholder="AGXXXXXX"
                value={agencyCode}
                onChange={(e) => setAgencyCode(e.target.value.toUpperCase())}
              />
              <Button onClick={searchAgency} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
              </Button>
            </div>

            {agency && (
              <div className="mt-4 p-4 bg-orange-50 rounded-xl border border-orange-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-slate-800" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{agency.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-500 text-slate-800 text-xs">{agency.level}</Badge>
                      <span className="text-xs text-gray-500">{agency.total_hosts} Hosts</span>
                    </div>
                  </div>
                </div>
                
                <Button
                  onClick={becomeSubAgent}
                  disabled={loading}
                  className="w-full mt-4 bg-orange-500 hover:bg-orange-600"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Users className="w-4 h-4 mr-2" />
                  )}
                  Become Sub-Agent of This Agency
                </Button>
              </div>
            )}
          </div>

          {/* Benefits */}
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-4 border border-orange-100">
            <h3 className="font-semibold text-orange-800 mb-3">🎯 Sub-Agent Benefits</h3>
            <ul className="text-sm text-orange-700 space-y-2">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-orange-500" />
                2% commission from your referred hosts' earnings
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-orange-500" />
                Unlimited referral opportunities
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-orange-500" />
                Top referrer bonus
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-orange-500" />
                Direct wallet payment
              </li>
            </ul>
          </div>

          {/* How it works */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border">
            <h3 className="font-semibold mb-3">📋 How It Works?</h3>
            <ol className="text-sm text-gray-600 space-y-3">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</span>
                <span>Enter agency code to become a sub-agent</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</span>
                <span>Share your referral link</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">3</span>
                <span>New hosts join through your link</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">4</span>
                <span>You earn commission from their earnings!</span>
              </li>
            </ol>
          </div>

          {/* Or Create Your Own Agency */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-4 border border-purple-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <Building2 className="w-5 h-5 text-slate-800" />
              </div>
              <div>
                <h3 className="font-semibold text-purple-800">Create Your Own Agency</h3>
                <p className="text-xs text-purple-600">Become an agency owner and earn more</p>
              </div>
            </div>
            <p className="text-sm text-purple-700 mb-3">
              Besides being a sub-agent, you can also create your own agency. As an agency owner, you'll earn commission from your hosts' earnings.
            </p>
            <Button
              onClick={() => navigate("/create-agency")}
              className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700"
            >
              <Building2 className="w-4 h-4 mr-2" />
              Create Agency
            </Button>
          </div>
        </div>
      )}

      </div>
    </div>
  );
};

export default BecomeSubAgent;
