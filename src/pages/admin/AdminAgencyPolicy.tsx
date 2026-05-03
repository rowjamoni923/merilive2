import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  Save, 
  FileText,
  DollarSign,
  TrendingUp,
  Users,
  AlertTriangle,
  Shield,
  Phone,
  Wallet,
  Plus,
  Trash2,
  Edit2,
  RefreshCw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { saveAppSetting } from "@/utils/adminSettingsStorage";
import { recordAdminError } from "@/utils/adminErrorLog";

const POLICY_SECTION_META: Record<string, { title: string; display_order: number }> = {
  exchange_rate: { title: 'Exchange Rate', display_order: 1 },
  host_requirements: { title: 'Host Requirements', display_order: 2 },
  violations: { title: 'Violations', display_order: 3 },
  prohibited_content: { title: 'Prohibited Content', display_order: 4 },
  call_rules: { title: 'Call Rules', display_order: 5 },
  withdrawal: { title: 'Withdrawal', display_order: 6 },
};

interface PolicySection {
  id: string;
  section_key: string;
  section_title: string;
  content: any;
  display_order: number;
  is_active: boolean;
}

// CommissionTier interface matches agency_level_tiers table structure
interface CommissionTier {
  id: string;
  level_code: string;
  level_name: string;
  min_weekly_income: number;
  max_weekly_income: number;
  commission_rate: number;
  badge_color: string | null;
  display_order: number;
  is_active: boolean;
}

interface Violation {
  title: string;
  severity: string;
  penalties: string[];
}

interface HostRequirement {
  key: string;
  title: string;
  description: string;
}

interface ProhibitedItem {
  title: string;
  description: string;
}

interface PaymentMethod {
  name: string;
  type: string;
}

interface Timezone {
  country: string;
  flag: string;
  time: string;
}

const AdminAgencyPolicy = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [policies, setPolicies] = useState<PolicySection[]>([]);

  // Exchange Rate (Beans to USD)
  const [exchangeRate, setExchangeRate] = useState(9000);
  const [exchangeCurrency, setExchangeCurrency] = useState("Beans");

  // Commission Tiers
  const [commissionTiers, setCommissionTiers] = useState<CommissionTier[]>([]);

  // Host Requirements
  const [hostRequirements, setHostRequirements] = useState<HostRequirement[]>([]);

  // Violations
  const [violations, setViolations] = useState<Violation[]>([]);

  // Prohibited Content
  const [prohibitedContent, setProhibitedContent] = useState<ProhibitedItem[]>([]);

  // Call Rules
  const [callRules, setCallRules] = useState<string[]>([]);

  // Withdrawal
  const [withdrawalMinUsd, setWithdrawalMinUsd] = useState(10);
  const [settlementDay, setSettlementDay] = useState("Monday");
  const [settlementTimeIst, setSettlementTimeIst] = useState("09:30");
  const [settlementTimeBd, setSettlementTimeBd] = useState("10:00");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [timezones, setTimezones] = useState<Timezone[]>([]);

  // Fetch commission tiers from agency_level_tiers (SINGLE SOURCE OF TRUTH)
  const fetchCommissionTiers = async () => {
    try {
      const { data, error } = await supabase
        .from('agency_level_tiers')
        .select('*')
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      if (data) {
        setCommissionTiers(data);
      }
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminAgencyPolicy.ErrorFetchingCommissionTiers", message: error instanceof Error ? error.message : "Error fetching commission tiers" });
    }
  };

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      
      // Fetch commission tiers from centralized table
      await fetchCommissionTiers();
      
      const { data, error } = await supabase
        .from('agency_policy_settings')
        .select('*')
        .order('display_order');

      if (error) throw error;

      if (data) {
        setPolicies(data);

        const sectionMap = new Map(data.map((section: PolicySection) => [section.section_key, section.content]));

        const exchangeRateContent = sectionMap.get('exchange_rate');
        if (exchangeRateContent) {
          setExchangeRate(exchangeRateContent.rate || 125);
          setExchangeCurrency(exchangeRateContent.currency || 'BDT');
        }

        const hostRequirementsContent = sectionMap.get('host_requirements') ?? sectionMap.get('host_management');
        if (hostRequirementsContent) {
          setHostRequirements(hostRequirementsContent.requirements || []);
        }

        const violationsContent = sectionMap.get('violations') ?? sectionMap.get('penalties');
        if (violationsContent) {
          setViolations(violationsContent.violations || []);
        }

        const prohibitedContentSection = sectionMap.get('prohibited_content');
        if (prohibitedContentSection) {
          setProhibitedContent(prohibitedContentSection.items || []);
        }

        const callRulesContent = sectionMap.get('call_rules') ?? sectionMap.get('rules');
        if (callRulesContent) {
          setCallRules(callRulesContent.rules || []);
        }

        const withdrawalContent = sectionMap.get('withdrawal');
        if (withdrawalContent) {
          setWithdrawalMinUsd(withdrawalContent.minimum_usd || 10);
          setSettlementDay(withdrawalContent.settlement_day || 'Monday');
          setSettlementTimeIst(withdrawalContent.settlement_time_ist || '09:30');
          setSettlementTimeBd(withdrawalContent.settlement_time_bd || '10:00');
          setPaymentMethods(withdrawalContent.payment_methods || []);
          setTimezones(withdrawalContent.timezones || []);
        }
      }
    } catch (error: any) {
      recordAdminError({ kind: "rpc", label: "AdminAgencyPolicy.ErrorFetchingPolicies", message: error instanceof Error ? error.message : "Error fetching policies" });
      toast.error('Failed to load policy settings');
    } finally {
      setLoading(false);
    }
  };

  useAdminRealtime(['agency_policy_settings', 'agency_level_tiers'], () => {
    fetchPolicies();
    fetchCommissionTiers();
  });

  const savePolicySection = async (sectionKey: string, content: any) => {
    try {
      const meta = POLICY_SECTION_META[sectionKey] ?? {
        title: sectionKey.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
        display_order: 999,
      };

      const timestamp = new Date().toISOString();
      const payload = {
        section_key: sectionKey,
        section_title: meta.title,
        content,
        display_order: meta.display_order,
        is_active: true,
        updated_at: timestamp,
      };

      const { data: existing, error: lookupError } = await supabase
        .from('agency_policy_settings')
        .select('id')
        .eq('section_key', sectionKey)
        .maybeSingle();

      if (lookupError) throw lookupError;

      if (existing?.id) {
        const { error } = await supabase
          .from('agency_policy_settings')
          .update(payload)
          .eq('id', existing.id);

        if (error) throw error;
        return true;
      }

      const { error } = await supabase
        .from('agency_policy_settings')
        .insert({
          ...payload,
          created_at: timestamp,
        });

      if (error) throw error;
      return true;
    } catch (error: any) {
      console.error(`Error saving ${sectionKey}:`, error);
      throw error;
    }
  };

  const handleSaveAll = async () => {
    try {
      setSaving(true);

      // Save Exchange Rate to BOTH tables for sync
      await savePolicySection('exchange_rate', {
        rate: exchangeRate,
        currency: exchangeCurrency,
        display: `${exchangeRate.toLocaleString()} ${exchangeCurrency} = $1 USD`
      });

      // Also update app_settings.beans_to_usd_rate for global access
      await saveAppSetting(
        'beans_to_usd_rate',
        { rate: exchangeRate },
        'Beans to USD exchange rate for agencies'
      );

      // Save Commission Tiers to agency_level_tiers table (SINGLE SOURCE OF TRUTH)
      for (const tier of commissionTiers) {
        const { error } = await supabase
          .from('agency_level_tiers')
          .update({
            level_code: tier.level_code,
            level_name: tier.level_name,
            min_weekly_income: tier.min_weekly_income,
            max_weekly_income: tier.max_weekly_income,
            commission_rate: tier.commission_rate,
            updated_at: new Date().toISOString()
          })
          .eq('id', tier.id);
        
        if (error) throw error;
      }

      // Save Host Requirements
      await savePolicySection('host_requirements', { requirements: hostRequirements });

      // Save Violations
      await savePolicySection('violations', { violations });

      // Save Prohibited Content
      await savePolicySection('prohibited_content', { items: prohibitedContent });

      // Save Call Rules
      await savePolicySection('call_rules', { rules: callRules });

      // Save Withdrawal
      await savePolicySection('withdrawal', {
        minimum_usd: withdrawalMinUsd,
        settlement_day: settlementDay,
        settlement_time_ist: settlementTimeIst,
        settlement_time_bd: settlementTimeBd,
        payment_methods: paymentMethods,
        timezones
      });

      toast.success('All policy settings saved successfully!');
    } catch (error: any) {
      toast.error('Failed to save some settings');
    } finally {
      setSaving(false);
    }
  };

  // Commission Tier Handlers
  const updateCommissionTier = (index: number, field: keyof CommissionTier, value: any) => {
    const updated = [...commissionTiers];
    updated[index] = { ...updated[index], [field]: value };
    setCommissionTiers(updated);
  };

  // Host Requirement Handlers
  const updateHostRequirement = (index: number, field: keyof HostRequirement, value: string) => {
    const updated = [...hostRequirements];
    updated[index] = { ...updated[index], [field]: value };
    setHostRequirements(updated);
  };

  const addHostRequirement = () => {
    setHostRequirements([...hostRequirements, { key: `req_${Date.now()}`, title: '', description: '' }]);
  };

  const removeHostRequirement = (index: number) => {
    setHostRequirements(hostRequirements.filter((_, i) => i !== index));
  };

  // Violation Handlers
  const updateViolation = (index: number, field: string, value: any) => {
    const updated = [...violations];
    updated[index] = { ...updated[index], [field]: value };
    setViolations(updated);
  };

  const updateViolationPenalty = (vIndex: number, pIndex: number, value: string) => {
    const updated = [...violations];
    updated[vIndex].penalties[pIndex] = value;
    setViolations(updated);
  };

  const addViolationPenalty = (vIndex: number) => {
    const updated = [...violations];
    updated[vIndex].penalties.push('');
    setViolations(updated);
  };

  const removeViolationPenalty = (vIndex: number, pIndex: number) => {
    const updated = [...violations];
    updated[vIndex].penalties = updated[vIndex].penalties.filter((_, i) => i !== pIndex);
    setViolations(updated);
  };

  const addViolation = () => {
    setViolations([...violations, { title: '', severity: 'medium', penalties: [''] }]);
  };

  const removeViolation = (index: number) => {
    setViolations(violations.filter((_, i) => i !== index));
  };

  // Prohibited Content Handlers
  const updateProhibitedItem = (index: number, field: keyof ProhibitedItem, value: string) => {
    const updated = [...prohibitedContent];
    updated[index] = { ...updated[index], [field]: value };
    setProhibitedContent(updated);
  };

  const addProhibitedItem = () => {
    setProhibitedContent([...prohibitedContent, { title: '', description: '' }]);
  };

  const removeProhibitedItem = (index: number) => {
    setProhibitedContent(prohibitedContent.filter((_, i) => i !== index));
  };

  // Call Rules Handlers
  const updateCallRule = (index: number, value: string) => {
    const updated = [...callRules];
    updated[index] = value;
    setCallRules(updated);
  };

  const addCallRule = () => {
    setCallRules([...callRules, '']);
  };

  const removeCallRule = (index: number) => {
    setCallRules(callRules.filter((_, i) => i !== index));
  };

  // Payment Method Handlers
  const updatePaymentMethod = (index: number, field: keyof PaymentMethod, value: string) => {
    const updated = [...paymentMethods];
    updated[index] = { ...updated[index], [field]: value };
    setPaymentMethods(updated);
  };

  const addPaymentMethod = () => {
    setPaymentMethods([...paymentMethods, { name: '', type: 'Mobile Banking' }]);
  };

  const removePaymentMethod = (index: number) => {
    setPaymentMethods(paymentMethods.filter((_, i) => i !== index));
  };

  // Timezone Handlers
  const updateTimezone = (index: number, field: keyof Timezone, value: string) => {
    const updated = [...timezones];
    updated[index] = { ...updated[index], [field]: value };
    setTimezones(updated);
  };

  const addTimezone = () => {
    setTimezones([...timezones, { country: '', flag: '🏳️', time: '' }]);
  };

  const removeTimezone = (index: number) => {
    setTimezones(timezones.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader
        title="Agency Policy"
        icon={FileText}
        onRefresh={fetchPolicies}
      />

      <div className="p-4 pb-24 space-y-4">
        <Tabs defaultValue="exchange" className="w-full">
          <TabsList className="w-full grid grid-cols-4 lg:grid-cols-7 gap-1 h-auto p-1">
            <TabsTrigger value="exchange" className="text-xs py-2">
              <DollarSign className="w-3 h-3 mr-1" />
              Exchange
            </TabsTrigger>
            <TabsTrigger value="commission" className="text-xs py-2">
              <TrendingUp className="w-3 h-3 mr-1" />
              Commission
            </TabsTrigger>
            <TabsTrigger value="host" className="text-xs py-2">
              <Users className="w-3 h-3 mr-1" />
              Host
            </TabsTrigger>
            <TabsTrigger value="violations" className="text-xs py-2">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Violations
            </TabsTrigger>
            <TabsTrigger value="prohibited" className="text-xs py-2">
              <Shield className="w-3 h-3 mr-1" />
              Prohibited
            </TabsTrigger>
            <TabsTrigger value="call" className="text-xs py-2">
              <Phone className="w-3 h-3 mr-1" />
              Call Rules
            </TabsTrigger>
            <TabsTrigger value="withdrawal" className="text-xs py-2">
              <Wallet className="w-3 h-3 mr-1" />
              Withdrawal
            </TabsTrigger>
          </TabsList>

          {/* Exchange Rate Tab */}
          <TabsContent value="exchange" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Beans to USD Exchange Rate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>How many Beans = $1 USD?</Label>
                  <Input
                    type="number"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(Number(e.target.value))}
                    placeholder="9000"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    This is the exchange rate for agency withdrawals
                  </p>
                </div>
                <div className="p-4 bg-emerald-500/10 dark:bg-emerald-500/15 rounded-lg border border-emerald-500/30">
                  <p className="text-sm text-emerald-900/70 dark:text-emerald-200/80 mb-1">Preview:</p>
                  <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                    {exchangeRate.toLocaleString()} Beans = $1 USD
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Commission Tab */}
          <TabsContent value="commission" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Commission Tiers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Commission tiers are synced from Agency Management. Changes here will apply globally.
                </p>
                {commissionTiers.map((tier, index) => (
                  <div key={tier.id} className="p-4 border rounded-lg space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div>
                        <Label>Level Code</Label>
                        <Input
                          value={tier.level_code}
                          onChange={(e) => updateCommissionTier(index, 'level_code', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Name</Label>
                        <Input
                          value={tier.level_name}
                          onChange={(e) => updateCommissionTier(index, 'level_name', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Min Income ($)</Label>
                        <Input
                          type="number"
                          value={tier.min_weekly_income}
                          onChange={(e) => updateCommissionTier(index, 'min_weekly_income', Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <Label>Max Income ($)</Label>
                        <Input
                          type="number"
                          value={tier.max_weekly_income || ''}
                          onChange={(e) => updateCommissionTier(index, 'max_weekly_income', e.target.value ? Number(e.target.value) : 9999999)}
                          placeholder="No limit"
                        />
                      </div>
                      <div>
                        <Label>Rate (%)</Label>
                        <Input
                          type="number"
                          value={tier.commission_rate}
                          onChange={(e) => updateCommissionTier(index, 'commission_rate', Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Host Requirements Tab */}
          <TabsContent value="host" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Host Requirements</CardTitle>
                <Button size="sm" onClick={addHostRequirement}>
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {hostRequirements.map((req, index) => (
                  <div key={index} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Requirement #{index + 1}</p>
                      <Button size="sm" variant="destructive" onClick={() => removeHostRequirement(index)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label>Title</Label>
                        <Input
                          value={req.title}
                          onChange={(e) => updateHostRequirement(index, 'title', e.target.value)}
                          placeholder="Age"
                        />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Input
                          value={req.description}
                          onChange={(e) => updateHostRequirement(index, 'description', e.target.value)}
                          placeholder="18-35 years old"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Violations Tab */}
          <TabsContent value="violations" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Violation Penalties</CardTitle>
                <Button size="sm" onClick={addViolation}>
                  <Plus className="w-4 h-4 mr-1" /> Add Violation
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {violations.map((violation, vIndex) => (
                  <div key={vIndex} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Violation #{vIndex + 1}</p>
                      <Button size="sm" variant="destructive" onClick={() => removeViolation(vIndex)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label>Title</Label>
                        <Input
                          value={violation.title}
                          onChange={(e) => updateViolation(vIndex, 'title', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Severity</Label>
                        <Select
                          value={violation.severity}
                          onValueChange={(value) => updateViolation(vIndex, 'severity', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Penalties</Label>
                        <Button size="sm" variant="outline" onClick={() => addViolationPenalty(vIndex)}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      {violation.penalties.map((penalty, pIndex) => (
                        <div key={pIndex} className="flex gap-2">
                          <Input
                            value={penalty}
                            onChange={(e) => updateViolationPenalty(vIndex, pIndex, e.target.value)}
                            placeholder="Penalty description"
                          />
                          <Button size="icon" variant="ghost" onClick={() => removeViolationPenalty(vIndex, pIndex)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Prohibited Content Tab */}
          <TabsContent value="prohibited" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Prohibited Content</CardTitle>
                <Button size="sm" onClick={addProhibitedItem}>
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {prohibitedContent.map((item, index) => (
                  <div key={index} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Item #{index + 1}</p>
                      <Button size="sm" variant="destructive" onClick={() => removeProhibitedItem(index)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label>Title</Label>
                        <Input
                          value={item.title}
                          onChange={(e) => updateProhibitedItem(index, 'title', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateProhibitedItem(index, 'description', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Call Rules Tab */}
          <TabsContent value="call" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Call Rules</CardTitle>
                <Button size="sm" onClick={addCallRule}>
                  <Plus className="w-4 h-4 mr-1" /> Add Rule
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {callRules.map((rule, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={rule}
                      onChange={(e) => updateCallRule(index, e.target.value)}
                      placeholder="Call rule"
                    />
                    <Button size="icon" variant="ghost" onClick={() => removeCallRule(index)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Withdrawal Tab */}
          <TabsContent value="withdrawal" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Withdrawal Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label>Minimum USD</Label>
                    <Input
                      type="number"
                      value={withdrawalMinUsd}
                      onChange={(e) => setWithdrawalMinUsd(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Settlement Day</Label>
                    <Select value={settlementDay} onValueChange={setSettlementDay}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Monday">Monday</SelectItem>
                        <SelectItem value="Tuesday">Tuesday</SelectItem>
                        <SelectItem value="Wednesday">Wednesday</SelectItem>
                        <SelectItem value="Thursday">Thursday</SelectItem>
                        <SelectItem value="Friday">Friday</SelectItem>
                        <SelectItem value="Saturday">Saturday</SelectItem>
                        <SelectItem value="Sunday">Sunday</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Time (IST)</Label>
                    <Input
                      value={settlementTimeIst}
                      onChange={(e) => setSettlementTimeIst(e.target.value)}
                      placeholder="09:30"
                    />
                  </div>
                  <div>
                    <Label>Time (BD)</Label>
                    <Input
                      value={settlementTimeBd}
                      onChange={(e) => setSettlementTimeBd(e.target.value)}
                      placeholder="10:00"
                    />
                  </div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm">
                    <strong>Preview:</strong> Minimum ${withdrawalMinUsd} = Tk {(withdrawalMinUsd * exchangeRate).toLocaleString()} | 
                    Settlement: {settlementDay} at {settlementTimeIst} IST ({settlementTimeBd} BD)
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Payment Methods */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Payment Methods</CardTitle>
                <Button size="sm" onClick={addPaymentMethod}>
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {paymentMethods.map((method, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={method.name}
                      onChange={(e) => updatePaymentMethod(index, 'name', e.target.value)}
                      placeholder="Method name"
                    />
                    <Input
                      value={method.type}
                      onChange={(e) => updatePaymentMethod(index, 'type', e.target.value)}
                      placeholder="Type"
                    />
                    <Button size="icon" variant="ghost" onClick={() => removePaymentMethod(index)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Timezones */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Time Zone Reference</CardTitle>
                <Button size="sm" onClick={addTimezone}>
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {timezones.map((tz, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={tz.flag}
                      onChange={(e) => updateTimezone(index, 'flag', e.target.value)}
                      placeholder="🇧🇩"
                      className="w-16"
                    />
                    <Input
                      value={tz.country}
                      onChange={(e) => updateTimezone(index, 'country', e.target.value)}
                      placeholder="Country"
                    />
                    <Input
                      value={tz.time}
                      onChange={(e) => updateTimezone(index, 'time', e.target.value)}
                      placeholder="Monday 10:00 AM"
                    />
                    <Button size="icon" variant="ghost" onClick={() => removeTimezone(index)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Floating Save Button */}
      <div className="fixed bottom-4 left-0 right-0 px-4 z-50">
        <Button 
          className="w-full h-12 text-lg shadow-lg"
          onClick={handleSaveAll}
          disabled={saving}
        >
          {saving ? (
            <>
              <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-5 h-5 mr-2" />
              Save All Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default AdminAgencyPolicy;
