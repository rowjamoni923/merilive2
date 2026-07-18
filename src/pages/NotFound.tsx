import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Compass, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordClientError } from "@/utils/clientErrorLog";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    recordClientError({ label: "NotFound.location", message: String(location.pathname) });
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-100">
          <Compass className="h-10 w-10" strokeWidth={1.75} />
        </div>
        <h1 className="text-6xl font-bold tracking-tight text-slate-900 mb-3">404</h1>
        <p className="text-lg text-slate-600 mb-2">Page not found</p>
        <p className="text-sm text-slate-500 mb-8 break-all">
          <code className="px-2 py-1 rounded bg-slate-100 text-slate-700">{location.pathname}</code>
        </p>
        <Button asChild size="lg" className="gap-2">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" /> Return home
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
