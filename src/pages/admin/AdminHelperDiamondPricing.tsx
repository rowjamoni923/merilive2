import { useState, useEffect } from "react";
import { 
  Gem, Star, Crown, Shield, Save, Loader2, RefreshCw,
  DollarSign, TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";

interface DiamondPackage {
  id: string;
  level_number: number;
  diamond_amount: number;
  price_usd: number;
  is_active: boolean;
  display_order: number | null;
  description?: string | null;
}

const getPackageLevelNumber = (pkg: Partial<DiamondPackage>, index: number) => {
  const descriptionMatch = pkg.description?.match(/level\s*(\d+)/i);
  return pkg.display_order || (descriptionMatch ? Number(descriptionMatch[1]) : index + 1);
};

const normalizePackages = (rows: any[] = []): DiamondPackage[] =>
  rows.map((pkg, index) => ({
    ...pkg,
    level_number: getPackageLevelNumber(pkg, index),
  }));

const AdminHelperDiamondPricing = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [packages, setPackages] = useState<DiamondPackage[]>([]);

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('helper_diamond_packages')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setPackages(normalizePackages(data || []));
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useAdminRealtime(
    ['helper_diamond_packages'],
    loadPackages,
    'admin-helper-pricing-rt'
  , { enableRealtimeRefresh: true });

  const handleUpdate = async (pkg: DiamondPackage) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('helper_diamond_packages')
        .update({
          diamond_amount: pkg.diamond_amount,
          price_usd: pkg.price_usd,
          is_active: pkg.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', pkg.id);

      if (error) throw error;

      toast({ title: "Saved!", description: `Level ${pkg.level_number} pricing updated` });
      loadPackages();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updatePackage = (id: string, field: keyof DiamondPackage, value: any) => {
    setPackages(prev => prev.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  const getLevelIcon = (level: number) => {
    const icons: Record<number, { icon: any; color: string; label: string }> = {
      1: { icon: Star, color: "from-amber-600 to-amber-700", label: "Bronze" },
      2: { icon: Star, color: "from-slate-400 to-slate-500", label: "Silver" },
      3: { icon: Crown, color: "from-yellow-400 to-yellow-500", label: "Gold" },
      4: { icon: Shield, color: "from-slate-300 to-slate-400", label: "Platinum" },
      5: { icon: Gem, color: "from-cyan-400 to-blue-500", label: "Diamond" }
    };
    return icons[level] || icons[1];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gem className="w-6 h-6 text-cyan-500" />
            Helper Diamond Pricing
          </h1>
          <p className="text-muted-foreground">
            Configure diamond amounts per level for the same price
          </p>
        </div>
        <Button variant="outline" onClick={loadPackages}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Info Card */}
      <Card className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-cyan-500/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Level-Based Diamond Benefits</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Higher level helpers get more diamonds for the same price. This incentivizes helpers to upgrade their level 
                for better margins when reselling to users.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Diamond Packages by Level</CardTitle>
          <CardDescription>
            Set the diamond amount each level receives for the base price
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Level</TableHead>
                <TableHead>Diamond Amount</TableHead>
                <TableHead>Price (USD)</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((pkg) => {
                const levelInfo = getLevelIcon(pkg.level_number);
                const LevelIcon = levelInfo.icon;
                
                return (
                  <TableRow key={pkg.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-r",
                          levelInfo.color
                        )}>
                          <LevelIcon className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="font-medium">Level {pkg.level_number}</p>
                          <p className="text-xs text-muted-foreground">{levelInfo.label}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Gem className="w-4 h-4 text-cyan-500" />
                        <Input
                          type="number"
                          value={pkg.diamond_amount}
                          onChange={(e) => updatePackage(pkg.id, 'diamond_amount', Number(e.target.value))}
                          className="w-32"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-green-500" />
                        <Input
                          type="number"
                          value={pkg.price_usd}
                          onChange={(e) => updatePackage(pkg.id, 'price_usd', Number(e.target.value))}
                          className="w-24"
                          step="0.01"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={pkg.is_active}
                        onCheckedChange={(checked) => updatePackage(pkg.id, 'is_active', checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(pkg)}
                        disabled={saving}
                      >
                        {saving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Preview Cards */}
      <div>
        <h3 className="font-semibold mb-4">Pricing Preview</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {packages.filter(p => p.is_active).map((pkg) => {
            const levelInfo = getLevelIcon(pkg.level_number);
            const LevelIcon = levelInfo.icon;
            const bonusPercent = Math.round(((pkg.diamond_amount - packages[0]?.diamond_amount) / packages[0]?.diamond_amount) * 100);
            
            return (
              <Card 
                key={pkg.id} 
                className={cn(
                  "relative overflow-hidden",
                  pkg.level_number === 5 && "ring-2 ring-cyan-500"
                )}
              >
                {pkg.level_number === 5 && (
                  <div className="absolute top-0 right-0 bg-cyan-500 text-white text-[10px] px-2 py-0.5 rounded-bl-lg">
                    Best Value
                  </div>
                )}
                <CardContent className="p-4 text-center">
                  <div className={cn(
                    "w-12 h-12 rounded-xl mx-auto flex items-center justify-center bg-gradient-to-r mb-3",
                    levelInfo.color
                  )}>
                    <LevelIcon className="w-6 h-6 text-white" />
                  </div>
                  <h4 className="font-semibold">{levelInfo.label}</h4>
                  <p className="text-xs text-muted-foreground mb-2">Level {pkg.level_number}</p>
                  <p className="text-2xl font-bold text-cyan-500">
                    {pkg.diamond_amount.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">💎 Diamonds</p>
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-lg font-bold">${pkg.price_usd}</p>
                    {bonusPercent > 0 && (
                      <Badge className="mt-1 bg-green-500/20 text-green-600 border-green-500/30">
                        +{bonusPercent}% Bonus
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AdminHelperDiamondPricing;
