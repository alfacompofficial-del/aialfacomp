import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Copy, ExternalLink, Globe, Loader2, Trash2 } from "lucide-react";

type Site = { id: string; slug: string; title: string; created_at: string };

export default function MySites() {
  const navigate = useNavigate();
  const [sites, setSites] = useState<Site[] | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return navigate("/auth", { replace: true });
      supabase
        .from("published_sites")
        .select("id,slug,title,created_at")
        .order("created_at", { ascending: false })
        .then(({ data: rows, error }) => {
          if (error) toast.error(error.message);
          setSites(rows || []);
        });
    });
  }, [navigate]);

  const remove = async (id: string) => {
    const { error } = await supabase.from("published_sites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setSites((s) => (s || []).filter((x) => x.id !== id));
    toast.success("Сайт удалён");
  };

  const copy = async (slug: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/site/${slug}`);
    toast.success("Ссылка скопирована");
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="h-14 border-b border-border flex items-center gap-3 px-4">
        <Link to="/">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Назад
          </Button>
        </Link>
        <h1 className="font-semibold">Мои сайты</h1>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {sites === null ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : sites.length === 0 ? (
          <div className="text-center py-16">
            <Globe className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              Пока нет опубликованных проектов. Попросите Nexus сделать сайт и нажмите
              «Создать ссылку» над блоком кода.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{sites.length} из 10 сайтов</p>
            {sites.map((s) => (
              <Card key={s.id} className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                     style={{ background: "var(--gradient-primary)" }}>
                  <Globe className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.title}</div>
                  <div className="text-xs text-muted-foreground truncate">/site/{s.slug}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => copy(s.slug)} aria-label="Копировать ссылку">
                  <Copy className="w-4 h-4" />
                </Button>
                <a href={`/site/${s.slug}`} target="_blank" rel="noreferrer">
                  <Button variant="ghost" size="sm" aria-label="Открыть"><ExternalLink className="w-4 h-4" /></Button>
                </a>
                <Button variant="ghost" size="sm" onClick={() => remove(s.id)} aria-label="Удалить"
                        className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
