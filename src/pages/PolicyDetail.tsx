import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { policyDetails } from "@/data/policyContent";
import { useEnableBrowserPageInteraction } from "@/hooks/useEnableBrowserPageInteraction";

const PolicyDetail = () => {
  const { policyId } = useParams<{ policyId: string }>();
  const navigate = useNavigate();
  useEnableBrowserPageInteraction();


  if (policyId?.toLowerCase() === "levels") {
    return <Navigate to="/policies/levels" replace />;
  }

  const policy = policyId ? policyDetails[policyId] : null;

  if (!policy) {
    return (
      <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#FAF5EA] to-[#FFFBF2]">
        <div className="sticky top-0 z-50 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700">
          <div className="flex items-center h-14 px-4 gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 hover:bg-amber-50/70 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-800" />
            </button>
            <h1 className="text-lg font-bold text-slate-800">Policy Not Found</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-500 text-sm">This policy does not exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#FAF5EA] to-[#FFFBF2]">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 flex-shrink-0">
        <div className="flex items-center h-14 px-4 gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-amber-50/70 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-800" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-slate-800 truncate">
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
          <h2 className="text-2xl font-extrabold text-slate-800 leading-tight">
            {policy.title}
          </h2>
          <p className="text-slate-600 text-sm mt-1.5">{policy.subtitle}</p>
        </div>

        {/* Sections */}
        <div className="px-4 py-5 space-y-5">
          {policy.sections.map((section, sIdx) => (
            <div
              key={sIdx}
              className="bg-white/70 backdrop-blur-sm rounded-2xl border border-amber-200/60 overflow-hidden"
            >
              {/* Section Header */}
              <div className="px-4 py-3 border-b border-amber-200/60 flex items-center gap-2.5">
                {section.icon && (
                  <span className="text-xl">{section.icon}</span>
                )}
                <h3 className="text-slate-800 font-bold text-[15px]">
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
