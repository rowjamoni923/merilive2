import { Mail, MessageCircle, Globe, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PublicContact = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FAF5EA] to-[#FFFBF2] text-white">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700">
        <div className="flex items-center h-14 px-4 gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-amber-50/70 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-800" />
          </button>
          <h1 className="text-lg font-bold text-slate-800">Contact Us</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-8 space-y-6">
        {/* Hero */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-extrabold">Get in Touch</h2>
          <p className="text-slate-500 text-sm">
            We'd love to hear from you. Reach out through any of the channels below.
          </p>
        </div>

        {/* Contact Cards */}
        <div className="space-y-4">
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-amber-200/60 p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="font-bold text-[15px]">Email Support</h3>
              <p className="text-slate-500 text-sm mt-1">For general inquiries and support</p>
              <a
                href="mailto:support@merilive.com"
                className="text-purple-400 text-sm mt-2 inline-block hover:underline"
              >
                support@merilive.com
              </a>
            </div>
          </div>

          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-amber-200/60 p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-[15px]">In-App Support</h3>
              <p className="text-slate-500 text-sm mt-1">
                Open the app and go to Settings → Customer Service for live chat support.
              </p>
            </div>
          </div>

          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-amber-200/60 p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Globe className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-[15px]">Website</h3>
              <p className="text-slate-500 text-sm mt-1">Visit our website for more information</p>
              <a
                href="https://merilive.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 text-sm mt-2 inline-block hover:underline"
              >
                merilive.com
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-4">
          <p className="text-slate-500 text-xs">© MeriLive — All Rights Reserved</p>
        </div>
      </div>
    </div>
  );
};

export default PublicContact;
