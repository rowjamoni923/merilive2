import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Bot, Mail, Clock, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import AISupportChat from "@/components/support/AISupportChat";
import { recordClientError } from "@/utils/clientErrorLog";

const CustomerService = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showChat, setShowChat] = useState(false);
  const [userLevel, setUserLevel] = useState(1);
  const [userName, setUserName] = useState("User");
  const [loading, setLoading] = useState(true);

  const deepLinkMode = searchParams.get("mode");
  const deepLinkTicketId = searchParams.get("ticket_id");
  const deepLinkMessageId = searchParams.get("message_id");
  const shouldOpenLiveChatFromNotification = deepLinkMode === "live_chat" || Boolean(deepLinkTicketId);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name, user_level")
            .eq("id", user.id)
            .single();

          if (profile) {
            setUserLevel(profile.user_level || 1);
            setUserName(profile.display_name || "User");
          }
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        recordClientError({ label: "CustomerService.fetchUserData", message: error instanceof Error ? error.message : String(error) });
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  useEffect(() => {
    if (shouldOpenLiveChatFromNotification) {
      setShowChat(true);
    }
  }, [shouldOpenLiveChatFromNotification]);

  const isPremium = userLevel >= 6;

  const handleCloseChat = () => {
    setShowChat(false);
    if (shouldOpenLiveChatFromNotification) {
      navigate("/settings/customer-service", { replace: true });
    }
  };

  // Show AI chat interface (which now includes live chat)
  if (showChat) {
    return (
      <div className="mobile-page bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF]">
        <AISupportChat
          onClose={handleCloseChat}
          userLevel={userLevel}
          userName={userName}
          isPremium={isPremium}
          deepLinkMode={deepLinkMode}
          deepLinkTicketId={deepLinkTicketId}
          deepLinkMessageId={deepLinkMessageId}
        />
      </div>
    );
  }

  return (
    <div className="mobile-page bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF]">
      {/* Header */}
      <div className="mobile-header bg-white/80 backdrop-blur-xl border-b border-amber-200/50">
        <div className="flex items-center h-14 px-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-amber-50 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-7">Customer Service</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* AI Chat Card - Main Feature (includes Live Chat) */}
        <div
          onClick={() => setShowChat(true)}
          className="relative overflow-hidden bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 rounded-2xl p-5 cursor-pointer hover:shadow-lg transition-all border border-primary/20"
        >
          {isPremium && (
            <div className="absolute top-3 right-3">
              <span className="px-2 py-1 text-xs bg-gradient-to-r from-amber-400 to-orange-500 text-slate-800 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Priority Support
              </span>
            </div>
          )}

          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0">
              <Bot className="w-7 h-7 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1">Chat with AI Support</h3>
              <p className="text-sm text-slate-600 mb-3">
                Get instant help 24/7 • Type "Live Chat" for human support
              </p>
              <Button size="sm" className="gap-2">
                <MessageCircle className="w-4 h-4" />
                Start Chat
              </Button>
            </div>
          </div>
        </div>

        {/* Quick Info Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-amber-50/50 rounded-xl p-4">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
              <Mail className="w-5 h-5 text-blue-500" />
            </div>
            <h4 className="font-medium text-sm mb-1">Email Support</h4>
            <p className="text-xs text-slate-600">merilive.us@gmail.com</p>
          </div>

          <div className="bg-amber-50/50 rounded-xl p-4">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
              <Clock className="w-5 h-5 text-green-500" />
            </div>
            <h4 className="font-medium text-sm mb-1">Response Time</h4>
            <p className="text-xs text-slate-600">Within 24 hours</p>
          </div>
        </div>

        {/* Common Issues */}
        <div className="bg-amber-50/30 rounded-xl p-4">
          <h3 className="font-semibold mb-3">Common Issues</h3>
          <div className="space-y-3">
            {[
              { title: "Account Issues", desc: "Login, verification, profile problems" },
              { title: "Payment Issues", desc: "Recharge, diamonds, transactions" },
              { title: "Technical Issues", desc: "App crashes, bugs, errors" },
            ].map((item) => (
              <button
                key={item.title}
                onClick={() => setShowChat(true)}
                className="w-full flex items-center justify-between p-3 bg-background rounded-lg hover:bg-amber-50 transition-colors"
              >
                <div className="text-left">
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="text-xs text-slate-600">{item.desc}</p>
                </div>
                <MessageCircle className="w-4 h-4 text-slate-600" />
              </button>
            ))}
          </div>
        </div>

        {/* User Level Info */}
        <div className="text-center text-xs text-slate-600">
          <p>Your Level: {userLevel}</p>
          {!isPremium && (
            <p className="mt-1">Reach Level 6 to unlock Priority Support in your Profile</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerService;
