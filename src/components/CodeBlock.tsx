import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Play, X } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion, AnimatePresence } from "framer-motion";

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

  return (
    <div className="my-3 rounded-xl border border-border overflow-hidden bg-[#0d1117]">
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
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onCopy}>
            {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
            {copied ? "Скопировано" : "Копировать"}
          </Button>
        </div>
      </div>
      <SyntaxHighlighter
        language={lang || "text"}
        style={oneDark as any}
        customStyle={{ margin: 0, padding: "16px", background: "transparent", fontSize: 13 }}
        wrapLongLines
      >
        {code.replace(/\n$/, "")}
      </SyntaxHighlighter>

      <AnimatePresence>
        {previewing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border bg-white"
          >
            <iframe
              title="HTML preview"
              srcDoc={buildPreviewDoc(lang, code)}
              sandbox="allow-scripts allow-modals allow-forms"
              className="w-full h-[400px] block bg-white"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
