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
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { recordClientError } from "@/utils/clientErrorLog";

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
    id: string;
    display_name: string;
    avatar_url: string | null;
    app_uid: string;
    country_flag: string | null;
    user_level: number;
  };
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
  const [loading, setLoading] = useState(true);
  const [hostAgency, setHostAgency] = useState<AgencyDetails | null>(null);
  const [currentUserUid, setCurrentUserUid] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const user = await getCachedUser();
        if (!user) { navigate("/auth"); return; }

        // Get current user's app_uid
        const { data: myProfile } = await supabase
          .from("profiles").select("app_uid").eq("id", user.id).maybeSingle();
        if (myProfile?.app_uid) setCurrentUserUid(myProfile.app_uid);

        const { data: hostData } = await supabase
          .from("agency_hosts")
          .select(`
            *,
            agency:agencies(
              id, name, agency_code, level, logo_url, commission_rate,
              total_hosts, total_agents, wallet_balance, diamond_balance,
              owner_id, created_at, whatsapp_number
            )
          `)
          .eq("host_id", user.id)
          .eq("status", "active")
          .maybeSingle();

        if (hostData?.agency) {
          const { data: ownerData } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url, app_uid, country_flag, user_level")
            .eq("id", hostData.agency.owner_id)
            .maybeSingle();

          setHostAgency({
            ...hostData.agency,
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

  if (loading) return <LoadingSpinner fullScreen size="lg" text="Loading Agency Details" />;
  if (!hostAgency) return null;

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-br from-brand-50 via-white to-info-50">
      {/* Header */}
      <header className={`flex-shrink-0 sticky top-0 z-40 bg-gradient-to-r ${getLevelColor(hostAgency.level || 'A1')} text-white safe-area-top shadow-lg`}>
        <div className="flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-white/20 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold flex items-center justify-center gap-2">
            <Building2 className="w-5 h-5" />
            Agency Details
          </h1>
          <div className="w-9" />
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        <div className="px-4 space-y-4 pt-4">
          {/* Owner Details Card */}
          {hostAgency.owner && (
            <div className="bg-white rounded-2xl p-5 shadow-lg border">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Crown className="w-5 h-5 text-warning-500" />
                Agency Owner
              </h3>
              
              <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-warning-50 to-warning-50 rounded-2xl border border-warning-100">
                <div className="relative">
                  <Avatar className="w-16 h-16 border-2 border-warning-300">
                    <AvatarImage src={hostAgency.owner.avatar_url || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-warning-400 to-warning-500 text-white text-xl">
                      {hostAgency.owner.display_name?.charAt(0) || 'O'}
                    </AvatarFallback>
                  </Avatar>
                  {hostAgency.owner.country_flag && (
                    <span className="absolute -bottom-1 -right-1 text-lg">{hostAgency.owner.country_flag}</span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-gray-800 text-lg">{hostAgency.owner.display_name}</h4>
                    <Crown className="w-4 h-4 text-warning-500" />
                  </div>
                  <p className="text-sm text-gray-500">ID: {hostAgency.owner.app_uid}</p>
                  <Badge className="mt-1 bg-gradient-to-r from-warning-500 to-warning-500 text-white border-0">
                    Level {hostAgency.owner.user_level}
                  </Badge>
                </div>
              </div>

              {/* Contact Options - Profile, Message, WhatsApp */}
              <div className={`grid ${hostAgency.whatsapp_number ? 'grid-cols-3' : 'grid-cols-2'} gap-3 mt-4`}>
                <Button variant="outline" className="border-brand-200 text-brand-700 hover:bg-brand-50"
                  onClick={() => navigate(`/profile/${hostAgency.owner?.id}`)}>
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Profile
                </Button>
                <Button variant="outline" className="border-info-200 text-info-700 hover:bg-info-50"
                  onClick={() => navigate(`/chat?user=${hostAgency.owner?.id}`)}>
                  <MessageCircle className="w-4 h-4 mr-1" />
                  Message
                </Button>
                {hostAgency.whatsapp_number && (
                  <Button variant="outline" className="border-success-200 text-success-700 hover:bg-success-50"
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
          <div className="bg-white rounded-2xl p-5 shadow-lg border">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success-500" />
              Your Status
            </h3>
            <div className="p-4 bg-gradient-to-br from-success-50 to-success-50 rounded-2xl border border-success-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-success-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-success-600" />
                </div>
                <div>
                  <p className="font-bold text-success-800">Active Host</p>
                  <p className="text-sm text-success-600">You are an active host in this agency</p>
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
