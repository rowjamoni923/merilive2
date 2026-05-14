import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { policyDetails } from "@/data/policyContent";

const PolicyDetail = () => {
  const { policyId } = useParams<{ policyId: string }>();
  const navigate = useNavigate();
  const policy = policyId ? policyDetails[policyId] : null;

  if (!policy) {
    return (
      <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#1a1025] to-[#0d0a14]">
        <div className="sticky top-0 z-50 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700">
          <div className="flex items-center h-14 px-4 gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-lg font-bold text-white">Policy Not Found</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-500 text-sm">This policy does not exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#1a1025] to-[#0d0a14]">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 flex-shrink-0">
        <div className="flex items-center h-14 px-4 gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-white truncate">
              {policy.title}
            </h1>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {/* Hero */}
        <div className={`bg-gradient-to-r ${policy.accentColor} px-5 py-6`}>
          <h2 className="text-2xl font-extrabold text-white leading-tight">
            {policy.title}
          </h2>
          <p className="text-slate-600 text-sm mt-1.5">{policy.subtitle}</p>
        </div>

        {/* Sections */}
        <div className="px-4 py-5 space-y-5">
          {policy.sections.map((section, sIdx) => (
            <div
              key={sIdx}
              className="bg-white/[0.06] backdrop-blur-sm rounded-2xl border border-white/[0.08] overflow-hidden"
            >
              {/* Section Header */}
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2.5">
                {section.icon && (
                  <span className="text-xl">{section.icon}</span>
                )}
                <h3 className="text-white font-bold text-[15px]">
                  {section.title}
                </h3>
              </div>

              {/* Items */}
              <div className="px-4 py-3 space-y-2.5">
                {section.items.map((item, iIdx) => (
                  <div key={iIdx} className="flex items-start gap-2.5">
                    <span className="text-emerald-400 text-xs mt-1 flex-shrink-0">
                      ●
                    </span>
                    <p className="text-slate-700 text-[13px] leading-relaxed">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center pb-8 pt-2">
          <p className="text-slate-500 text-xs">
            © MeriLive — All Rights Reserved
          </p>
        </div>
      </div>
    </div>
  );
};

export default PolicyDetail;
