import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  ArrowLeft, 
  Building2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Wallet,
  Globe,
  Mail,
  MessageCircle,
  Users,
  TrendingUp,
  Shield,
  Clock,
  DollarSign,
  CreditCard,
  BadgeCheck,
  Crown,
  Gift,
  Zap,
  Link as LinkIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const CreateAgency = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    agencyCode: "",
    description: "",
    email: "",
    whatsapp: ""
  });
  const [codeAvailable, setCodeAvailable] = useState<boolean | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  
  // Parent agency (for sub-agency creation)
  const [parentAgencyCode, setParentAgencyCode] = useState<string | null>(null);
  const [parentAgency, setParentAgency] = useState<{id: string; name: string; level: string} | null>(null);

  // Check for parent agency code from URL or localStorage
  useEffect(() => {
    const parentCode = searchParams.get("parent") || localStorage.getItem("meri_pending_subagent");
    if (parentCode) {
      setParentAgencyCode(parentCode);
      fetchParentAgency(parentCode);
      // Clear localStorage
      localStorage.removeItem("meri_pending_subagent");
    }
  }, [searchParams]);

  const fetchParentAgency = async (code: string) => {
    const { data } = await supabase.rpc('get_agency_by_code', {
      agency_code: code.toUpperCase()
    });
    if (data && data.length > 0) {
      setParentAgency({
        id: data[0].id,
        name: data[0].name,
        level: data[0].level
      });
    }
  };

  const generateAgencyCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "AG";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, agencyCode: code }));
    checkCodeAvailability(code);
  };

  const checkCodeAvailability = async (code: string) => {
    if (code.length < 4) {
      setCodeAvailable(null);
      return;
    }

    setCheckingCode(true);
    const { data } = await supabase
      .from("agencies")
      .select("id")
      .eq("agency_code", code)
      .maybeSingle();

    setCodeAvailable(!data);
    setCheckingCode(false);
  };

  const handleCodeChange = (value: string) => {
    const upperValue = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setFormData(prev => ({ ...prev, agencyCode: upperValue }));
    if (upperValue.length >= 4) {
      checkCodeAvailability(upperValue);
    } else {
      setCodeAvailable(null);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Please enter agency name",
        variant: "destructive",
      });
      return;
    }

    if (!formData.agencyCode || formData.agencyCode.length < 4) {
      toast({
        title: "Error",
        description: "Agency code must be at least 4 characters",
        variant: "destructive",
      });
      return;
    }

    if (!codeAvailable) {
      toast({
        title: "Error",
        description: "This agency code is already taken",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    // Check if user already owns an agency
    const { data: existingAgency } = await supabase
      .from("agencies")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (existingAgency) {
      toast({
        title: "Error",
        description: "You already own an agency",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    // Check if user is a verified Level 5 Payroll Helper → auto-assign A5/12%
    let initialLevel = "A1";
    let initialCommissionRate = 3;
    const { data: helperCheck } = await supabase
      .from("topup_helpers")
      .select("trader_level, payroll_enabled, is_verified, is_active")
      .eq("user_id", user.id)
      .maybeSingle();
    
    if (helperCheck?.is_verified && helperCheck?.is_active && helperCheck?.trader_level === 5 && helperCheck?.payroll_enabled) {
      initialLevel = "A5";
      initialCommissionRate = 12;
    }

    // Create agency using secure RPC (bypasses trigger protection)
    const { data: rpcResult, error } = await supabase.rpc('create_agency_for_user', {
      _owner_id: user.id,
      _name: formData.name.trim(),
      _agency_code: formData.agencyCode,
      _level: initialLevel,
      _commission_rate: initialCommissionRate,
      _email: formData.email.trim() || null,
      _whatsapp: formData.whatsapp.trim() || null,
    });

    if (error) {
      toast({
        title: "Error",
        description: error.message || "Failed to create agency",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    const result = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
    if (!result?.success) {
      toast({
        title: "Error",
        description: result?.error || "Failed to create agency",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    // If this is a sub-agency, update parent_agency_id and increment parent's total_agents
    if (parentAgency?.id) {
      await supabase.from("agencies")
        .update({ parent_agency_id: parentAgency.id })
        .eq("id", result.agency_id);
      // Increment parent's total_agents atomically
      const { data: parentData } = await supabase
        .from("agencies")
        .select("total_agents")
        .eq("id", parentAgency.id)
        .maybeSingle();
      await supabase.from("agencies")
        .update({ total_agents: (parentData?.total_agents || 0) + 1 })
        .eq("id", parentAgency.id);
    }

    toast({
      title: "Success!",
      description: "Your agency has been created successfully",
    });

    navigate("/agency-dashboard");
  };

  // Payroll Member Benefits
  const payrollBenefits = [
    {
      icon: <Wallet className="w-5 h-5" />,
      title: "Process Withdrawals",
      description: "Handle user withdrawal requests and earn diamonds per transaction",
      color: "from-green-500 to-emerald-600"
    },
    {
      icon: <CreditCard className="w-5 h-5" />,
      title: "Handle Recharges",
      description: "Process top-up orders from users in your country",
      color: "from-blue-500 to-cyan-600"
    },
    {
      icon: <Globe className="w-5 h-5" />,
      title: "Country-Based Orders",
      description: "Receive orders only from your country for easy local payments",
      color: "from-purple-500 to-violet-600"
    },
    {
      icon: <DollarSign className="w-5 h-5" />,
      title: "Diamond Rewards",
      description: "Earn diamond rewards for every successful transaction processed",
      color: "from-amber-500 to-orange-600"
    },
    {
      icon: <Shield className="w-5 h-5" />,
      title: "Verified Badge",
      description: "Get a special Payroll Member verified badge on your profile",
      color: "from-pink-500 to-rose-600"
    },
    {
      icon: <Clock className="w-5 h-5" />,
      title: "Priority Support",
      description: "Access to dedicated support channel for payroll members",
      color: "from-indigo-500 to-blue-600"
    }
  ];

  // Payroll Levels with Requirements
  const payrollLevels = [
    { level: "Level 1", diamonds: "50,000", benefits: "Basic order access" },
    { level: "Level 2", diamonds: "100,000", benefits: "Higher order limits" },
    { level: "Level 3", diamonds: "200,000", benefits: "Priority orders" },
    { level: "Level 4", diamonds: "300,000", benefits: "VIP order access" },
    { level: "Level 5", diamonds: "500,000+", benefits: "Full payroll access + Direct payments" },
  ];

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-10 bg-gradient-to-r from-purple-600 to-indigo-600 text-slate-800 safe-area-top">
        <div className="flex items-center h-14 px-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-7">Create Agency</h1>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        {/* Hero Section */}
        <div className="mx-4 mt-4 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl p-6 text-slate-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Start Your Agency</h2>
            <p className="text-slate-700 text-sm">Build your team and earn together</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">4%</p>
            <p className="text-xs text-slate-600">Commission</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">∞</p>
            <p className="text-xs text-slate-600">Hosts</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">24/7</p>
            <p className="text-xs text-slate-600">Support</p>
          </div>
        </div>
      </div>

      {/* Parent Agency Info (for sub-agency) */}
      {parentAgency && (
        <div className="mx-4 mt-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-4 border border-purple-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <LinkIcon className="w-5 h-5 text-slate-800" />
            </div>
            <div>
              <h3 className="font-semibold text-purple-800">Creating as Sub-Agency</h3>
              <p className="text-xs text-purple-600">Under the following agency</p>
            </div>
          </div>
          <div className="bg-white/70 rounded-xl p-3 border border-purple-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800">{parentAgency.name}</p>
                <Badge className="bg-purple-100 text-purple-700 text-xs mt-1">
                  {parentAgency.level}
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Parent Agency Code</p>
                <p className="font-mono font-bold text-purple-600">{parentAgencyCode}</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-purple-600 mt-2">
            ✅ Your agency will be added as a sub-agency of the above agency
          </p>
        </div>
      )}

      {/* Form */}
      <div className="mx-4 mt-4 bg-white rounded-2xl p-5 shadow-sm border space-y-5">
        {/* Agency Name */}
        <div>
          <Label className="text-sm font-medium">Agency Name *</Label>
          <Input
            placeholder="Enter your agency name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="mt-1.5"
            maxLength={50}
          />
          <p className="text-xs text-gray-500 mt-1">{formData.name.length}/50 characters</p>
        </div>

        {/* Agency Code */}
        <div>
          <Label className="text-sm font-medium">Agency Code *</Label>
          <div className="flex gap-2 mt-1.5">
            <div className="relative flex-1">
              <Input
                placeholder="e.g., AGTEAM01"
                value={formData.agencyCode}
                onChange={(e) => handleCodeChange(e.target.value)}
                className={`pr-10 ${
                  codeAvailable === true ? "border-green-500" : 
                  codeAvailable === false ? "border-red-500" : ""
                }`}
                maxLength={10}
              />
              {checkingCode && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
              )}
              {!checkingCode && codeAvailable === true && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
              )}
              {!checkingCode && codeAvailable === false && (
                <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
              )}
            </div>
            <Button
              variant="outline"
              onClick={generateAgencyCode}
              className="shrink-0"
            >
              <Sparkles className="w-4 h-4 mr-1" />
              Generate
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Unique code for hosts to join your agency (4-10 characters)
          </p>
          {codeAvailable === false && (
            <p className="text-xs text-red-500 mt-1">This code is already taken</p>
          )}
          {codeAvailable === true && (
            <p className="text-xs text-green-500 mt-1">This code is available!</p>
          )}
        </div>

        {/* Email */}
        <div>
          <Label className="text-sm font-medium flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-500" />
            Gmail / Email <span className="text-gray-400 text-xs">(Optional)</span>
          </Label>
          <Input
            type="email"
            placeholder="example@gmail.com"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            className="mt-1.5"
          />
          {formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) && (
            <p className="text-xs text-red-500 mt-1">Enter a valid email address</p>
          )}
        </div>

        {/* WhatsApp Number */}
        <div>
          <Label className="text-sm font-medium flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-green-500" />
            WhatsApp Number <span className="text-gray-400 text-xs">(Optional)</span>
          </Label>
          <Input
            type="tel"
            placeholder="+880 1XXXXXXXXX"
            value={formData.whatsapp}
            onChange={(e) => setFormData(prev => ({ ...prev, whatsapp: e.target.value }))}
            className="mt-1.5"
          />
          {formData.whatsapp && !/^[0-9+\-\s]{10,15}$/.test(formData.whatsapp.replace(/\s/g, '')) && (
            <p className="text-xs text-red-500 mt-1">Enter a valid WhatsApp number (10-15 digits)</p>
          )}
        </div>

        {/* Description */}
        <div>
          <Label className="text-sm font-medium">Description (Optional)</Label>
          <Textarea
            placeholder="Tell hosts about your agency..."
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            className="mt-1.5 resize-none"
            rows={3}
            maxLength={200}
          />
          <p className="text-xs text-gray-500 mt-1">{formData.description.length}/200 characters</p>
        </div>
      </div>

      {/* Agency Benefits */}
      <div className="mx-4 mt-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-200">
        <h3 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
          <Crown className="w-5 h-5 text-amber-600" />
          Agency Owner Benefits
        </h3>
        <ul className="space-y-2">
          <li className="flex items-start gap-2 text-sm text-amber-700">
            <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span>Earn 4-20% commission from all host earnings (level based)</span>
          </li>
          <li className="flex items-start gap-2 text-sm text-amber-700">
            <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span>Manage unlimited hosts under your agency</span>
          </li>
          <li className="flex items-start gap-2 text-sm text-amber-700">
            <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span>Access to agency dashboard and analytics</span>
          </li>
          <li className="flex items-start gap-2 text-sm text-amber-700">
            <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span>Participate in agency rankings and rewards</span>
          </li>
          <li className="flex items-start gap-2 text-sm text-amber-700">
            <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span>Weekly automatic commission transfers</span>
          </li>
        </ul>
      </div>

      {/* Payroll System Benefits - New Section */}
      <div className="mx-4 mt-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-4 border border-emerald-200">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
            <Wallet className="w-5 h-5 text-slate-800" />
          </div>
          <div>
            <h3 className="font-bold text-emerald-800">💰 Payroll Member System</h3>
            <p className="text-xs text-emerald-600">Become a Payroll Member & Earn More!</p>
          </div>
        </div>

        {/* Payroll Benefits Grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {payrollBenefits.map((benefit, index) => (
            <div 
              key={index}
              className="bg-white rounded-xl p-3 border border-emerald-100 shadow-sm"
            >
              <div className={`w-8 h-8 bg-gradient-to-br ${benefit.color} rounded-lg flex items-center justify-center text-slate-800 mb-2`}>
                {benefit.icon}
              </div>
              <h4 className="font-semibold text-gray-800 text-xs">{benefit.title}</h4>
              <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{benefit.description}</p>
            </div>
          ))}
        </div>

        {/* Payroll Levels Table */}
        <div className="bg-white rounded-xl border border-emerald-200 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-slate-800 px-3 py-2">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Payroll Levels & Requirements
            </h4>
          </div>
          <div className="divide-y divide-gray-100">
            {payrollLevels.map((item, index) => (
              <div key={index} className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    index === 4 ? "bg-gradient-to-br from-amber-400 to-orange-500 text-slate-800" :
                    index === 3 ? "bg-gradient-to-br from-purple-400 to-pink-500 text-slate-800" :
                    index === 2 ? "bg-gradient-to-br from-blue-400 to-cyan-500 text-slate-800" :
                    index === 1 ? "bg-gradient-to-br from-emerald-400 to-green-500 text-slate-800" :
                    "bg-gray-200 text-gray-600"
                  }`}>
                    {index + 1}
                  </div>
                  <span className="font-medium text-sm text-gray-800">{item.level}</span>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-emerald-600">💎 {item.diamonds}</p>
                  <p className="text-[10px] text-gray-500">{item.benefits}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How to Become Payroll */}
        <div className="mt-3 bg-emerald-100/50 rounded-xl p-3">
          <h4 className="font-semibold text-emerald-800 text-sm mb-2 flex items-center gap-1">
            <Zap className="w-4 h-4" />
            How to Become a Payroll Member?
          </h4>
          <ol className="space-y-1.5 text-xs text-emerald-700">
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-emerald-500 text-slate-800 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
              <span>Create your agency and start managing hosts</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-emerald-500 text-slate-800 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
              <span>Reach minimum 50,000 diamonds in your wallet</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-emerald-500 text-slate-800 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
              <span>Apply for Payroll from Agency Dashboard</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-emerald-500 text-slate-800 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">4</span>
              <span>Get approved and start receiving orders!</span>
            </li>
          </ol>
        </div>

        {/* Earnings Info */}
        <div className="mt-3 flex items-center gap-2 bg-gradient-to-r from-amber-100 to-yellow-100 rounded-xl p-3 border border-amber-200">
          <Gift className="w-8 h-8 text-amber-600 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800 text-sm">💎 Earn Diamonds Per Transaction!</p>
            <p className="text-[10px] text-amber-700">
              Level 5 Payroll Members can earn 50-500 diamonds per withdrawal/recharge processed
            </p>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="mx-4 mt-6 space-y-2">
        {/* Validation message */}
        {(!formData.name.trim() || !codeAvailable || !formData.email.trim() || !formData.whatsapp.trim()) && (
          <div className="text-center text-sm text-amber-600 bg-amber-50 rounded-lg p-2 border border-amber-200">
            {!formData.name.trim() 
              ? "⚠️ Please enter an agency name first"
              : !codeAvailable 
                ? "⚠️ Please generate or enter a valid agency code"
                : !formData.email.trim()
                  ? "⚠️ Please enter your email"
                  : !formData.whatsapp.trim()
                    ? "⚠️ Please enter your WhatsApp number"
                    : ""}
          </div>
        )}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !codeAvailable || !formData.name.trim() || !formData.email.trim() || !formData.whatsapp.trim()}
          className={`w-full h-12 transition-all ${
            isSubmitting || !codeAvailable || !formData.name.trim() || !formData.email.trim() || !formData.whatsapp.trim()
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-slate-800"
          }`}
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating Agency...
            </span>
          ) : (
            <>
              <Building2 className="w-5 h-5 mr-2" />
              Create Agency
            </>
          )}
        </Button>
      </div>
      </div>
    </div>
  );
};

export default CreateAgency;
