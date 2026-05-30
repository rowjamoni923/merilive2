import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";

import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  ArrowLeft, 
  Building2,
  Users,
  Wallet,
  TrendingUp,
  Crown,
  Clock,
  Gift,
  Coins,
  Copy,
  CheckCircle2,
  User,
  Loader2,
  ChevronRight,
  BarChart3,
  Share2,
  Link as LinkIcon,
  UserPlus,
  TrendingDown,
  Calendar,
  DollarSign,
  Diamond,
  ArrowRightLeft,
  Trophy,
  Sparkles,
  Eye,
  Settings,
  Bell,
  Shield,
  Star,
  Activity,
  Zap,
  Target,
  Award,
  Headphones,
  MessageCircle,
  Phone,
  Send,
  Hash,
  XCircle,
  Percent,
  FileText,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { getCurrencyRateForCountry } from "@/utils/currencyRatesCache";

import { getCachedUser } from "@/utils/cachedAuth";
import { HostsIcon3D, WithdrawIcon3D, RankingIcon3D, HelperIcon3D, DiamondExchangeIcon3D, PolicyIcon3D, HistoryIcon3D } from "@/components/agency/Premium3DIcons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Area, AreaChart } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import HelperApplicationForm from "@/components/helper/HelperApplicationForm";
import SubAgentsPanel from "@/components/agency/SubAgentsPanel";
import PayrollHelperWelcomeModal from "@/components/agency/PayrollHelperWelcomeModal";
import { formatNumber as formatNum } from "@/utils/formatNumber";
import { recordClientError } from "@/utils/clientErrorLog";

const fmtNum = (num: number | null | undefined) => formatNum(num);

const premiumCardClass = "agency-premium-card";

interface Agency {
  id: string;
  name: string;
  agency_code: string;
  level: string;
  wallet_balance: number;
  total_hosts: number;
  total_agents: number;
  commission_rate: number;
  created_at: string;
  logo_url: string | null;
  diamond_balance?: number;
  beans_balance?: number;
  parent_agency_id?: string | null;
}

const AgencyDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [weeklyData, setWeeklyData] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const user = await getCachedUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data } = await supabase.from("agencies").select("*").eq("owner_id", user.id).maybeSingle();
      if (data) setAgency(data);
      
      // Mock chart data
      setWeeklyData([
        { date: 'Mon', income: 400, hours: 20 },
        { date: 'Tue', income: 300, hours: 15 },
        { date: 'Wed', income: 600, hours: 25 },
        { date: 'Thu', income: 800, hours: 30 },
        { date: 'Fri', income: 500, hours: 22 },
        { date: 'Sat', income: 900, hours: 35 },
        { date: 'Sun', income: 1000, hours: 40 },
      ]);
      
      setIsLoading(false);
    };
    fetchData();
  }, [navigate]);

  if (isLoading || !agency) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Agency Dashboard</h1>
          <Badge>{agency.level}</Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-2 bg-slate-900">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-slate-900 border-slate-800">
                <CardContent className="p-4">
                  <p className="text-slate-400 text-sm">Wallet Balance</p>
                  <p className="text-2xl font-bold text-success-500">${fmtNum(agency.wallet_balance)}</p>
                </CardContent>
              </Card>
              <Card className="bg-slate-900 border-slate-800">
                <CardContent className="p-4">
                  <p className="text-slate-400 text-sm">Total Hosts</p>
                  <p className="text-2xl font-bold">{agency.total_hosts}</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="charts" className="mt-4 space-y-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle>Income Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip />
                      <Line type="monotone" dataKey="income" stroke="#8b5cf6" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AgencyDashboard;
