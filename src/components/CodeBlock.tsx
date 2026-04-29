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

const PREVIEWABLE = new Set(["html", "htm"]);

export function CodeBlock({ language, code }: Props) {
  const [copied, setCopied] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const lang = (language || "").toLowerCase().replace(/^language-/, "");
  const isPreviewable = PREVIEWABLE.has(lang) || /<html[\s>]/i.test(code) || (lang === "" && /<\/?[a-z][\s\S]*>/i.test(code) && code.includes("</"));

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
              srcDoc={code}
              sandbox="allow-scripts allow-modals allow-forms"
              className="w-full h-[400px] block bg-white"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
