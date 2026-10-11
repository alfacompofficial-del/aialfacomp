import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Copy, Check, Play, X, Globe, Loader2, ExternalLink, WrapText,
  Sliders, RotateCcw, GitPullRequest, Database, AlertTriangle
} from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface Props {
  language: string;
  code: string;
}

const HTML_LANGS = new Set(["html", "htm", "xhtml"]);
const CSS_LANGS = new Set(["css", "scss", "sass", "less"]);
const JS_LANGS = new Set(["js", "javascript", "jsx", "ts", "typescript", "tsx"]);

function buildPreviewDoc(lang: string, code: string): string {
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

// Extract unique hex colors (#fff, #ffffff) from code
function extractHexColors(code: string): string[] {
  const matches = code.match(/#(?:[0-9a-fA-F]{3}){1,2}\b/g) || [];
  const unique = Array.from(new Set(matches.map((c) => c.toLowerCase())));
  return unique.slice(0, 5); // limit to top 5
}

// Extract animation or transition durations (e.g. 0.3s, 300ms)
function hasDurations(code: string): boolean {
  return /(?:animation|transition|duration)[^;{}]*?\d+(?:\.\d+)?(?:ms|s)\b/i.test(code) ||
    /\b\d+(?:\.\d+)?(?:ms|s)\b/.test(code);
}

export function CodeBlock({ language, code }: Props) {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [showSandbox, setShowSandbox] = useState(false);

  // Sandbox state
  const detectedColors = useMemo(() => extractHexColors(code), [code]);
  const [colorReplacements, setColorReplacements] = useState<Record<string, string>>({});
  const [animSpeedMultiplier, setAnimSpeedMultiplier] = useState(1.0); // 0.2x to 3.0x

  // Reset sandbox when code prop changes
  useEffect(() => {
    setColorReplacements({});
    setAnimSpeedMultiplier(1.0);
  }, [code]);

  // Compute modified code based on sandbox sliders & colors
  const modifiedCode = useMemo(() => {
    let result = code;
    // Apply color replacements
    for (const [orig, repl] of Object.entries(colorReplacements)) {
      if (repl && repl !== orig) {
        // Case-insensitive replace for hex colors
        const esc = orig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        result = result.replace(new RegExp(esc, "gi"), repl);
      }
    }
    // Apply duration multiplier if != 1
    if (animSpeedMultiplier !== 1.0) {
      // Scale seconds: e.g. 0.5s -> (0.5 / mult)s
      result = result.replace(/(\b\d+(?:\.\d+)?)(s|ms)\b/g, (match, valStr, unit) => {
        const val = parseFloat(valStr);
        if (isNaN(val) || val <= 0) return match;
        // speed up if multiplier > 1 (duration becomes smaller)
        const newDur = unit === "s"
          ? +(val / animSpeedMultiplier).toFixed(2)
          : Math.round(val / animSpeedMultiplier);
        return `${newDur}${unit}`;
      });
    }
    return result;
  }, [code, colorReplacements, animSpeedMultiplier]);

  const hasModifications = Object.keys(colorReplacements).length > 0 || animSpeedMultiplier !== 1.0;

  // Publish site dialog
  const [publishOpen, setPublishOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  // GitHub PR dialog
  const [ghOpen, setGhOpen] = useState(false);
  const [ghRepo, setGhRepo] = useState("");
  const [ghPath, setGhPath] = useState("");
  const [ghBranch, setGhBranch] = useState("main");
  const [ghTitle, setGhTitle] = useState("Правка от Nexus AI");
  const [ghApplying, setGhApplying] = useState(false);
  const [ghResult, setGhResult] = useState<{ url: string; number: number } | null>(null);
  const [ghError, setGhError] = useState<string | null>(null);

  // Supabase SQL apply dialog
  const [sqlOpen, setSqlOpen] = useState(false);
  const [sqlApplying, setSqlApplying] = useState(false);
  const [sqlResult, setSqlResult] = useState<string | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);

  const lang = (language || "").toLowerCase().replace(/^language-/, "");
  const isPreviewable =
    HTML_LANGS.has(lang) ||
    CSS_LANGS.has(lang) ||
    JS_LANGS.has(lang) ||
    /<!doctype html|<html[\s>]/i.test(code) ||
    (/<\/?[a-z][\s\S]*>/i.test(code) && /<\/[a-z]/i.test(code));

  const isSql = lang === "sql" || /^(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT)\b/i.test(code.trim());
  const isCodePatch = !isSql && lang !== "" && code.trim().length > 10;

  const onCopy = async () => {
    await navigator.clipboard.writeText(modifiedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Код скопирован");
  };

  const copyModifiedCode = async () => {
    await navigator.clipboard.writeText(modifiedCode);
    toast.success("Изменённый код скопирован в буфер обмена!");
  };

  const resetSandbox = () => {
    setColorReplacements({});
    setAnimSpeedMultiplier(1.0);
    toast.info("Настройки песочницы сброшены");
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
      const doc = buildPreviewDoc(lang, modifiedCode);
      const isCss = CSS_LANGS.has(lang);
      const isJs = JS_LANGS.has(lang);
      const { error } = await supabase.from("published_sites").insert({
        user_id: session.user.id,
        slug,
        title: slug,
        html: isCss || isJs ? doc : modifiedCode,
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

  const applyGitHubPR = async () => {
    if (!ghRepo.trim() || !ghPath.trim()) {
      setGhError("Укажите репозиторий (owner/repo) и путь к файлу");
      return;
    }
    setGhApplying(true);
    setGhError(null);
    try {
      const res = await supabase.functions.invoke("integrations", {
        body: {
          action: "github_pr",
          repo: ghRepo.trim(),
          path: ghPath.trim(),
          content: modifiedCode,
          title: ghTitle.trim() || "Правка от Nexus AI",
          base: ghBranch.trim() || "main",
        },
      });
      if (res.error) throw new Error(res.error.message || "Ошибка отправки в GitHub");
      const data = res.data;
      if (data?.error) throw new Error(data.error);
      if (data?.ok && data?.url) {
        setGhResult({ url: data.url, number: data.number });
        toast.success(`Pull Request #${data.number} успешно создан!`);
      } else {
        throw new Error("Не удалось создать PR");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка создания PR";
      setGhError(msg);
      toast.error(msg);
    } finally {
      setGhApplying(false);
    }
  };

  const applySupabaseSql = async () => {
    setSqlApplying(true);
    setSqlError(null);
    try {
      const res = await supabase.functions.invoke("integrations", {
        body: {
          action: "apply_sql",
          sql: modifiedCode,
        },
      });
      if (res.error) throw new Error(res.error.message || "Ошибка выполнения SQL");
      const data = res.data;
      if (data?.error) throw new Error(data.error);
      setSqlResult(data?.result || "Запрос успешно выполнен без ошибок.");
      toast.success("SQL-запрос успешно выполнен в Supabase!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка выполнения SQL";
      setSqlError(msg);
      toast.error(msg);
    } finally {
      setSqlApplying(false);
    }
  };

  return (
    <div className="my-3 rounded-xl border border-border overflow-hidden bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-secondary/60 border-b border-border gap-2">
        <span className="text-xs font-mono text-muted-foreground">
          {lang || "text"} · {modifiedCode.trim().split("\n").length} стр.
          {hasModifications && <span className="ml-2 text-primary font-semibold">(изменён)</span>}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {!previewing && code.split("\n").length > 1 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setWrap((v) => !v)}>
              <WrapText className="w-3.5 h-3.5 mr-1" />
              {wrap ? "Без переноса" : "Перенос"}
            </Button>
          )}

          {/* Test HTML/CSS/JS preview */}
          {isPreviewable && (
            <Button
              variant={previewing ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setPreviewing((v) => !v);
                if (!previewing) setShowSandbox(true);
              }}
            >
              {previewing ? <X className="w-3.5 h-3.5 mr-1" /> : <Play className="w-3.5 h-3.5 mr-1 text-primary" />}
              {previewing ? "Закрыть превью" : "Протестировать"}
            </Button>
          )}

          {/* Publish site button */}
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

          {/* Apply to GitHub PR */}
          {isCodePatch && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs hover:text-primary"
              onClick={() => { setGhOpen(true); setGhResult(null); setGhError(null); }}
              title="Создать Pull Request в GitHub репозиторий"
            >
              <GitPullRequest className="w-3.5 h-3.5 mr-1 text-emerald-400" /> В GitHub (PR)
            </Button>
          )}

          {/* Apply to Supabase SQL */}
          {isSql && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs hover:text-emerald-400"
              onClick={() => { setSqlOpen(true); setSqlResult(null); setSqlError(null); }}
              title="Применить этот SQL-запрос в вашей базе данных Supabase"
            >
              <Database className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Применить в Supabase
            </Button>
          )}

          {/* Copy button */}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onCopy}>
            {copied ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
            {copied ? "Скопировано" : "Копировать"}
          </Button>
        </div>
      </div>

      {/* Live Sandbox Controls Toolbar (when previewing) */}
      <AnimatePresence>
        {previewing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-border bg-secondary/30 text-xs"
          >
            <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px] gap-1 bg-background/50"
                  onClick={() => setShowSandbox((v) => !v)}
                >
                  <Sliders className="w-3 h-3 text-primary" />
                  {showSandbox ? "Скрыть ползунки" : "Настроить (Песочница)"}
                </Button>
                {hasModifications && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                    onClick={resetSandbox}
                  >
                    <RotateCcw className="w-3 h-3" /> Сбросить
                  </Button>
                )}
              </div>

              {hasModifications && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-6 px-2.5 text-[11px] gap-1 shadow-sm"
                  onClick={copyModifiedCode}
                >
                  <Copy className="w-3 h-3" /> Скопировать изменённый код
                </Button>
              )}
            </div>

            {/* Sandbox Sliders & Color Picker Panel */}
            {showSandbox && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-4 pb-3 pt-1 border-t border-border/40 grid grid-cols-1 md:grid-cols-2 gap-4 bg-background/40"
              >
                {/* Colors section */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground block">
                    Палитра цветов в коде:
                  </span>
                  {detectedColors.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {detectedColors.map((origColor) => {
                        const currentColor = colorReplacements[origColor] || origColor;
                        return (
                          <div
                            key={origColor}
                            className="flex items-center gap-1.5 px-2 py-1 rounded bg-secondary/70 border border-border"
                          >
                            <input
                              type="color"
                              value={currentColor.length === 4
                                ? `#${currentColor[1]}${currentColor[1]}${currentColor[2]}${currentColor[2]}${currentColor[3]}${currentColor[3]}`
                                : currentColor}
                              onChange={(e) => {
                                setColorReplacements((prev) => ({
                                  ...prev,
                                  [origColor]: e.target.value,
                                }));
                              }}
                              className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
                              title={`Заменить ${origColor}`}
                            />
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {origColor}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        defaultValue="#6366f1"
                        onChange={(e) => {
                          setColorReplacements((prev) => ({ ...prev, "#6366f1": e.target.value }));
                        }}
                        className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                      <span className="text-[11px] text-muted-foreground">Основной акцент</span>
                    </div>
                  )}
                </div>

                {/* Animation speed slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Скорость анимаций / переходов:
                    </span>
                    <span className="font-mono text-[11px] text-primary">
                      {animSpeedMultiplier}x {animSpeedMultiplier < 1 ? "(медленнее)" : animSpeedMultiplier > 1 ? "(быстрее)" : "(обычная)"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-[10px] text-muted-foreground">0.2x</span>
                    <Slider
                      value={[animSpeedMultiplier]}
                      min={0.2}
                      max={3.0}
                      step={0.1}
                      onValueChange={(val) => setAnimSpeedMultiplier(val[0])}
                      className="flex-1"
                    />
                    <span className="text-[10px] text-muted-foreground">3.0x</span>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interactive iframe preview */}
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
              srcDoc={buildPreviewDoc(lang, modifiedCode)}
              sandbox="allow-scripts allow-modals allow-forms"
              className="w-full h-[min(70vh,640px)] min-h-[360px] block bg-background"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Syntax highlighted code */}
      {!previewing && (
        <div className="overflow-x-auto">
          <SyntaxHighlighter
            language={lang || "text"}
            style={oneDark as any}
            customStyle={{
              margin: 0,
              padding: "16px",
              background: "transparent",
              fontSize: 13,
              lineHeight: 1.6,
            }}
            codeTagProps={{ style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } }}
            showLineNumbers={modifiedCode.split("\n").length > 1}
            lineNumberStyle={{ minWidth: 32, paddingRight: 12, opacity: 0.35, userSelect: "none" }}
            wrapLongLines={wrap}
          >
            {modifiedCode.replace(/\n$/, "")}
          </SyntaxHighlighter>
        </div>
      )}

      {/* Publish Dialog */}
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

      {/* GitHub Pull Request Dialog */}
      <Dialog open={ghOpen} onOpenChange={setGhOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitPullRequest className="w-5 h-5 text-primary" />
              Применить в GitHub (Pull Request)
            </DialogTitle>
            <DialogDescription>
              Создаст отдельную ветку и Pull Request с текущим файлом в вашем репозитории GitHub.
            </DialogDescription>
          </DialogHeader>

          {ghResult ? (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
                Pull Request #{ghResult.number} успешно создан!
              </div>
              <a href={ghResult.url} target="_blank" rel="noreferrer">
                <Button className="w-full gap-2">
                  <ExternalLink className="w-4 h-4" /> Открыть Pull Request на GitHub
                </Button>
              </a>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="gh-repo" className="text-xs">Репозиторий (owner/repo)</Label>
                <Input
                  id="gh-repo"
                  placeholder="octocat/hello-world"
                  value={ghRepo}
                  onChange={(e) => setGhRepo(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="gh-path" className="text-xs">Путь к файлу в репозитории</Label>
                <Input
                  id="gh-path"
                  placeholder="src/components/MyComponent.tsx"
                  value={ghPath}
                  onChange={(e) => setGhPath(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="gh-branch" className="text-xs">Базовая ветка</Label>
                  <Input
                    id="gh-branch"
                    placeholder="main"
                    value={ghBranch}
                    onChange={(e) => setGhBranch(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="gh-title" className="text-xs">Название PR</Label>
                  <Input
                    id="gh-title"
                    placeholder="Правка от Nexus"
                    value={ghTitle}
                    onChange={(e) => setGhTitle(e.target.value)}
                  />
                </div>
              </div>

              {ghError && (
                <div className="p-2.5 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs space-y-1">
                  <p>{ghError}</p>
                  {ghError.includes("токен") && (
                    <p>
                      Перейдите в{" "}
                      <Link to="/settings" className="underline font-semibold hover:text-primary">
                        Настройки
                      </Link>{" "}
                      и укажите ваш GitHub Personal Access Token.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {!ghResult && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setGhOpen(false)} disabled={ghApplying}>
                Отмена
              </Button>
              <Button onClick={applyGitHubPR} disabled={ghApplying} className="gap-2">
                {ghApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitPullRequest className="w-4 h-4" />}
                Создать PR
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Supabase SQL Apply Confirmation Dialog */}
      <Dialog open={sqlOpen} onOpenChange={setSqlOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-400" />
              Применить SQL в Supabase
            </DialogTitle>
            <DialogDescription>
              Выполнение запроса напрямую в подключенном проекте Supabase.
            </DialogDescription>
          </DialogHeader>

          {sqlResult ? (
            <div className="space-y-3 py-2">
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
                SQL успешно выполнен!
              </div>
              <div className="max-h-48 overflow-y-auto p-2.5 rounded bg-secondary/80 font-mono text-xs">
                {sqlResult}
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs leading-relaxed">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <strong>Внимание:</strong> Запрос выполнится напрямую в вашей базе данных Supabase. Убедитесь, что запрос корректен.
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">SQL запрос для выполнения:</Label>
                <div className="max-h-56 overflow-y-auto p-3 rounded-lg bg-secondary/80 border border-border font-mono text-xs text-foreground whitespace-pre-wrap">
                  {modifiedCode}
                </div>
              </div>

              {sqlError && (
                <div className="p-2.5 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs space-y-1">
                  <p>{sqlError}</p>
                  {sqlError.includes("Настройках") && (
                    <p>
                      Перейдите в{" "}
                      <Link to="/settings" className="underline font-semibold hover:text-primary">
                        Настройки
                      </Link>{" "}
                      и укажите ID проекта и Access Token Supabase.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSqlOpen(false)} disabled={sqlApplying}>
              {sqlResult ? "Закрыть" : "Отмена"}
            </Button>
            {!sqlResult && (
              <Button
                variant="default"
                onClick={applySupabaseSql}
                disabled={sqlApplying}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {sqlApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                Подтвердить и выполнить
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
