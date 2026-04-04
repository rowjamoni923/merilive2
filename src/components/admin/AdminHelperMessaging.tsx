import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Send, Users, Crown, Loader2, MessageCircle, CheckCircle, Reply, Image, User, AlertCircle, Eye, Paperclip, X as XIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Level5Helper {
  id: string;
  user_id: string;
  wallet_balance: number;
  is_active: boolean;
  profile?: {
    display_name: string;
    avatar_url: string;
    app_uid: string;
  };
}

interface MessageReply {
  id: string;
  message_id: string;
  sender_id: string;
  sender_type: string;
  content: string;
  screenshot_url: string | null;
  is_read: boolean;
  created_at: string;
}

const AdminHelperMessaging = () => {
  const { toast } = useToast();
  const [helpers, setHelpers] = useState<Level5Helper[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [recentMessages, setRecentMessages] = useState<any[]>([]);
  
  // Message detail state
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [messageReplies, setMessageReplies] = useState<MessageReply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  
  // Unread helper replies count
  const [unreadRepliesCount, setUnreadRepliesCount] = useState(0);
  
  // Form states
  const [selectedHelper, setSelectedHelper] = useState<string>("all");
  const [messageTitle, setMessageTitle] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [priority, setPriority] = useState<string>("normal");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  useEffect(() => {
    loadHelpers();
    loadRecentMessages();
    loadUnreadRepliesCount();
  }, [selectedMessage]);

  const loadHelpers = async () => {
    const { data } = await supabase
      .from('topup_helpers')
      .select(`
        id, user_id, wallet_balance, is_active,
        profile:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid)
      `)
      .eq('trader_level', 5)
      .eq('payroll_enabled', true)
      .eq('is_active', true);
    
    setHelpers((data || []) as unknown as Level5Helper[]);
    setLoading(false);
  };

  const loadRecentMessages = async () => {
    const { data } = await supabase
      .from('helper_admin_messages')
      .select(`
        *,
        helper:topup_helpers!helper_admin_messages_helper_id_fkey(
          user_id,
          profile:profiles!topup_helpers_user_id_fkey(display_name, avatar_url)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(50);
    
    setRecentMessages(data || []);
  };

  const loadUnreadRepliesCount = async () => {
    const { count } = await supabase
      .from('helper_message_replies')
      .select('*', { count: 'exact', head: true })
      .eq('sender_type', 'helper')
      .eq('is_read' as any, false);
    
    setUnreadRepliesCount(count || 0);
  };

  const loadMessageReplies = async (messageId: string) => {
    setLoadingReplies(true);
    try {
      const { data, error } = await supabase
        .from('helper_message_replies')
        .select('*')
        .eq('message_id', messageId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessageReplies(data || []);
      
      // Mark helper replies as read
      const unreadHelperReplies = (data || []).filter(r => r.sender_type === 'helper' && !r.is_read);
      if (unreadHelperReplies.length > 0) {
        await supabase
          .from('helper_message_replies')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .in('id', unreadHelperReplies.map(r => r.id));
        
        loadUnreadRepliesCount();
        
        // Trigger a global event to refresh sidebar badge counts
        window.dispatchEvent(new CustomEvent('admin-badge-refresh'));
      }
    } catch (error: any) {
      console.error('Error loading replies:', error);
    } finally {
      setLoadingReplies(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploadingImages(true);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 10 * 1024 * 1024) {
          toast({ title: "Error", description: `${file.name} is too large (max 10MB)`, variant: "destructive" });
          continue;
        }
        const ext = file.name.split('.').pop();
        const path = `helper-messages/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from('chat-media').upload(path, file);
        if (error) { console.error(error); continue; }
        const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
        newUrls.push(urlData.publicUrl);
      }
      setAttachments(prev => [...prev, ...newUrls]);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingImages(false);
      e.target.value = '';
    }
  };

  const handleSendMessage = async () => {
    if (!messageTitle.trim() || !messageBody.trim()) {
      toast({ title: "Error", description: "Please fill in title and message", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (selectedHelper === "all") {
        const messages = helpers.map(helper => ({
          helper_id: helper.id,
          sender_id: user?.id,
          sender_type: 'admin',
          title: messageTitle,
          message: messageBody,
          priority: priority,
          attachments: attachments.length > 0 ? attachments : null
        }));

        const { error } = await supabase
          .from('helper_admin_messages')
          .insert(messages);

        if (error) throw error;
        toast({ title: "✅ Sent!", description: `Message sent to ${helpers.length} helpers` });
      } else {
        const { error } = await supabase
          .from('helper_admin_messages')
          .insert({
            helper_id: selectedHelper,
            sender_id: user?.id,
            sender_type: 'admin',
            title: messageTitle,
            message: messageBody,
            priority: priority,
            attachments: attachments.length > 0 ? attachments : null
          });

        if (error) throw error;
        toast({ title: "✅ Sent!", description: "Message sent successfully" });
      }

      setShowComposeDialog(false);
      setMessageTitle("");
      setMessageBody("");
      setPriority("normal");
      setSelectedHelper("all");
      setAttachments([]);
      loadRecentMessages();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedMessage || !replyContent.trim()) {
      toast({ title: "Error", description: "Please enter a reply message", variant: "destructive" });
      return;
    }

    setSendingReply(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from('helper_message_replies')
        .insert({
          message_id: selectedMessage.id,
          sender_id: user.id,
          sender_type: 'admin',
          content: replyContent.trim()
        });

      if (error) throw error;

      // Send notification to helper
      if (selectedMessage.helper?.user_id) {
        await supabase.from('notifications').insert({
          user_id: selectedMessage.helper.user_id,
          type: 'admin_message_reply',
          title: '💬 Admin Reply',
          message: `Reply to: ${selectedMessage.title}`,
          data: { message_id: selectedMessage.id }
        });
      }

      toast({ title: "✅ Reply Sent" });
      setReplyContent("");
      loadMessageReplies(selectedMessage.id);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSendingReply(false);
    }
  };

  const openMessageDetail = (msg: any) => {
    setSelectedMessage(msg);
    loadMessageReplies(msg.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Level 5 Helper Messaging</h2>
            <p className="text-muted-foreground text-sm">{helpers.length} active payroll helpers</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadRepliesCount > 0 && (
            <Badge className="bg-red-500 text-white">
              {unreadRepliesCount} new {unreadRepliesCount === 1 ? 'reply' : 'replies'}
            </Badge>
          )}
          <Button 
            onClick={() => setShowComposeDialog(true)}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          >
            <Send className="w-4 h-4 mr-2" />
            Compose Message
          </Button>
        </div>
      </div>

      {/* Helpers List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Crown className="w-5 h-5 text-yellow-500" />
            Level 5 Helpers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {helpers.map((helper) => (
              <div 
                key={helper.id}
                className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl"
              >
                <Avatar className="w-10 h-10 border-2 border-purple-500">
                  <AvatarImage src={helper.profile?.avatar_url} />
                  <AvatarFallback className="bg-purple-500/20 text-purple-400">
                    {helper.profile?.display_name?.charAt(0) || 'H'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {helper.profile?.display_name || 'Helper'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    💎 {helper.wallet_balance?.toLocaleString('en-US') || 0}
                  </p>
                </div>
                <Badge className="bg-green-500/20 text-green-400">Active</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Messages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Recent Messages
            {unreadRepliesCount > 0 && (
              <Badge className="bg-red-500 text-white text-xs ml-2">
                {unreadRepliesCount} unread
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentMessages.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No messages sent yet</p>
          ) : (
            recentMessages.map((msg) => (
              <div 
                key={msg.id}
                onClick={() => openMessageDetail(msg)}
                className={cn(
                  "flex items-start gap-3 p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors",
                  msg.has_replies && "border-l-4 border-l-green-500"
                )}
              >
                <div className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${
                  msg.priority === 'urgent' ? 'bg-red-500' :
                  msg.priority === 'high' ? 'bg-orange-500' : 'bg-green-500'
                }`} />
                <Avatar className="w-8 h-8 flex-shrink-0">
                  <AvatarImage src={msg.helper?.profile?.avatar_url} />
                  <AvatarFallback className="bg-purple-500/20 text-purple-400 text-xs">
                    {msg.helper?.profile?.display_name?.charAt(0) || 'H'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-foreground">{msg.title}</p>
                    {msg.is_read && <CheckCircle className="w-3 h-3 text-green-500" />}
                    {msg.has_replies && (
                      <Badge className="bg-green-500/20 text-green-400 text-[10px]">
                        <Reply className="w-2 h-2 mr-0.5" />
                        Has Replies
                      </Badge>
                    )}
                    {msg.priority === 'urgent' && (
                      <Badge className="bg-red-500 text-[10px]">Urgent</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">{msg.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      To: {msg.helper?.profile?.display_name || 'Helper'}
                    </span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(msg.created_at), 'dd MMM, HH:mm')}
                    </span>
                  </div>
                </div>
                <Eye className="w-4 h-4 text-muted-foreground" />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Compose Dialog */}
      <Dialog open={showComposeDialog} onOpenChange={setShowComposeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Message to Level 5 Helpers</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Recipient</Label>
              <Select value={selectedHelper} onValueChange={setSelectedHelper}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      All Level 5 Helpers ({helpers.length})
                    </span>
                  </SelectItem>
                  {helpers.map((helper) => (
                    <SelectItem key={helper.id} value={helper.id}>
                      {helper.profile?.display_name || 'Helper'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High (Important)</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Title *</Label>
              <Input
                value={messageTitle}
                onChange={(e) => setMessageTitle(e.target.value)}
                placeholder="Message title..."
                className="mt-1"
              />
            </div>

            <div>
              <Label>Message *</Label>
              <Textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder="Type your message..."
                className="mt-1 min-h-[100px]"
              />
            </div>
            {/* Image Attachments */}
            <div>
              <Label>Attachments</Label>
              <div className="mt-1 space-y-2">
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((url, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-0 right-0 bg-destructive text-destructive-foreground rounded-bl-lg p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <XIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border hover:bg-muted cursor-pointer transition-colors">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {uploadingImages ? 'Uploading...' : 'Add Images'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageUpload}
                    disabled={uploadingImages}
                  />
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowComposeDialog(false); setAttachments([]); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleSendMessage}
              disabled={sending || uploadingImages}
              className="bg-purple-500 hover:bg-purple-600"
            >
              {sending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send Message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message Detail Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={(open) => !open && setSelectedMessage(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 border-b">
            <div className="flex items-start gap-3">
              <Avatar className="w-10 h-10">
                <AvatarImage src={selectedMessage?.helper?.profile?.avatar_url} />
                <AvatarFallback className="bg-purple-500/20 text-purple-400">
                  {selectedMessage?.helper?.profile?.display_name?.charAt(0) || 'H'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <DialogTitle className="text-left">{selectedMessage?.title}</DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    To: {selectedMessage?.helper?.profile?.display_name || 'Helper'}
                  </span>
                  {selectedMessage?.priority === 'urgent' && (
                    <Badge className="bg-red-500 text-[10px]">Urgent</Badge>
                  )}
                  {selectedMessage?.priority === 'high' && (
                    <Badge className="bg-orange-500 text-[10px]">Important</Badge>
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
            <div className="space-y-4">
              {/* Original Message */}
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-4 h-4 text-purple-400" />
                  <span className="text-xs text-purple-400 font-medium">Your Message</span>
                  <span className="text-xs text-muted-foreground">
                    {selectedMessage && format(new Date(selectedMessage.created_at), 'dd MMM yyyy, HH:mm')}
                  </span>
                </div>
                <p className="text-foreground text-sm whitespace-pre-wrap">{selectedMessage?.message}</p>
              </div>

              {/* Replies */}
              {loadingReplies ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                </div>
              ) : messageReplies.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground font-medium">Conversation</p>
                  {messageReplies.map((reply) => (
                    <div 
                      key={reply.id}
                      className={cn(
                        "rounded-xl p-3",
                        reply.sender_type === 'admin' 
                          ? "bg-purple-500/10 border border-purple-500/20 mr-4" 
                          : "bg-cyan-500/10 border border-cyan-500/20 ml-4"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {reply.sender_type === 'admin' ? (
                          <Crown className="w-3 h-3 text-purple-400" />
                        ) : (
                          <User className="w-3 h-3 text-cyan-400" />
                        )}
                        <span className={cn(
                          "text-[10px] font-medium",
                          reply.sender_type === 'admin' ? "text-purple-400" : "text-cyan-400"
                        )}>
                          {reply.sender_type === 'admin' ? 'You (Admin)' : 'Helper'}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(reply.created_at), 'dd MMM, HH:mm')}
                        </span>
                      </div>
                      <p className="text-foreground text-sm whitespace-pre-wrap">{reply.content}</p>
                      {reply.screenshot_url && (
                        <div className="mt-2">
                          <a 
                            href={reply.screenshot_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline"
                          >
                            <Image className="w-3 h-3" />
                            View Screenshot
                          </a>
                          <img 
                            src={reply.screenshot_url} 
                            alt="Screenshot" 
                            className="mt-1 max-w-full h-auto max-h-40 rounded-lg border"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground text-sm py-4">
                  No replies yet
                </p>
              )}
            </div>
          </div>

          {/* Reply Input */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Type your reply..."
                className="min-h-[60px] resize-none"
              />
              <Button
                onClick={handleSendReply}
                disabled={sendingReply || !replyContent.trim()}
                className="bg-purple-500 hover:bg-purple-600 h-auto"
              >
                {sendingReply ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminHelperMessaging;
