import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Shield, Wallet, TrendingUp, Globe, Users, 
  CheckCircle2, Sparkles, Gem, Phone, DollarSign, Star,
  Zap, Award, BadgeCheck, Clock, ArrowRight, Coins
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import bannerImage from "@/assets/payroll-helper-guide-banner.jpg";

const PayrollHelperGuide = () => {
  const navigate = useNavigate();

  const roles = [
    {
      icon: Coins,
      title: "Process User Top-ups",
      desc: "When users purchase coins through local payment methods (bKash, Nagad, JazzCash, etc.), you receive the payment and deliver the coins to the user's account instantly.",
      color: "from-amber-500 to-orange-500",
    },
    {
      icon: Wallet,
      title: "Process Agency Withdrawals",
      desc: "Agencies request weekly salary withdrawals for their hosts. You process these payments by sending money to the agency owner and receiving diamonds as reward in return.",
      color: "from-emerald-500 to-teal-500",
    },
    {
      icon: Gem,
      title: "Diamond Trading & Selling",
      desc: "Every withdrawal you process earns you diamonds. These diamonds can be sold back to agencies or users at market rate, creating a profitable trading cycle for you.",
      color: "from-cyan-500 to-blue-500",
    },
    {
      icon: Globe,
      title: "Agency Diamond Transfers",
      desc: "Transfer diamonds to agencies who need balance for their operations. You act as the bridge between the platform's diamond economy and real-world currency.",
      color: "from-purple-500 to-pink-500",
    },
  ];

  const benefits = [
    {
      icon: TrendingUp,
      title: "Commission on Every Transaction",
      desc: "Earn a percentage commission on every top-up and withdrawal you process. Higher levels unlock higher commission rates (up to 12%+).",
    },
    {
      icon: Gem,
      title: "Diamond Rewards from Withdrawals",
      desc: "When you process an agency withdrawal, you receive diamonds as a reward. These diamonds have real monetary value and can be sold.",
    },
    {
      icon: Star,
      title: "Level-Up System (L1 → L5)",
      desc: "Start at Level 1 and progress to Level 5 by completing more transactions. Each level increases your commission rate and unlocks new privileges.",
    },
    {
      icon: Phone,
      title: "Add Your Number to Resource Panel",
      desc: "Your contact number is displayed in the Resource Panel so agencies and users can reach you directly for transactions. More visibility = more orders.",
    },
    {
      icon: Shield,
      title: "Verified Badge & Priority Support",
      desc: "As a verified Payroll Helper, you get a trusted badge on your profile and access to priority admin support for any transaction issues.",
    },
    {
      icon: Globe,
      title: "Serve Your Entire Country",
      desc: "You are assigned to your country and serve all users and agencies within that region. No geographical limits within your assigned zone.",
    },
  ];

  const howItWorks = [
    {
      step: "01",
      title: "Apply & Get Verified",
      desc: "Submit your Payroll Helper application through the app. Admin team reviews and verifies your identity within 24-48 hours.",
      color: "bg-amber-500",
    },
    {
      step: "02",
      title: "Add Your Payment Methods",
      desc: "Set up your local payment methods (bKash, Nagad, JazzCash, EasyPaisa, etc.) so users and agencies can send/receive payments.",
      color: "bg-emerald-500",
    },
    {
      step: "03",
      title: "Register in Resource Panel",
      desc: "Add your contact number to the Resource Panel. This makes you visible to all agencies and users in your country who need transaction help.",
      color: "bg-cyan-500",
    },
    {
      step: "04",
      title: "Receive & Process Orders",
      desc: "When a user wants to top-up or an agency requests withdrawal, you receive a notification. Process the payment and confirm the transaction.",
      color: "bg-purple-500",
    },
    {
      step: "05",
      title: "Earn Diamonds & Commission",
      desc: "For every completed transaction, you earn commission (percentage of amount) plus diamond rewards for withdrawal processing.",
      color: "bg-pink-500",
    },
    {
      step: "06",
      title: "Sell Diamonds for Profit",
      desc: "Accumulated diamonds can be sold to agencies or users who need them. This creates a secondary income stream on top of your commissions.",
      color: "bg-orange-500",
    },
  ];

  const diamondCycle = [
    { label: "Agency requests withdrawal", icon: Wallet },
    { label: "You pay the agency in local currency", icon: DollarSign },
    { label: "You receive diamonds as reward", icon: Gem },
    { label: "Sell diamonds to other agencies/users", icon: TrendingUp },
    { label: "Earn profit from the diamond trade", icon: Award },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-bold text-lg">Payroll Helper Guide</h1>
            <p className="text-xs text-muted-foreground">Complete A-Z Overview</p>
          </div>
        </div>
      </div>

      {/* Hero Banner */}
      <div className="relative">
        <img src={bannerImage} alt="Payroll Helper System" className="w-full h-52 object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <Badge className="bg-emerald-500/90 text-white border-0 text-xs mb-2">
            💎 Premium Earning Opportunity
          </Badge>
          <h2 className="text-2xl font-black text-white leading-tight">
            Become a Payroll Helper
          </h2>
          <p className="text-white/80 text-sm mt-1">
            Process salaries, earn diamonds, and build your trading business
          </p>
        </div>
      </div>

      <div className="p-4 space-y-6 pb-24">
        {/* What is a Payroll Helper */}
        <section className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-2xl p-5 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>
            <h3 className="font-bold text-base">What is a Payroll Helper?</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A <strong className="text-foreground">Payroll Helper</strong> is a trusted, verified member of our platform who acts as a <strong className="text-foreground">financial bridge</strong> between the app and its users. You process real-money transactions — including user diamond top-ups, agency salary withdrawals, and diamond transfers — using local payment methods. In return, you earn <strong className="text-foreground">commissions</strong> and <strong className="text-foreground">diamond rewards</strong> that can be converted into real profit.
          </p>
        </section>

        {/* Core Roles */}
        <section>
          <h3 className="font-bold text-base flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-amber-500" />
            Your Core Responsibilities
          </h3>
          <div className="space-y-3">
            {roles.map((role, idx) => (
              <div key={idx} className="bg-card rounded-xl border border-border overflow-hidden">
                <div className={`h-1 bg-gradient-to-r ${role.color}`} />
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${role.color} flex items-center justify-center shrink-0`}>
                      <role.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">{role.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{role.desc}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Benefits */}
        <section>
          <h3 className="font-bold text-base flex items-center gap-2 mb-3">
            <Award className="w-5 h-5 text-emerald-500" />
            Benefits You Get
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {benefits.map((benefit, idx) => (
              <div key={idx} className="bg-card rounded-xl border border-border p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <benefit.icon className="w-4.5 h-4.5 text-emerald-500" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">{benefit.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{benefit.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Resource Panel Section */}
        <section className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-2xl p-5 border border-blue-500/20">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Phone className="w-4 h-4 text-blue-500" />
            </div>
            <h3 className="font-bold text-base">Resource Panel — Your Contact Hub</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            As a Payroll Helper, you can <strong className="text-foreground">add your phone number</strong> to the <strong className="text-foreground">Resource Panel</strong>. This panel is visible to all agencies and users in your country. When they need to recharge diamonds, withdraw salary, or transfer diamonds, they will <strong className="text-foreground">contact you directly</strong> through the number listed here.
          </p>
          <div className="bg-card/50 rounded-lg p-3 border border-border space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
              <span>Your name, country, and phone number are displayed publicly</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
              <span>Users & agencies can WhatsApp or call you for orders</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
              <span>More visibility means more transactions and more earnings</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
              <span>Admin verifies your contact before it goes live</span>
            </div>
          </div>
        </section>

        {/* How It Works — Step by Step */}
        <section>
          <h3 className="font-bold text-base flex items-center gap-2 mb-3">
            <BadgeCheck className="w-5 h-5 text-purple-500" />
            How It Works — Step by Step
          </h3>
          <div className="space-y-3">
            {howItWorks.map((step, idx) => (
              <div key={idx} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full ${step.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {step.step}
                  </div>
                  {idx < howItWorks.length - 1 && (
                    <div className="w-0.5 h-full bg-border mt-1" />
                  )}
                </div>
                <div className="pb-4">
                  <h4 className="font-semibold text-sm">{step.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Diamond Earning Cycle */}
        <section className="bg-gradient-to-br from-cyan-500/10 to-teal-500/10 rounded-2xl p-5 border border-cyan-500/20">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <Gem className="w-4 h-4 text-cyan-500" />
            </div>
            <h3 className="font-bold text-base">Diamond Earning & Selling Cycle</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            This is how the <strong className="text-foreground">diamond economy</strong> works for you as a Payroll Helper:
          </p>
          <div className="space-y-2">
            {diamondCycle.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center shrink-0">
                  <item.icon className="w-4 h-4 text-cyan-500" />
                </div>
                <div className="flex-1 bg-card/50 rounded-lg px-3 py-2 border border-border">
                  <span className="text-xs font-medium">{item.label}</span>
                </div>
                {idx < diamondCycle.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 hidden sm:block" />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-3 font-medium">
            💡 The more withdrawals you process, the more diamonds you accumulate. Sell them strategically for maximum profit!
          </p>
        </section>

        {/* Salary Processing for Hosts */}
        <section className="bg-gradient-to-br from-pink-500/10 to-rose-500/10 rounded-2xl p-5 border border-pink-500/20">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center">
              <Users className="w-4 h-4 text-pink-500" />
            </div>
            <h3 className="font-bold text-base">Paying Agency & Host Salaries</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Every week, agencies submit withdrawal requests to pay their hosts' salaries. As a Payroll Helper, here's your role:
          </p>
          <div className="space-y-2">
            {[
              "Agency submits a withdrawal request with the total amount",
              "You receive the order notification in your Helper Dashboard",
              "You send the payment to the agency owner via local payment method",
              "Upload payment screenshot as proof of transaction",
              "Admin verifies and confirms the transaction",
              "You receive diamonds as reward (based on withdrawal amount)",
              "Diamonds are added to your Trader Wallet instantly",
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-pink-500 mt-0.5 shrink-0" />
                <span className="text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Important Notes */}
        <section className="bg-card rounded-2xl p-5 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Shield className="w-4 h-4 text-amber-500" />
            </div>
            <h3 className="font-bold text-base">Important Guidelines</h3>
          </div>
          <div className="space-y-2">
            {[
              "Always process orders within 24 hours of receiving them",
              "Upload clear payment screenshots for every transaction",
              "Never share your login credentials with anyone",
              "Maintain professional communication with users and agencies",
              "Report any suspicious activity to the admin team immediately",
              "Your helper status can be revoked if guidelines are violated",
              "Contact admin support for any transaction disputes",
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs">
                <div className="w-4 h-4 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[8px] font-bold text-amber-500">{idx + 1}</span>
                </div>
                <span className="text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center space-y-3">
          <Button
            onClick={() => navigate("/helper-dashboard")}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold py-6 text-base rounded-xl"
          >
            Go to Helper Dashboard
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <p className="text-xs text-muted-foreground">
            Already a helper? Access your dashboard to manage transactions
          </p>
        </div>
      </div>
    </div>
  );
};

export default PayrollHelperGuide;
