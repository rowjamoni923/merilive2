import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { recordClientError } from "@/utils/clientErrorLog";

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
      if (!pageKey) {
        setLoading(false);
        return;
      }

      try {
        const { data: rows, error } = await supabase
          .from("app_content")
          .select("title, content")
          .eq("type", pageKey)
          .eq("page_key", pageKey)
          .eq("is_published", true)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1);

        if (error) throw error;
        const data = rows && rows.length > 0 ? rows[0] : null;
        setPageData(data);
      } catch (error) {
        console.error("Error fetching content:", error);
        recordClientError({ label: "ContentPage.data", message: error instanceof Error ? error.message : String(error) });
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
        const safeBold = (value: string) => value.split(/(\*\*.*?\*\*)/g).map((part, index) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={index}>{part.slice(2, -2)}</strong>;
          }
          return part;
        });

        // Headers
        if (line.startsWith("## ")) {
          return <h2 key={i} className="text-xl font-bold mt-6 mb-3">{line.slice(3)}</h2>;
        }
        if (line.startsWith("### ")) {
          return <h3 key={i} className="text-lg font-semibold mt-4 mb-2">{line.slice(4)}</h3>;
        }
        // List items
        if (line.startsWith("- ")) {
          return (
            <li key={i} className="ml-4 mb-1">{safeBold(line.slice(2))}</li>
          );
        }
        // Empty lines
        if (line.trim() === "") {
          return <br key={i} />;
        }
        // Normal paragraphs
        return <p key={i} className="mb-2">{safeBold(line)}</p>;
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
        <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
          {renderMarkdown(pageData.content)}
        </div>
      </div>
    </div>
  );
};

export default ContentPageView;
