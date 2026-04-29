import { Navigate } from "react-router-dom";
import Chat from "./Chat";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
      setChecking(false);
    });
  }, []);
  if (checking) return <div className="h-screen flex items-center justify-center text-muted-foreground">Загрузка...</div>;
  if (!authed) return <Navigate to="/auth" replace />;
  return <Chat />;
};

export default Index;
