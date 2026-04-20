import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LayoutDashboard size={24} />
        </div>
        <h1 className="mb-2 text-4xl font-bold text-foreground">404</h1>
        <p className="text-xl text-foreground">Page not found</p>
        <p className="mt-2 text-sm text-muted-foreground">The route you opened does not exist in this workspace.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" className="border-border" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} className="mr-2" /> Back
          </Button>
          <Button onClick={() => navigate("/app/dashboard")}>
            <LayoutDashboard size={14} className="mr-2" /> Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
