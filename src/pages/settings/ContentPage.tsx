import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

interface ContentPage {
  title: string;
  content: string;
}

// Map routes to page keys
const routeToPageKey: Record<string, string> = {
  "/settings/privacy-policy": "privacy_policy",
  "/settings/user-agreement": "user_agreement",
  "/settings/about-us": "about_us",
  "/settings/customer-service": "customer_service",
};

const ContentPageView = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const pageKey = routeToPageKey[location.pathname];
  const [pageData, setPageData] = useState<ContentPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchContent = async () => {
      if (!pageKey) return;

      try {
        const { data, error } = await supabase
          .from("app_content")
          .select("title, content")
          .eq("page_key", pageKey)
          .eq("is_active", true)
          .maybeSingle();

        if (error) throw error;
        setPageData(data);
      } catch (error) {
        console.error("Error fetching content:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [pageKey]);

  // Simple markdown renderer
  const renderMarkdown = (text: string) => {
    return text
      .split("\n")
      .map((line, i) => {
        // Headers
        if (line.startsWith("## ")) {
          return <h2 key={i} className="text-xl font-bold mt-6 mb-3">{line.slice(3)}</h2>;
        }
        if (line.startsWith("### ")) {
          return <h3 key={i} className="text-lg font-semibold mt-4 mb-2">{line.slice(4)}</h3>;
        }
        // Bold text - safely escape HTML first, then apply bold
        const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const boldedLine = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // List items
        if (line.startsWith("- ")) {
          return (
            <li key={i} className="ml-4 mb-1" dangerouslySetInnerHTML={{ __html: boldedLine.slice(2) }} />
          );
        }
        // Empty lines
        if (line.trim() === "") {
          return <br key={i} />;
        }
        // Normal paragraphs
        return <p key={i} className="mb-2" dangerouslySetInnerHTML={{ __html: boldedLine }} />;
      });
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!pageData) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background border-b">
          <div className="flex items-center h-14 px-4">
            <button 
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 hover:bg-muted rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="flex-1 text-center text-lg font-semibold pr-7">Not Found</h1>
          </div>
        </div>
        <div className="p-4 text-center text-muted-foreground">
          Content not found
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center h-14 px-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-muted rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-7">{pageData.title}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="prose prose-sm max-w-none">
          {renderMarkdown(pageData.content)}
        </div>
      </div>
    </div>
  );
};

export default ContentPageView;
