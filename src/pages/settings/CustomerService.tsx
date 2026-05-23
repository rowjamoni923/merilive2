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
  const hasVerificationSupportBlocker = (() => {
    try { return Boolean(sessionStorage.getItem("verification_blocker")); } catch { return false; }
  })();

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
    if (shouldOpenLiveChatFromNotification || hasVerificationSupportBlocker) {
      setShowChat(true);
    }
  }, [shouldOpenLiveChatFromNotification, hasVerificationSupportBlocker]);

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
    <div className="mobile-page bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF] min-h-screen">
      {/* Header */}
      <div className="mobile-header bg-white/85 backdrop-blur-xl border-b border-amber-200/60 shadow-sm">
        <div className="flex items-center h-14 px-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-amber-100/60 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-slate-800 pr-7">Customer Service</h1>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* AI Chat Card - Main Feature */}
        <div
          onClick={() => setShowChat(true)}
          className="relative overflow-hidden bg-gradient-to-br from-fuchsia-50 via-pink-50 to-rose-50 rounded-2xl p-5 cursor-pointer hover:shadow-xl transition-all border border-pink-200/70 shadow-md"
        >
          {isPremium && (
            <div className="absolute top-3 right-3">
              <span className="px-2.5 py-1 text-[11px] font-bold bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full flex items-center gap-1 shadow-md">
                <Sparkles className="w-3 h-3" />
                Priority Support
              </span>
            </div>
          )}

          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-500 flex items-center justify-center shrink-0 shadow-lg shadow-pink-500/30">
              <Bot className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg mb-1 text-slate-800">Chat with AI Support</h3>
              <p className="text-sm text-slate-600 mb-3 leading-snug">
                Get instant help 24/7 • Type "Live Chat" for human support
              </p>
              <Button
                size="sm"
                className="gap-2 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white border-0 shadow-md shadow-purple-500/30 rounded-full px-5"
              >
                <MessageCircle className="w-4 h-4" />
                Start Chat
              </Button>
            </div>
          </div>
        </div>

        {/* Quick Info Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-4 border border-amber-200/60 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mb-3">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <h4 className="font-semibold text-sm mb-1 text-slate-800">Email Support</h4>
            <p className="text-xs text-slate-600 truncate">merilive.us@gmail.com</p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-amber-200/60 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
              <Clock className="w-5 h-5 text-emerald-600" />
            </div>
            <h4 className="font-semibold text-sm mb-1 text-slate-800">Response Time</h4>
            <p className="text-xs text-slate-600">Within 24 hours</p>
          </div>
        </div>

        {/* Common Issues */}
        <div className="bg-white rounded-2xl p-4 border border-amber-200/60 shadow-sm">
          <h3 className="font-bold text-base mb-3 text-slate-800">Common Issues</h3>
          <div className="space-y-2.5">
            {[
              { title: "Account Issues", desc: "Login, verification, profile problems" },
              { title: "Payment Issues", desc: "Recharge, diamonds, transactions" },
              { title: "Technical Issues", desc: "App crashes, bugs, errors" },
            ].map((item) => (
              <button
                key={item.title}
                onClick={() => setShowChat(true)}
                className="w-full flex items-center justify-between p-3 bg-amber-50/60 hover:bg-amber-100/70 rounded-xl border border-amber-200/50 transition-colors active:scale-[0.99]"
              >
                <div className="text-left">
                  <p className="font-semibold text-sm text-slate-800">{item.title}</p>
                  <p className="text-xs text-slate-600">{item.desc}</p>
                </div>
                <MessageCircle className="w-4 h-4 text-purple-500 shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* User Level Info */}
        <div className="text-center text-xs text-slate-600">
          <p>Your Level: <span className="font-semibold text-slate-800">{userLevel}</span></p>
          {!isPremium && (
            <p className="mt-1">Reach Level 6 to unlock Priority Support in your Profile</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerService;
