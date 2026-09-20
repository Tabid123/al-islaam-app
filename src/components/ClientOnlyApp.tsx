"use client";
import { useEffect, useState } from "react";
import App from "@/App";
import PageErrorBoundary from "@/components/PageErrorBoundary";

export default function ClientOnlyApp() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return (
    <PageErrorBoundary onRetry={() => window.location.reload()}>
      <App />
    </PageErrorBoundary>
  );
}
