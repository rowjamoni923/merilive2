import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import { Save, RefreshCw, MessageSquare, Radio, Headphones, Camera, Gamepad2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
interface WelcomeMessage {
  id: string;
  room_id: string | null;
  message_text: string;
  is_active: boolean;
  created_at?: string;
}

const roomTypeConfig = [
  {
    key: "live",
    label: "Live Stream",
    icon: Radio,
    color: "from-rose-500 to-pink-500",
    description: "Message shown when users join a live stream",
    placeholder: "Welcome to the live room. Please follow community guidelines.",
  },
  {
    key: "party_audio",
    label: "Audio Party Room",
    icon: Headphones,
    color: "from-purple-500 to-indigo-500",
    description: "Message shown when users join an audio party",
    placeholder: "Enjoy the audio room and respect all participants.",
  },
  {
    key: "party_video",
    label: "Camera Party Room",
    icon: Camera,
    color: "from-blue-500 to-cyan-500",
    description: "Message shown when users join a video party",
    placeholder: "Keep video content appropriate and friendly.",
  },
  {
    key: "party_game",
    label: "Game Party Room",
    icon: Gamepad2,
    color: "from-green-500 to-emerald-500",
    description: "Message shown when users join a game party",
    placeholder: "Play fair and have fun.",
  },
] as const;

export default function AdminRoomWelcomeMessages() {
  const [messages, setMessages] = useState<WelcomeMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("room_welcome_messages")
        .select("id, room_id, message_text, is_active, created_at")
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error("Error fetching messages:", error);
      recordAdminError({ kind: "rpc", label: "AdminRoomWelcomeMessages.fetchMessages", message: formatAdminError(error) });
      toast.error("Failed to load welcome messages");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMessages();
  }, []);

  useAdminRealtime(["room_welcome_messages"], fetchMessages);

  const handleUpdateMessage = async (message: WelcomeMessage) => {
    setSaving(message.id);
    try {
      const { error } = await supabase
        .from("room_welcome_messages")
        .update({
          message_text: message.message_text,
          is_active: message.is_active,
        })
        .eq("id", message.id);

      if (error) throw error;
      toast.success("Welcome message updated");
    } catch (error) {
      console.error("Error updating message:", error);
      recordAdminError({ kind: "rpc", label: "AdminRoomWelcomeMessages.handleUpdateMessage", message: formatAdminError(error) });
      toast.error("Failed to update message");
    } finally {
      setSaving(null);
    }
  };

  const handleFieldChange = (id: string, field: keyof WelcomeMessage, value: string | boolean) => {
    setMessages((prev) => prev.map((msg) => (msg.id === id ? { ...msg, [field]: value } : msg)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="admin-pro-shell space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-slate-900" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Room Welcome Messages</h1>
            <p className="text-sm text-muted-foreground">Configure warning/welcome messages shown when users join rooms</p>
          </div>
        </div>
        <Button onClick={fetchMessages} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card className="bg-amber-500/10 border-amber-500/30">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-400 font-medium">Important</p>
            <p className="text-xs text-muted-foreground mt-1">
              These messages appear as banners when users join Live Streams or Party Rooms.
              Use them to display community guidelines, warnings, or welcome messages.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        {messages.map((message, index) => {
          const config = roomTypeConfig[index] || roomTypeConfig[0];
          const IconComponent = config.icon;

          return (
            <motion.div key={message.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="overflow-hidden">
                <CardHeader className={`bg-gradient-to-r ${config.color} text-white py-4`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <IconComponent className="w-6 h-6" />
                      <div>
                        <CardTitle className="text-lg">{config.label}</CardTitle>
                        <p className="text-xs opacity-80">{config.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs opacity-80">Active</span>
                      <Switch
                        checked={message.is_active}
                        onCheckedChange={(checked) => handleFieldChange(message.id, "is_active", checked)}
                      />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-4">
                  <div className="space-y-2">
                    <Label>Message Content</Label>
                    <Textarea
                      value={message.message_text}
                      onChange={(e) => handleFieldChange(message.id, "message_text", e.target.value)}
                      placeholder={config.placeholder}
                      rows={4}
                    />
                    <p className="text-xs text-muted-foreground">{message.message_text.length}/500 characters</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Preview</Label>
                    <div className={`p-4 rounded-xl bg-gradient-to-r ${config.color} border border-white/20 text-white`}>
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                          <IconComponent className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-sm">{config.label}</h4>
                          <p className="text-[11px] leading-relaxed opacity-90">{message.message_text}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => handleUpdateMessage(message)} disabled={saving === message.id} className={`bg-gradient-to-r ${config.color}`}>
                      {saving === message.id ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      Save Changes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
