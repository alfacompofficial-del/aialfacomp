import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Check, Play, X, Globe, Loader2, ExternalLink } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  language: string;
  code: string;
}


const HTML_LANGS = new Set(["html", "htm", "xhtml"]);
const CSS_LANGS = new Set(["css", "scss", "sass", "less"]);
const JS_LANGS = new Set(["js", "javascript", "jsx", "ts", "typescript", "tsx"]);

function buildPreviewDoc(lang: string, code: string): string {
  // Already a full HTML doc
  if (/<!doctype html|<html[\s>]/i.test(code)) return code;

  if (HTML_LANGS.has(lang) || /<\/?[a-z][\s\S]*>/i.test(code)) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,sans-serif;margin:16px;color:#111}</style></head><body>${code}</body></html>`;
  }
  if (CSS_LANGS.has(lang)) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${code}</style></head><body><h1>Заголовок</h1><p>Пример текста для превью CSS.</p><button>Кнопка</button></body></html>`;
  }
  if (JS_LANGS.has(lang)) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;margin:16px;color:#111}#out{white-space:pre-wrap;background:#f5f5f5;padding:8px;border-radius:6px;margin-top:8px}</style></head><body><div id="app"></div><div id="out"></div><script>(function(){const o=document.getElementById('out');const orig=console.log;console.log=function(...a){orig.apply(console,a);o.textContent+=a.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' ')+'\\n';};window.addEventListener('error',e=>{o.textContent+='Error: '+e.message+'\\n'});})();<\/script><script>${code}<\/script></body></html>`;
  }
  return code;
}

export function CodeBlock({ language, code }: Props) {
  const [copied, setCopied] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);


  const lang = (language || "").toLowerCase().replace(/^language-/, "");
  const isPreviewable =
    HTML_LANGS.has(lang) ||
    CSS_LANGS.has(lang) ||
    JS_LANGS.has(lang) ||
    /<!doctype html|<html[\s>]/i.test(code) ||
    (/<\/?[a-z][\s\S]*>/i.test(code) && /<\/[a-z]/i.test(code));

  const onCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const slugValid = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/.test(slug);

  const publish = async () => {
    if (!slugValid) {
      setSlugError("Имя: 3–40 символов, только латиница, цифры и дефис");
      return;
    }
    setPublishing(true);
    setSlugError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSlugError("Нужно войти в аккаунт");
        return;
      }
      const { data: existing } = await supabase
        .from("published_sites").select("id").eq("slug", slug).maybeSingle();
      if (existing) {
        setSlugError("Это имя уже занято — выберите другое");
        return;
      }
      const doc = buildPreviewDoc(lang, code);
      const isCss = CSS_LANGS.has(lang);
      const isJs = JS_LANGS.has(lang);
      const { error } = await supabase.from("published_sites").insert({
        user_id: session.user.id,
        slug,
        title: slug,
        html: isCss || isJs ? doc : code,
        css: "",
        js: "",
      });
      if (error) {
        setSlugError(error.message.includes("лимит") ? error.message : "Не удалось опубликовать: " + error.message);
        return;
      }
      const url = `${window.location.origin}/site/${slug}`;
      setPublishedUrl(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Сайт опубликован, ссылка скопирована");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="my-3 rounded-xl border border-border overflow-hidden bg-card">
      <div className="flex items-center justify-between px-4 py-2 bg-secondary/60 border-b border-border">
        <span className="text-xs font-mono text-muted-foreground">{lang || "text"}</span>
        <div className="flex items-center gap-1">
          {isPreviewable && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setPreviewing((v) => !v)}
            >
              {previewing ? <X className="w-3.5 h-3.5 mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
              {previewing ? "Закрыть" : "Протестировать"}
            </Button>
          )}
          {isPreviewable && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => { setPublishOpen(true); setPublishedUrl(null); setSlugError(null); }}
            >
              <Globe className="w-3.5 h-3.5 mr-1" /> Создать ссылку
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onCopy}>
            {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
            {copied ? "Скопировано" : "Копировать"}
          </Button>
        </div>
      </div>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Опубликовать проект</DialogTitle>
            <DialogDescription>
              Придумайте имя — проект станет доступен по ссылке /site/имя.
            </DialogDescription>
          </DialogHeader>

          {publishedUrl ? (
            <div className="space-y-3">
              <p className="text-sm">Готово! Ваш проект доступен по ссылке:</p>
              <div className="p-3 rounded-lg bg-secondary text-sm break-all font-mono">{publishedUrl}</div>
              <a href={publishedUrl} target="_blank" rel="noreferrer">
                <Button className="gap-2 w-full">
                  <ExternalLink className="w-4 h-4" /> Открыть сайт
                </Button>
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              <Label htmlFor="slug">Имя проекта</Label>
              <Input
                id="slug"
                value={slug}
                autoFocus
                placeholder="my-landing"
                onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")); setSlugError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") publish(); }}
              />
              <p className="text-xs text-muted-foreground">
                Ссылка: {window.location.origin}/site/{slug || "имя"}
              </p>
              {slugError && <p className="text-xs text-destructive">{slugError}</p>}
            </div>
          )}

          {!publishedUrl && (
            <DialogFooter>
              <Button onClick={publish} disabled={publishing} className="gap-2">
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                Создать ссылку
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>


      <AnimatePresence>
        {previewing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-background"
          >
            <iframe
              title="HTML preview"
              srcDoc={buildPreviewDoc(lang, code)}
              sandbox="allow-scripts allow-modals allow-forms"
              className="w-full h-[min(70vh,640px)] min-h-[360px] block bg-background"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {!previewing && (
        <SyntaxHighlighter
          language={lang || "text"}
          style={oneDark as any}
          customStyle={{ margin: 0, padding: "16px", background: "transparent", fontSize: 13 }}
          wrapLongLines
        >
          {code.replace(/\n$/, "")}
        </SyntaxHighlighter>
      )}
    </div>
  );
}
