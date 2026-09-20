import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { InstanceSnapshot } from "../../../shared/contracts/instances/contracts.ts";
import WindowTitleBar from "../../components/WindowTitleBar.tsx";

export default function InstanceGate() {
  const [snapshot, setSnapshot] = useState<InstanceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isInstancePage = location.pathname.startsWith("/instances");

  useEffect(() => {
    let disposed = false;
    void window.storyOSInstances.getSnapshot()
      .then((next) => {
        if (disposed) return;
        setSnapshot(next);
        if (!next.activeInstanceId && !isInstancePage) navigate("/instances", { replace: true });
      })
      .catch((cause: unknown) => {
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { disposed = true; };
  }, [isInstancePage, navigate]);

  if (error) return <div className="grid min-h-dvh place-items-center p-8 text-danger-text">{error}</div>;
  if (!snapshot) return <main className="grid min-h-dvh place-items-center bg-background text-sm text-muted-foreground"><WindowTitleBar />正在加载实例…</main>;
  if (!snapshot.activeInstanceId && !isInstancePage) return null;
  return <Outlet context={{ snapshot, setSnapshot }} />;
}