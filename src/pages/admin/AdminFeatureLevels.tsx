import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Video, Users, UserPlus, Phone, Gift, MessageCircle, 
  Save, Settings2, Loader2, Shield, Crown
} from "lucide-react";
import { adminStyles } from "@/styles/adminStyles";

const iconMap: Record<string, React.ComponentType<any>> = {
  Video,
  Users,
  UserPlus,
  Phone,
  Gift,
  MessageCircle,
};

const categoryColors: Record<string, string> = {
  streaming: "bg-red-500/20 text-red-400 border-red-500/30",
  party: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  communication: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  gifts: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  general: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

interface FeatureRequirement {
  id: string;
  feature_key: string;
  feature_name: string;
  feature_description: string | null;
  min_level_user: number;
  min_level_host: number;
  is_active: boolean;
  icon_name: string | null;
  category: string | null;
  display_order: number | null;
}

const AdminFeatureLevels = () => {
  const queryClient = useQueryClient();
  const [editedFeatures, setEditedFeatures] = useState<Record<string, Partial<FeatureRequirement>>>({});

  const { data: features, isLoading, refetch } = useQuery({
    queryKey: ["feature-level-requirements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_level_requirements")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as FeatureRequirement[];
    },
  });

  useAdminRealtime(['feature_level_requirements'], () => {
    void refetch();
  });

  const updateMutation = useMutation({
    mutationFn: async (feature: FeatureRequirement) => {
      const { error } = await supabase
        .from("feature_level_requirements")
        .update({
          min_level_user: feature.min_level_user,
          min_level_host: feature.min_level_host,
          is_active: feature.is_active,
        })
        .eq("id", feature.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-level-requirements"] });
      toast({
        title: "✅ Success",
        description: "Feature level updated",
      });
    },
    onError: (error) => {
      toast({
        title: "❌ Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (id: string, field: string, value: any) => {
    setEditedFeatures((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const handleSave = (feature: FeatureRequirement) => {
    const edited = editedFeatures[feature.id];
    if (!edited) return;

    updateMutation.mutate({
      ...feature,
      ...edited,
    });

    setEditedFeatures((prev) => {
      const newState = { ...prev };
      delete newState[feature.id];
      return newState;
    });
  };

  const getFeatureValue = (feature: FeatureRequirement, field: keyof FeatureRequirement) => {
    const edited = editedFeatures[feature.id];
    if (edited && field in edited) {
      return edited[field];
    }
    return feature[field];
  };

  const hasChanges = (id: string) => {
    return !!editedFeatures[id] && Object.keys(editedFeatures[id]).length > 0;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings2 className="w-7 h-7 text-primary" />
            Feature Level Requirements
          </h1>
          <p className="text-muted-foreground mt-1">
            Set minimum level requirements for users and hosts to access each feature
          </p>
        </div>
      </div>

      {/* Info Card */}
      <Card className={adminStyles.card}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm text-foreground font-medium">Level Control System</p>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="text-primary">User Level:</span> Minimum level required for regular users. 
                <span className="text-amber-400 ml-2">Host Level:</span> Minimum level required for verified hosts (usually 0).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Cards */}
      <div className="grid gap-4">
        {features?.map((feature) => {
          const IconComponent = iconMap[feature.icon_name || "Settings2"] || Settings2;
          const isEdited = hasChanges(feature.id);
          const isActive = getFeatureValue(feature, "is_active") as boolean;

          return (
            <Card 
              key={feature.id} 
              className={`${adminStyles.card} ${!isActive ? "opacity-60" : ""} ${isEdited ? "ring-2 ring-primary/50" : ""}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Icon & Info */}
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                      <IconComponent className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground">{feature.feature_name}</h3>
                        <Badge 
                          variant="outline" 
                          className={categoryColors[feature.category || "general"]}
                        >
                          {feature.category}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {feature.feature_description}
                      </p>
                    </div>
                  </div>

                  {/* Right: Controls */}
                  <div className="flex items-center gap-6">
                    {/* User Level */}
                    <div className="flex flex-col items-center gap-1">
                      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Users className="w-3 h-3" /> User
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={getFeatureValue(feature, "min_level_user") as number}
                        onChange={(e) => handleEdit(feature.id, "min_level_user", parseInt(e.target.value) || 0)}
                        className={`${adminStyles.input} w-20 text-center font-bold text-lg`}
                      />
                    </div>

                    {/* Host Level */}
                    <div className="flex flex-col items-center gap-1">
                      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Crown className="w-3 h-3 text-amber-400" /> Host
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={getFeatureValue(feature, "min_level_host") as number}
                        onChange={(e) => handleEdit(feature.id, "min_level_host", parseInt(e.target.value) || 0)}
                        className={`${adminStyles.input} w-20 text-center font-bold text-lg text-amber-400`}
                      />
                    </div>

                    <Separator orientation="vertical" className="h-12" />

                    {/* Active Toggle */}
                    <div className="flex flex-col items-center gap-1">
                      <Label className="text-xs font-medium text-muted-foreground">Active</Label>
                      <Switch
                        checked={isActive}
                        onCheckedChange={(checked) => handleEdit(feature.id, "is_active", checked)}
                      />
                    </div>

                    {/* Save Button */}
                    <Button
                      size="sm"
                      onClick={() => handleSave(feature)}
                      disabled={!isEdited || updateMutation.isPending}
                      className={isEdited ? "bg-primary hover:bg-primary/90" : ""}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default AdminFeatureLevels;
