import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Settings,
  Database,
  Zap,
  DollarSign,
  Building2,
  Gift,
  Phone,
  Crown,
  Star
} from "lucide-react";

interface SettingStatus {
  key: string;
  name: string;
  icon: React.ReactNode;
  status: 'configured' | 'missing' | 'warning';
  value?: any;
  description: string;
}

export function SystemHealthCheck() {
  const [settings, setSettings] = useState<SettingStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkSettings = async () => {
    setLoading(true);
    try {
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('setting_key, setting_value');

      const { count: agencyTiersCount } = await supabase
        .from('agency_level_tiers')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      const { count: helperLevelsCount } = await supabase
        .from('helper_level_config')
        .select('*', { count: 'exact', head: true })
        .eq('is_enabled', true);

      const { count: vipTiersCount } = await supabase
        .from('vip_tiers')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      const { count: userLevelsCount } = await supabase
        .from('user_level_tiers')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      const { count: giftsCount } = await supabase
        .from('gifts')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      const settingsMap: Record<string, any> = {};
      (appSettings || []).forEach((s: any) => {
        settingsMap[s.setting_key] = s.setting_value;
      });

      const hostPercent = settingsMap.host_percent || settingsMap.gift_commission?.host_percent;
      
      const statusList: SettingStatus[] = [
        {
          key: 'host_percent',
          name: 'Host Commission %',
          icon: <Gift className="w-4 h-4" />,
          status: hostPercent ? 'configured' : 'missing',
          value: hostPercent ? `${hostPercent}%` : undefined,
          description: 'Host commission percentage from gifts'
        },
        {
          key: 'call_rates',
          name: 'Call Rate Settings',
          icon: <Phone className="w-4 h-4" />,
          status: settingsMap.call_rates ? 'configured' : 'missing',
          value: settingsMap.call_rates,
          description: 'Per-minute call rate and level-based rates'
        },
        {
          key: 'gift_commission',
          name: 'Gift Commission Settings',
          icon: <DollarSign className="w-4 h-4" />,
          status: settingsMap.gift_commission ? 'configured' : 'warning',
          value: settingsMap.gift_commission,
          description: 'Gift commission settings (optional)'
        },
        {
          key: 'beans_to_usd_rate',
          name: 'Beans to USD Rate',
          icon: <DollarSign className="w-4 h-4" />,
          status: settingsMap.beans_to_usd_rate ? 'configured' : 'warning',
          value: settingsMap.beans_to_usd_rate,
          description: 'Beans to USD exchange rate (default: 9000)'
        },
        {
          key: 'platform_fee_percent',
          name: 'Platform Fee %',
          icon: <Settings className="w-4 h-4" />,
          status: settingsMap.platform_fee_percent ? 'configured' : 'warning',
          value: settingsMap.platform_fee_percent,
          description: 'Withdrawal platform fee percentage'
        },
        {
          key: 'agency_level_tiers',
          name: 'Agency Level Tiers',
          icon: <Building2 className="w-4 h-4" />,
          status: (agencyTiersCount || 0) > 0 ? 'configured' : 'missing',
          value: `${agencyTiersCount || 0} tiers`,
          description: 'Agency levels and commission rates'
        },
        {
          key: 'helper_levels',
          name: 'Helper Level Config',
          icon: <Crown className="w-4 h-4" />,
          status: (helperLevelsCount || 0) > 0 ? 'configured' : 'missing',
          value: `${helperLevelsCount || 0} levels`,
          description: 'Helper/Trader level configuration'
        },
        {
          key: 'vip_tiers',
          name: 'VIP Tiers',
          icon: <Star className="w-4 h-4" />,
          status: (vipTiersCount || 0) > 0 ? 'configured' : 'warning',
          value: `${vipTiersCount || 0} tiers`,
          description: 'VIP subscription tiers'
        },
        {
          key: 'user_levels',
          name: 'User Level Tiers',
          icon: <Crown className="w-4 h-4" />,
          status: (userLevelsCount || 0) > 0 ? 'configured' : 'warning',
          value: `${userLevelsCount || 0} levels`,
          description: 'User and Host level system'
        },
        {
          key: 'gifts',
          name: 'Active Gifts',
          icon: <Gift className="w-4 h-4" />,
          status: (giftsCount || 0) > 0 ? 'configured' : 'missing',
          value: `${giftsCount || 0} gifts`,
          description: 'Active gift items'
        },
      ];

      setSettings(statusList);
      setLastChecked(new Date());
    } catch (error) {
      console.error('Error checking settings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSettings();
  }, []);

  const configuredCount = settings.filter(s => s.status === 'configured').length;
  const missingCount = settings.filter(s => s.status === 'missing').length;
  const warningCount = settings.filter(s => s.status === 'warning').length;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'configured':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'missing':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default:
        return null;
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Database className="w-5 h-5 text-blue-400" />
          System Health Check
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={checkSettings}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4 mb-4">
          <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {configuredCount} Configured
          </Badge>
          {missingCount > 0 && (
            <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
              <XCircle className="w-3 h-3 mr-1" />
              {missingCount} Missing
            </Badge>
          )}
          {warningCount > 0 && (
            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {warningCount} Warning
            </Badge>
          )}
        </div>

        <div className="space-y-2">
          {settings.map((setting) => (
            <div
              key={setting.key}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                setting.status === 'configured'
                  ? 'bg-green-500/5 border-green-500/20'
                  : setting.status === 'missing'
                  ? 'bg-red-500/5 border-red-500/20'
                  : 'bg-yellow-500/5 border-yellow-500/20'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-800">
                  {setting.icon}
                </div>
                <div>
                  <p className="font-medium text-sm">{setting.name}</p>
                  <p className="text-xs text-muted-foreground">{setting.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {setting.value && (
                  <Badge variant="secondary" className="text-xs">
                    {typeof setting.value === 'object' 
                      ? JSON.stringify(setting.value).slice(0, 30) + '...'
                      : String(setting.value)
                    }
                  </Badge>
                )}
                {getStatusIcon(setting.status)}
              </div>
            </div>
          ))}
        </div>

        {lastChecked && (
          <p className="text-xs text-muted-foreground text-center mt-4">
            Last checked: {lastChecked.toLocaleTimeString()}
          </p>
        )}

        {missingCount > 0 && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-400">
                  {missingCount} required settings are not configured!
                </p>
                <p className="text-xs text-red-300/80 mt-1">
                  Related features will not work until these settings are configured.
                  Please configure them from the App Settings Hub.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SystemHealthCheck;
