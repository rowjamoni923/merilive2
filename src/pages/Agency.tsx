import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  ChevronRight, 
  Building2,
  UserPlus,
  Crown,
  Users,
  Sparkles,
  Shield,
  TrendingUp,
  Gift,
  Wallet,
  BadgeDollarSign,
  Clock,
  Globe,
  HeadphonesIcon,
  Banknote
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { recordClientError } from "@/utils/clientErrorLog";

interface CommissionTier {
  id: string;
  level_code: string;
  level_name: string;
  commission_rate: number;
  display_order: number;
}

interface HelperTier {
  id: string;
  level_number: number;
  level_name: string;
  commission_rate: number;
}

const Agency = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [agency, setAgency] = useState<any>(null);
  const [commissionTiers, setCommissionTiers] = useState<CommissionTier[]>([]);
  const [helperTiers, setHelperTiers] = useState<HelperTier[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch commission tiers from database
        const { data: tiersData } = await supabase
          .from("agency_level_tiers")
          .select("id, level_code, level_name, commission_rate, display_order")
          .eq("is_active", true)
          .order("display_order", { ascending: true });
        
        if (tiersData && tiersData.length > 0) {
          setCommissionTiers(tiersData);
        }

        // Fetch helper level tiers from database
        const { data: helperData } = await supabase
          .from("helper_level_config")
          .select("id, level_number, level_name, commission_rate")
          .eq("is_enabled", true)
          .order("level_number", { ascending: true });
        
        if (helperData && helperData.length > 0) {
          setHelperTiers(helperData);
        }

        const { getCachedUser } = await import('@/utils/cachedAuth');
        const user = await getCachedUser();
        if (user) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();
          setProfile(profileData);

          // FAST CHECK: If profile says user is agency owner, redirect immediately
          if (profileData?.is_agency_owner) {
            navigate("/agency-dashboard", { replace: true });
            return;
          }

          // Check if user owns an agency (RLS now allows owner access)
          let userAgency = null;
          
          const { data: ownedAgency } = await supabase
            .from("agencies")
            .select("*")
            .eq("owner_id", user.id)
            .maybeSingle();
          
          if (ownedAgency) {
            userAgency = ownedAgency;
          } else if (profileData?.agency_id) {
            const { data: agencyData } = await supabase
              .from("agencies")
              .select("*")
              .eq("id", profileData.agency_id)
              .maybeSingle();
            userAgency = agencyData;
          }
          
          setAgency(userAgency);

          // If user owns an active agency, redirect to dashboard
          if (userAgency?.is_active && !userAgency?.is_blocked) {
            navigate("/agency-dashboard", { replace: true });
            return;
          }

          // Check if user is an approved host in an agency - redirect to agency details
          const { data: hostData } = await supabase
            .from("agency_hosts")
            .select("id, status")
            .eq("host_id", user.id)
            .eq("status", "active")
            .maybeSingle();

          if (hostData) {
            // Host is approved in an agency, redirect to agency details page
            navigate("/agency-details", { replace: true });
            return;
          }
        }
      } catch (error) {
        console.error('[Agency] Error fetching data:', error);
        recordClientError({ label: "Agency.user", message: error instanceof Error ? error.message : String(error) });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [navigate]);

  // Get min and max commission rates for display
  const minRate = commissionTiers.length > 0 
    ? Math.min(...commissionTiers.map(t => t.commission_rate)) 
    : 2;
  const maxRate = commissionTiers.length > 0 
    ? Math.max(...commissionTiers.map(t => t.commission_rate)) 
    : 20;
  
  // Separate regular tiers and diamond tier
  const regularTiers = commissionTiers.filter(t => t.level_code !== 'A5' && t.level_code !== 'diamond').slice(0, 4);
  const diamondTier = commissionTiers.find(t => t.level_code === 'A5' || t.level_code === 'diamond');

  // Loading state
  if (loading) {
    return <LoadingSpinner fullScreen size="lg" text="Loading Agency" />;
  }

  // User doesn't have an approved agency - show Apply/Join options
  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-br from-purple-50 via-white to-indigo-50 overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-40 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white safe-area-top shadow-lg">
        <div className="flex items-center h-14 px-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5" />
            Agency Center
          </h1>
          <div className="w-9" />
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        {/* Main Content */}
        <div className="p-4 space-y-4">
        {/* Hero Banner */}
        <div className="bg-gradient-to-br from-purple-600 via-indigo-600 to-purple-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-xl" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                <Crown className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Become an Agency Owner</h2>
                <p className="text-slate-700 text-sm">Manage hosts & earn commission</p>
              </div>
            </div>
            
            <p className="text-slate-600 text-sm">
              Create your own agency or join an existing one to start earning from host commissions.
            </p>
          </div>
        </div>

        {/* Create Agency Option */}
        <div 
          onClick={() => navigate("/agency-signup")}
          className="bg-white rounded-2xl p-5 shadow-lg border cursor-pointer hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/25">
              <Building2 className="w-7 h-7 text-slate-800" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg text-gray-800">Create Agency</h3>
              <p className="text-sm text-gray-500">Start your own agency and manage hosts</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </div>

        {/* Join Agency Option */}
        <div 
          onClick={() => navigate("/join-agency")}
          className="bg-white rounded-2xl p-5 shadow-lg border cursor-pointer hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <UserPlus className="w-7 h-7 text-slate-800" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg text-gray-800">Join Agency</h3>
              <p className="text-sm text-gray-500">Join an existing agency with invite code</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Benefits Section */}
      <div className="mx-4 mt-2">
        <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide flex items-center gap-2">
          <Gift className="w-4 h-4 text-purple-500" />
          Agency Benefits
        </h3>
        
        <div className="bg-white rounded-2xl p-5 shadow-lg border space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800">Earn Commission</h4>
              <p className="text-sm text-gray-500">Get {minRate}% - {maxRate}% commission from your hosts' earnings</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800">Unlimited Hosts</h4>
              <p className="text-sm text-gray-500">Add unlimited hosts to your agency</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <Crown className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800">Ranking Rewards</h4>
              <p className="text-sm text-gray-500">Compete in rankings and earn bonus rewards</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800">Sub-Agent System</h4>
              <p className="text-sm text-gray-500">Build your network by recruiting sub-agents and earn commission from their agency earnings</p>
            </div>
          </div>
        </div>
      </div>

      {/* Payroll Helper System Section */}
      <div className="mx-4 mt-4">
        <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide flex items-center gap-2">
          <Wallet className="w-4 h-4 text-emerald-500" />
          Payroll Helper System
        </h3>
        
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-5 shadow-lg border border-emerald-200 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
              <BadgeDollarSign className="w-6 h-6 text-slate-800" />
            </div>
            <div>
              <h4 className="font-bold text-gray-800">Become a Payroll Helper</h4>
              <p className="text-xs text-gray-500">Process payments & earn diamond rewards</p>
            </div>
          </div>

          <p className="text-sm text-gray-600">
            Payroll Helpers are trusted agents who process user top-ups and agency withdrawals. 
            Earn diamond rewards for every successful transaction you complete.
          </p>

          {/* Helper Responsibilities */}
          <div className="bg-white rounded-xl p-4 border border-emerald-100">
            <h5 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <HeadphonesIcon className="w-4 h-4 text-emerald-600" />
              Helper Responsibilities
            </h5>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                Process user diamond top-up requests
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                Handle agency withdrawal payments
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                Verify payment screenshots & transaction IDs
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                Maintain minimum wallet balance of 300,000 diamonds
              </li>
            </ul>
          </div>

          {/* Helper Benefits */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl p-3 border border-emerald-100">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center mb-2">
                <Banknote className="w-4 h-4 text-emerald-600" />
              </div>
              <h6 className="font-semibold text-gray-800 text-sm">Earn Rewards</h6>
              <p className="text-xs text-gray-500">Get diamond rewards per transaction</p>
            </div>
            
            <div className="bg-white rounded-xl p-3 border border-emerald-100">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mb-2">
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <h6 className="font-semibold text-gray-800 text-sm">Flexible Hours</h6>
              <p className="text-xs text-gray-500">Work anytime, anywhere</p>
            </div>
            
            <div className="bg-white rounded-xl p-3 border border-emerald-100">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mb-2">
                <Globe className="w-4 h-4 text-purple-600" />
              </div>
              <h6 className="font-semibold text-gray-800 text-sm">Global Reach</h6>
              <p className="text-xs text-gray-500">Serve users worldwide</p>
            </div>
            
            <div className="bg-white rounded-xl p-3 border border-emerald-100">
              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center mb-2">
                <TrendingUp className="w-4 h-4 text-amber-600" />
              </div>
              <h6 className="font-semibold text-gray-800 text-sm">Level Up</h6>
              <p className="text-xs text-gray-500">Higher levels = better rates</p>
            </div>
          </div>

          {/* Helper Levels Info - Dynamic from Database */}
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl p-4 text-white">
            <h5 className="font-semibold mb-3 flex items-center gap-2">
              <Crown className="w-4 h-4" />
              Helper Level Commission Rates
            </h5>
            {helperTiers.length > 0 ? (
              <>
                <div className={`grid gap-2 text-center text-xs ${helperTiers.length <= 5 ? `grid-cols-${helperTiers.length}` : 'grid-cols-5'}`}>
                  {helperTiers.map((tier, index) => (
                    <div 
                      key={tier.id} 
                      className={`rounded-lg p-2 ${
                        index === helperTiers.length - 1 
                          ? 'bg-white/30 ring-2 ring-white/50' 
                          : 'bg-white/20'
                      }`}
                    >
                      <p className="font-bold">{tier.level_name}</p>
                      <p className={index === helperTiers.length - 1 ? 'text-slate-700' : 'text-slate-700'}>
                        {tier.commission_rate}%
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-600 mt-3 text-center">
                  Commission rates based on weekly transaction volume
                </p>
              </>
            ) : (
              <div className="text-center py-2">
                <p className="text-sm text-slate-700">Loading helper levels...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Commission Structure */}
      <div className="mx-4 mt-4 mb-8">
        <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Commission Tiers</h3>
        
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-200">
          {regularTiers.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                {regularTiers.map((tier) => (
                  <div key={tier.id} className="bg-white rounded-xl p-3 text-center border border-amber-100">
                    <p className="text-xs text-gray-500 mb-1">{tier.level_name} ({tier.level_code})</p>
                    <p className="text-xl font-bold text-amber-600">{tier.commission_rate}%</p>
                  </div>
                ))}
              </div>
              {diamondTier && (
                <div className="mt-3 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl p-3 text-center text-white">
                  <p className="text-xs mb-1">💎 {diamondTier.level_name} ({diamondTier.level_code})</p>
                  <p className="text-2xl font-bold">{diamondTier.commission_rate}%</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <p className="text-sm">Loading commission tiers...</p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default Agency;
