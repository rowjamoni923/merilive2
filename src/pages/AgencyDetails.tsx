import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Building2,
  Crown,
  Users,
  Hash,
  Star,
  TrendingUp,
  MessageCircle,
  ExternalLink,
  CheckCircle2,
  Calendar
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUser } from "@/utils/cachedAuth";
import { usePersistedCache } from "@/hooks/usePersistedCache";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { recordClientError } from "@/utils/clientErrorLog";
import FramedAvatarWithPrivileges from "@/components/common/FramedAvatarWithPrivileges";


interface AgencyDetails {
  id: string;
  name: string;
  agency_code: string;
  level: string;
  logo_url: string | null;
  commission_rate: number;
  total_hosts: number;
  total_agents: number;
  wallet_balance: number;
  diamond_balance: number;
  owner_id: string;
  created_at: string;
  whatsapp_number: string | null;
  owner?: {
    display_name: string;
    avatar_url: string | null;
    app_uid: string;
    country_flag: string | null;
    user_level: number;
  };
}

interface HostAgencyRequest {
  id: string;
  agency_id: string;
  host_id: string;
  status: string;
  joined_at: string | null;
  agency_name: string;
  agency_code: string;
  agency_logo: string | null;
}

const getLevelColor = (level: string) => {
  switch(level) {
    case 'A5': return 'from-brand-500 to-info-600';
    case 'A4': return 'from-warning-500 to-warning-500';
    case 'A3': return 'from-gray-400 to-gray-600';
    case 'A2': return 'from-warning-400 to-warning-500';
    default: return 'from-success-500 to-success-600';
  }
};

const getLevelName = (level: string) => {
  switch(level) {
    case 'A5': return 'Diamond';
    case 'A4': return 'Gold';
    case 'A3': return 'Silver';
    case 'A2': return 'Bronze';
    default: return 'Starter';
  }
};

const AgencyDetailsPage = () => {
  const navigate = useNavigate();
  const [hostAgency, setHostAgency, hadAgencyCache] = usePersistedCache<AgencyDetails | null>('agencyDetails:hostAgency', null);
  const [loading, setLoading] = useState(!hadAgencyCache);
  const [currentUserUid, setCurrentUserUid] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const isOwner = !!currentUserId && currentUserId === hostAgency?.owner_id;


  useEffect(() => {
    const fetchData = async () => {
      if (!hostAgency) setLoading(true);
      try {
        const user = await getCachedUser();
        if (!user) { navigate("/auth"); return; }
        setCurrentUserId(user.id);

        // Get current user's app_uid
        const { data: myProfile } = await supabase
          .from("profiles").select("app_uid").eq("id", user.id).maybeSingle();
        if (myProfile?.app_uid) setCurrentUserUid(myProfile.app_uid);


        const { data: hostRequests, error: hostRequestError } = await supabase.rpc("get_host_agency_request", { _host_id: user.id });

        if (hostRequestError) throw hostRequestError;

        const activeRequest = ((hostRequests || []) as HostAgencyRequest[]).find((request) => request.status === "active");

        if (activeRequest?.agency_id) {
          const { data: agencyData, error: agencyError } = await supabase
            .from("agencies_public")
            .select("id, name, agency_code, level, logo_url, total_hosts, total_agents, owner_id, created_at")
            .eq("id", activeRequest.agency_id)
            .maybeSingle();

          if (agencyError) throw agencyError;

          const normalizedAgency = {
            id: activeRequest.agency_id,
            name: agencyData?.name || activeRequest.agency_name,
            agency_code: agencyData?.agency_code || activeRequest.agency_code,
            level: agencyData?.level || 'A1',
            logo_url: agencyData?.logo_url || activeRequest.agency_logo || null,
            commission_rate: 0,
            total_hosts: agencyData?.total_hosts || 0,
            total_agents: agencyData?.total_agents || 0,
            wallet_balance: 0,
            diamond_balance: 0,
            owner_id: agencyData?.owner_id || '',
            created_at: agencyData?.created_at || activeRequest.joined_at || new Date().toISOString(),
            whatsapp_number: null,
          };

          const { data: ownerData } = normalizedAgency.owner_id
            ? await supabase
                .from("profiles_public")
                .select("id, display_name, avatar_url, app_uid, country_flag, user_level")
                .eq("id", normalizedAgency.owner_id)
                .maybeSingle()
            : { data: null };

          // Fetch WhatsApp number via security-definer RPC (only active host / owner / sub-agent gets it back)
          let whatsappNumber: string | null = null;
          try {
            const { data: contactRows } = await supabase.rpc("get_my_agency_contact", {
              _agency_id: activeRequest.agency_id,
            });
            const first = Array.isArray(contactRows) ? contactRows[0] : contactRows;
            const wa = (first as any)?.whatsapp_number;
            if (wa && String(wa).trim()) whatsappNumber = String(wa).trim();
          } catch (waErr) {
            console.warn("[AgencyDetails] whatsapp fetch failed:", waErr);
          }

          setHostAgency({
            ...normalizedAgency,
            owner: ownerData ? {
              ...ownerData,
              avatar_url: ownerData.avatar_url || null,
              country_flag: ownerData.country_flag || null
            } : undefined
          });
        } else {
          navigate("/agency");
          return;
        }

      } catch (error) {
        console.error('[AgencyDetails] Error:', error);
        recordClientError({ label: "AgencyDetails.user", message: error instanceof Error ? error.message : String(error) });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [navigate]);

  const openWhatsApp = () => {
    if (!hostAgency?.whatsapp_number) return;
    const cleanNumber = hostAgency.whatsapp_number.replace(/\D/g, '');
    const defaultMessage = encodeURIComponent(`You are host. Host ID: ${currentUserUid}`);
    window.open(`https://wa.me/${cleanNumber}?text=${defaultMessage}`, '_blank');
  };

  if (loading) return (
    <PageSkeleton
      className="fixed inset-0 flex flex-col bg-gradient-to-br from-slate-50 via-white to-brand-50/40 overflow-hidden"
      headerClassName="bg-gradient-to-r from-brand-600 via-info-600 to-brand-700"
    />
  );
  if (!hostAgency) {
    return (
      <PageSkeleton
        className="fixed inset-0 flex flex-col bg-gradient-to-br from-slate-50 via-white to-brand-50/40 overflow-hidden"
        headerClassName="bg-gradient-to-r from-brand-600 via-info-600 to-brand-700"
        rows={4}
      />
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-br from-slate-50 via-white to-brand-50/40">
      {/* Header */}
      <header className={`flex-shrink-0 sticky top-0 z-40 bg-gradient-to-r ${getLevelColor(hostAgency.level || 'A1')} text-white safe-area-top shadow-xl`}>
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
        <div className="relative flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-white/20 active:bg-white/30 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold flex items-center justify-center gap-2 tracking-wide">
            <Building2 className="w-5 h-5" />
            Agency Details
          </h1>
          <div className="w-9" />
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        <div className="px-4 space-y-4 pt-5">
          {/* Agency Info Card */}
          <div className="relative overflow-hidden bg-white/90 backdrop-blur-sm rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white ring-1 ring-black/[0.03]">
            <div className={`absolute -top-20 -right-20 w-48 h-48 rounded-full bg-gradient-to-br ${getLevelColor(hostAgency.level || 'A1')} opacity-[0.08] blur-3xl pointer-events-none`} />
            <div className="relative flex items-center gap-4">
              <div className={`p-[2px] rounded-full bg-gradient-to-br ${getLevelColor(hostAgency.level || 'A1')}`}>
                <AvatarWithFrame
                  src={enhanceThumbnail(hostAgency.logo_url || undefined, { width: 96, quality: 82})}
                  name={(hostAgency as any)?.display_name || (hostAgency as any)?.agency_name || (hostAgency as any)?.name || "U"}
                  level={1}
                  size="lg"
                  showFrame={true}
                  showAnimation={false}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <h2 className="font-bold text-gray-900 text-xl truncate tracking-tight">{hostAgency.name}</h2>
                  <Badge className={`bg-gradient-to-r ${getLevelColor(hostAgency.level || 'A1')} text-white border-0 shadow-sm`}>
                    <Star className="w-3 h-3 mr-1 fill-white" />
                    {getLevelName(hostAgency.level || 'A1')}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500 flex items-center gap-1 font-mono tracking-wider">
                  <Hash className="w-3.5 h-3.5" />
                  {hostAgency.agency_code}
                </p>
              </div>
            </div>

            <div className={`grid ${isOwner ? 'grid-cols-2' : 'grid-cols-1'} gap-3 mt-6`}>
              {isOwner && (
                <div className="relative overflow-hidden p-4 bg-gradient-to-br from-brand-50 to-brand-100/50 rounded-2xl border border-brand-100/80">
                  <Users className="absolute -bottom-2 -right-2 w-12 h-12 text-brand-200/60" />
                  <p className="text-[11px] uppercase tracking-wider text-brand-600 font-semibold flex items-center gap-1 mb-1">
                    <Users className="w-3.5 h-3.5" /> Hosts
                  </p>
                  <p className="text-2xl font-bold text-brand-900">{hostAgency.total_hosts || 0}</p>
                </div>
              )}
              <div className="relative overflow-hidden p-4 bg-gradient-to-br from-amber-50 to-amber-100/40 rounded-2xl border border-amber-100/80">
                <Calendar className="absolute -bottom-2 -right-2 w-12 h-12 text-amber-200/60" />
                <p className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold flex items-center gap-1 mb-1">
                  <Calendar className="w-3.5 h-3.5" /> Joined
                </p>
                <p className="text-base font-bold text-amber-900">{new Date(hostAgency.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Owner Details Card */}
          {hostAgency.owner && (
            <div className="relative overflow-hidden bg-white/90 backdrop-blur-sm rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white ring-1 ring-black/[0.03]">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 tracking-tight">
                <Crown className="w-5 h-5 text-amber-500" />
                Agency Owner
              </h3>

              <div className="relative flex items-center gap-4 p-4 bg-gradient-to-br from-amber-50 via-orange-50/50 to-amber-50 rounded-2xl border border-amber-100/80 shadow-inner">
                <div className="relative flex-shrink-0 w-16 h-16">
                  <FramedAvatarWithPrivileges
                    userId={hostAgency.owner.id}
                    src={hostAgency.owner.avatar_url || undefined}
                    name={hostAgency.owner.display_name || 'O'}
                    level={hostAgency.owner.user_level || 1}
                    size="md"
                    showFrame
                    showAnimation
                    showGlow={(hostAgency.owner.user_level || 0) >= 5}
                  />
                  {hostAgency.owner.country_flag && (
                    <span className="absolute -bottom-1 -right-1 text-lg drop-shadow z-10">{hostAgency.owner.country_flag}</span>
                  )}

                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-gray-900 text-lg truncate">{hostAgency.owner.display_name}</h4>
                    <Crown className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  </div>
                  <p className="text-sm text-gray-500 font-mono">ID: {hostAgency.owner.app_uid}</p>
                  <Badge className="mt-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 shadow-sm">
                    Level {hostAgency.owner.user_level}
                  </Badge>
                </div>
              </div>

              {/* Contact Options */}
              <div className={`grid ${hostAgency.whatsapp_number ? 'grid-cols-3' : 'grid-cols-2'} gap-3 mt-4`}>
                <Button variant="outline" className="border-brand-200 text-brand-700 hover:bg-brand-50 rounded-xl shadow-sm"
                  onClick={() => navigate(`/profile/${hostAgency.owner?.id}`)}>
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Profile
                </Button>
                <Button variant="outline" className="border-info-200 text-info-700 hover:bg-info-50 rounded-xl shadow-sm"
                  onClick={() => navigate(`/chat?user=${hostAgency.owner?.id}`)}>
                  <MessageCircle className="w-4 h-4 mr-1" />
                  Message
                </Button>
                {hostAgency.whatsapp_number && (
                  <Button variant="outline" className="border-success-200 text-success-700 hover:bg-success-50 rounded-xl shadow-sm"
                    onClick={openWhatsApp}>
                    <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WhatsApp
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Your Status Card */}
          <div className="relative overflow-hidden bg-white/90 backdrop-blur-sm rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white ring-1 ring-black/[0.03]">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 tracking-tight">
              <CheckCircle2 className="w-5 h-5 text-success-500" />
              Your Status
            </h3>
            <div className="relative overflow-hidden p-4 bg-gradient-to-br from-success-50 via-emerald-50/60 to-success-50 rounded-2xl border border-success-100/80 shadow-inner">
              <TrendingUp className="absolute -bottom-3 -right-3 w-20 h-20 text-success-200/40" />
              <div className="relative flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-success-400 to-emerald-500 rounded-full flex items-center justify-center shadow-md ring-2 ring-white">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-bold text-success-900 text-base">Active Host</p>
                  <p className="text-sm text-success-700">You are an active host in this agency</p>
                </div>
              </div>
            </div>
          </div>

          <div className="pb-8" />
        </div>
      </div>
    </div>
  );
};

export default AgencyDetailsPage;

