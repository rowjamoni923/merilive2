import { useState, useEffect } from "react";
import { 
  Building2, 
  Users, 
  Copy, 
  CheckCircle2, 
  Share2, 
  Crown,
  X,
  ExternalLink,
  UserPlus,
  TrendingUp
} from "lucide-react";
import { generateSubAgentLink, shareLink, copyToClipboard } from "@/utils/shareLinks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SubAgency {
  id: string;
  name: string;
  agency_code: string;
  level: string;
  total_hosts: number;
  commission_rate: number;
  created_at: string;
  logo_url: string | null;
  owner_id: string;
  owner_profile?: {
    display_name: string | null;
    avatar_url: string | null;
    app_uid: string | null;
  } | null;
  level_info?: {
    level_name: string;
    commission_rate: number;
  };
}

interface SubAgentsPanelProps {
  agencyId: string;
  agencyCode: string;
  isOpen: boolean;
  onClose: () => void;
}

const SubAgentsPanel = ({ agencyId, agencyCode, isOpen, onClose }: SubAgentsPanelProps) => {
  const { toast } = useToast();
  const [subAgencies, setSubAgencies] = useState<SubAgency[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // Generate the sub-agent referral link using production domain
  const referralLink = generateSubAgentLink(agencyCode);

  useEffect(() => {
    if (isOpen) {
      fetchSubAgencies();
    }
  }, [isOpen, agencyId]);

  const fetchSubAgencies = async () => {
    try {
      setIsLoading(true);
      
      // Fetch sub-agencies (agencies where parent_agency_id = this agency's id)
      const { data: subAgenciesData, error } = await supabase
        .from("agencies")
        .select("*")
        .eq("parent_agency_id", agencyId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (subAgenciesData && subAgenciesData.length > 0) {
        // Fetch owner profiles
        const ownerIds = subAgenciesData.map(a => a.owner_id).filter(Boolean) as string[];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, app_uid")
          .in("id", ownerIds);

        // Fetch level tier info for each agency
        const levelCodes = [...new Set(subAgenciesData.map(a => a.level))];
        const { data: levelTiers } = await supabase
          .from("agency_level_tiers")
          .select("level_code, level_name, commission_rate")
          .in("level_code", levelCodes);

        // Combine data
        const enrichedAgencies: SubAgency[] = subAgenciesData.map(agency => {
          const ownerProfile = profiles?.find(p => p.id === agency.owner_id);
          const levelInfo = levelTiers?.find(t => t.level_code === agency.level);
          
          return {
            id: agency.id,
            name: agency.name,
            agency_code: agency.agency_code,
            level: agency.level || "A1",
            total_hosts: agency.total_hosts || 0,
            commission_rate: agency.commission_rate || 0,
            created_at: agency.created_at || "",
            logo_url: agency.logo_url,
            owner_id: agency.owner_id || "",
            owner_profile: ownerProfile ? {
              display_name: ownerProfile.display_name,
              avatar_url: ownerProfile.avatar_url,
              app_uid: ownerProfile.app_uid
            } : null,
            level_info: levelInfo ? {
              level_name: levelInfo.level_name,
              commission_rate: levelInfo.commission_rate
            } : undefined
          };
        });

        setSubAgencies(enrichedAgencies);
      } else {
        setSubAgencies([]);
      }
    } catch (error) {
      console.error("[SubAgentsPanel] Error:", error);
      toast({
        title: "Error",
        description: "Failed to load sub-agents",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyReferralLink = async () => {
    const success = await copyToClipboard(referralLink);
    if (success) {
      setCopiedLink(true);
      toast({
        title: "Link Copied!",
        description: "Sub-agent referral link copied to clipboard",
      });
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      toast({
        title: "Failed to copy",
        description: "Please try again",
        variant: "destructive"
      });
    }
  };

  const shareReferralLink = async () => {
    const success = await shareLink(referralLink, {
      title: 'Become a Sub-Agent',
      text: 'Join as a sub-agent and start earning commissions!'
    });
    
    if (success) {
      toast({
        title: "Link Shared!",
        description: "Referral link shared successfully",
      });
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "A5": return "from-purple-500 to-pink-500";
      case "A4": return "from-yellow-400 to-amber-500";
      case "A3": return "from-gray-300 to-gray-400";
      case "A2": return "from-orange-400 to-red-400";
      case "A1": 
      default: return "from-slate-400 to-slate-500";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="bg-background w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Sub-Agents</h2>
              <p className="text-xs text-muted-foreground">{subAgencies.length} sub-agents under your agency</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Share Link Section */}
        <div className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-b border-border">
          <p className="text-sm font-medium mb-2 flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Recruit New Sub-Agents
          </p>
          <div className="flex gap-2">
            <div className="flex-1 bg-background rounded-lg px-3 py-2 text-xs font-mono truncate border border-border">
              {referralLink}
            </div>
            <Button 
              size="sm" 
              variant="outline"
              onClick={copyReferralLink}
              className="shrink-0"
            >
              {copiedLink ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
            <Button 
              size="sm"
              onClick={shareReferralLink}
              className="shrink-0 bg-gradient-to-r from-purple-500 to-pink-500 text-white"
            >
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Sub-Agents List */}
        <ScrollArea className="flex-1 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : subAgencies.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-1">No Sub-Agents Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Share your referral link to recruit sub-agents
              </p>
              <Button onClick={shareReferralLink} className="bg-gradient-to-r from-purple-500 to-pink-500">
                <Share2 className="w-4 h-4 mr-2" />
                Share Referral Link
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {subAgencies.map((subAgency) => (
                <Card key={subAgency.id} className="overflow-hidden">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      {/* Agency Logo/Avatar */}
                      {subAgency.logo_url ? (
                        <img 
                          src={subAgency.logo_url}
                          alt={subAgency.name}
                          className="w-12 h-12 rounded-xl object-cover border"
                        />
                      ) : (
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getLevelColor(subAgency.level)} flex items-center justify-center`}>
                          <Building2 className="w-6 h-6 text-white" />
                        </div>
                      )}

                      {/* Agency Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="font-semibold truncate">{subAgency.name}</h4>
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
                            {subAgency.level}
                          </Badge>
                        </div>
                        
                        <p className="text-xs text-muted-foreground mb-1">
                          {subAgency.level_info?.level_name || subAgency.level} • {subAgency.level_info?.commission_rate || subAgency.commission_rate}% Commission
                        </p>

                        {/* Stats Row */}
                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3 text-muted-foreground" />
                            <span>{subAgency.total_hosts} Hosts</span>
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <span>{subAgency.agency_code}</span>
                          </div>
                        </div>

                        {/* Owner Info */}
                        {subAgency.owner_profile && (
                          <div className="flex items-center gap-2 mt-2 p-2 bg-muted/50 rounded-lg">
                            <Avatar className="w-6 h-6">
                              <AvatarImage src={subAgency.owner_profile.avatar_url || ""} />
                              <AvatarFallback className="text-[10px]">
                                {subAgency.owner_profile.display_name?.charAt(0) || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">
                                {subAgency.owner_profile.display_name || "Agency Owner"}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                Owner • UID: {subAgency.owner_profile.app_uid || "N/A"}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Commission Badge */}
                      <div className="text-right shrink-0">
                        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gradient-to-r ${getLevelColor(subAgency.level)} text-white text-xs font-bold`}>
                          <TrendingUp className="w-3 h-3" />
                          {subAgency.level_info?.commission_rate || subAgency.commission_rate}%
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
};

export default SubAgentsPanel;
