import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import { Save, RefreshCw, MessageSquare, Radio, Headphones, Video, Gamepad2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WelcomeMessage {
  id: string;
  room_type: string;
  title: string;
  message: string;
  icon_emoji: string;
  background_color: string;
  text_color: string;
  is_active: boolean;
}

const roomTypeConfig = {
  live: { 
    label: 'Live Stream', 
    icon: Radio, 
    color: 'from-rose-500 to-pink-500',
    description: 'Message shown when users join a live stream'
  },
  party_audio: { 
    label: 'Audio Party Room', 
    icon: Headphones, 
    color: 'from-purple-500 to-indigo-500',
    description: 'Message shown when users join an audio party'
  },
  party_video: { 
    label: 'Video Party Room', 
    icon: Video, 
    color: 'from-blue-500 to-cyan-500',
    description: 'Message shown when users join a video party'
  },
  party_game: { 
    label: 'Game Party Room', 
    icon: Gamepad2, 
    color: 'from-green-500 to-emerald-500',
    description: 'Message shown when users join a game party'
  },
};

export default function AdminRoomWelcomeMessages() {
  const [messages, setMessages] = useState<WelcomeMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useAdminRealtime(['room_welcome_messages'], () => fetchMessages());

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('room_welcome_messages')
        .select('*')
        .order('room_type');

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to load welcome messages');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMessage = async (message: WelcomeMessage) => {
    setSaving(message.id);
    try {
      const { error } = await supabase
        .from('room_welcome_messages')
        .update({
          title: message.title,
          message: message.message,
          icon_emoji: message.icon_emoji,
          is_active: message.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', message.id);

      if (error) throw error;
      toast.success(`${roomTypeConfig[message.room_type as keyof typeof roomTypeConfig]?.label || message.room_type} message updated!`);
    } catch (error) {
      console.error('Error updating message:', error);
      toast.error('Failed to update message');
    } finally {
      setSaving(null);
    }
  };

  const handleFieldChange = (id: string, field: keyof WelcomeMessage, value: string | boolean) => {
    setMessages(prev => prev.map(msg => 
      msg.id === id ? { ...msg, [field]: value } : msg
    ));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Room Welcome Messages</h1>
            <p className="text-sm text-muted-foreground">Configure warning/welcome messages shown when users join rooms</p>
          </div>
        </div>
        <Button onClick={fetchMessages} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Info Card */}
      <Card className="bg-amber-500/10 border-amber-500/30">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-400 font-medium">Important</p>
            <p className="text-xs text-muted-foreground mt-1">
              These messages appear as banners when users join Live Streams or Party Rooms. 
              Use them to display community guidelines, warnings, or welcome messages. 
              They auto-hide after 20 seconds.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Message Cards */}
      <div className="grid gap-6">
        {messages.map((message) => {
          const config = roomTypeConfig[message.room_type as keyof typeof roomTypeConfig];
          const IconComponent = config?.icon || MessageSquare;
          
          return (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="overflow-hidden">
                <CardHeader className={`bg-gradient-to-r ${config?.color || 'from-gray-500 to-gray-600'} text-white py-4`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <IconComponent className="w-6 h-6" />
                      <div>
                        <CardTitle className="text-lg">{config?.label || message.room_type}</CardTitle>
                        <p className="text-xs opacity-80">{config?.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs opacity-80">Active</span>
                      <Switch
                        checked={message.is_active}
                        onCheckedChange={(checked) => handleFieldChange(message.id, 'is_active', checked)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={message.title}
                        onChange={(e) => handleFieldChange(message.id, 'title', e.target.value)}
                        placeholder="Welcome title..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Icon Emoji</Label>
                      <Input
                        value={message.icon_emoji}
                        onChange={(e) => handleFieldChange(message.id, 'icon_emoji', e.target.value)}
                        placeholder="🔴"
                        className="w-24"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Message Content</Label>
                    <Textarea
                      value={message.message}
                      onChange={(e) => handleFieldChange(message.id, 'message', e.target.value)}
                      placeholder="Welcome message or warning text..."
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">{message.message.length}/500 characters</p>
                  </div>

                  {/* Preview */}
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Preview</Label>
                    <div className={`p-4 rounded-xl bg-gradient-to-r ${message.background_color} border border-white/20`}>
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-2xl">
                          {message.icon_emoji}
                        </div>
                        <div className="flex-1">
                          <h4 className={`font-bold text-sm ${message.text_color}`}>{message.title}</h4>
                          <p className={`text-[11px] leading-relaxed opacity-90 ${message.text_color}`}>
                            {message.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button 
                      onClick={() => handleUpdateMessage(message)}
                      disabled={saving === message.id}
                      className={`bg-gradient-to-r ${config?.color || 'from-gray-500 to-gray-600'}`}
                    >
                      {saving === message.id ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
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
