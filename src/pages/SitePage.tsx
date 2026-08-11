import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

function composeDoc(html: string, css: string, js: string): string {
  const hasDoc = /<!doctype html|<html[\s>]/i.test(html);
  if (hasDoc && !css && !js) return html;
  if (hasDoc) {
    return html
      .replace(/<\/head>/i, `<style>${css}</style></head>`)
      .replace(/<\/body>/i, `<script>${js}<\/script></body>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${html}<script>${js}<\/script></body></html>`;
}

export default function SitePage() {
  const { slug } = useParams<{ slug: string }>();
  const [doc, setDoc] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    supabase
      .from("published_sites")
      .select("title,html,css,js")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return setNotFound(true);
        setTitle(data.title);
        document.title = data.title;
        setDoc(composeDoc(data.html || "", data.css || "", data.js || ""));
      });
  }, [slug]);

  if (notFound) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
          <Sparkles className="w-7 h-7 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold">Проект не найден</h1>
        <p className="text-muted-foreground">Сайта с адресом /site/{slug} не существует.</p>
        <Link to="/"><Button>На главную</Button></Link>
      </div>
    );
  }

  if (doc === null) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <iframe
      title={title || "Проект"}
      srcDoc={doc}
      sandbox="allow-scripts allow-modals allow-forms allow-popups"
      className="w-full h-[100dvh] border-0 block bg-white"
    />
  );
}
