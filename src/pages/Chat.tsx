import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/components/Markdown";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Send, Plus, Trash2, LogOut, Paperclip, X, Loader2,
  MessageSquare, Image as ImageIcon, FileText, Wrench, Download, Code2, Wand2,
} from "lucide-react";
import { Link } from "react-router-dom";

type Conversation = { id: string; title: string; updated_at: string };
type Attachment = { name: string; type: string; url: string; data_url?: string };
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  pending?: boolean;
};

export default function Chat() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [toolsUsed, setToolsUsed] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const getInputValue = () => textareaRef.current?.value ?? "";
  const setInputValue = (v: string) => {
    if (textareaRef.current) {
      textareaRef.current.value = v;
      autosize();
    }
  };
  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  // Auth guard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate("/auth", { replace: true });
      else setUserId(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate("/auth", { replace: true });
      else setUserId(session.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  // Load conversations
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("conversations")
      .select("id,title,updated_at")
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) return toast.error(error.message);
        setConvos(data || []);
        if (data && data.length > 0 && !activeId) setActiveId(data[0].id);
      });
  }, [userId]);

  // Load messages of active conversation
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    supabase
      .from("messages")
      .select("id,role,content,attachments")
      .eq("conversation_id", activeId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) return toast.error(error.message);
        setMessages((data || []).map((m: any) => ({
          id: m.id, role: m.role, content: m.content,
          attachments: Array.isArray(m.attachments) ? m.attachments : [],
        })));
      });
  }, [activeId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const newChat = async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: userId, title: "Новый чат" })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setConvos((c) => [data as any, ...c]);
    setActiveId(data!.id);
    setMessages([]);
  };

  const deleteChat = async (id: string) => {
    await supabase.from("conversations").delete().eq("id", id);
    setConvos((c) => c.filter((x) => x.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, 5);
    setPendingFiles((p) => [...p, ...arr].slice(0, 5));
  };

  const removeFile = (i: number) => setPendingFiles((p) => p.filter((_, idx) => idx !== i));

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const uploadFile = async (file: File): Promise<Attachment> => {
    const path = `${userId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("attachments").upload(path, file);
    if (error) throw error;
    const { data: signed } = await supabase.storage.from("attachments").createSignedUrl(path, 60 * 60 * 24 * 7);
    const att: Attachment = { name: file.name, type: file.type, url: signed?.signedUrl || "" };
    if (file.type.startsWith("image/")) {
      att.data_url = await fileToDataUrl(file);
    }
    return att;
  };

  const send = async () => {
    const currentInput = getInputValue();
    if (!currentInput.trim() && pendingFiles.length === 0) return;
    if (!userId) return;
    let convoId = activeId;
    if (!convoId) {
      const { data, error } = await supabase
        .from("conversations")
        .insert({ user_id: userId, title: currentInput.slice(0, 50) || "Новый чат" })
        .select().single();
      if (error) return toast.error(error.message);
      convoId = data!.id;
      setActiveId(convoId);
      setConvos((c) => [data as any, ...c]);
    }

    setStreaming(true);
    setToolsUsed(0);
    const text = currentInput;
    const files = pendingFiles;
    setInputValue("");
    setPendingFiles([]);

    let attachments: Attachment[] = [];
    try {
      attachments = await Promise.all(files.map(uploadFile));
    } catch (e: any) {
      toast.error("Ошибка загрузки файла: " + e.message);
      setStreaming(false);
      return;
    }

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text, attachments };
    setMessages((m) => [...m, userMsg, { id: "pending", role: "assistant", content: "", pending: true }]);

    // Save user message
    await supabase.from("messages").insert({
      conversation_id: convoId, user_id: userId, role: "user", content: text,
      attachments: attachments as any,
    });

    // If first user message — auto title
    if (messages.length === 0 && text) {
      const title = text.slice(0, 50);
      await supabase.from("conversations").update({ title }).eq("id", convoId);
      setConvos((c) => c.map((x) => x.id === convoId ? { ...x, title } : x));
    }

    // Build payload — multimodal
    const apiMessages = [...messages, userMsg].map((m) => {
      if (m.role !== "user" || !m.attachments?.length) {
        return { role: m.role, content: m.content };
      }
      const parts: any[] = [{ type: "text", text: m.content || "" }];
      for (const a of m.attachments) {
        if (a.type.startsWith("image/") && a.data_url) {
          parts.push({ type: "image_url", image_url: { url: a.data_url } });
        } else {
          parts[0].text += `\n\n[Прикреплён файл: ${a.name} (${a.type})]`;
        }
      }
      return { role: m.role, content: parts };
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!resp.ok) {
        if (resp.status === 429) toast.error("Слишком много запросов. Подождите немного.");
        else if (resp.status === 402) toast.error("Закончились AI-кредиты. Пополните в настройках.");
        else toast.error("Ошибка: " + resp.status);
        setMessages((m) => m.filter((x) => x.id !== "pending"));
        setStreaming(false);
        return;
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accum = "";
      let done = false;

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buffer += decoder.decode(value, { stream: true });

        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") { done = true; break; }
          try {
            const p = JSON.parse(payload);
            if (p.meta?.tools_used) setToolsUsed(p.meta.tools_used);
            const delta = p.choices?.[0]?.delta?.content;
            if (delta) {
              accum += delta;
              setMessages((m) =>
                m.map((x) => x.id === "pending" ? { ...x, content: accum } : x)
              );
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Save assistant message
      const { data: saved } = await supabase.from("messages").insert({
        conversation_id: convoId, user_id: userId, role: "assistant", content: accum,
      }).select().single();

      setMessages((m) =>
        m.map((x) => x.id === "pending"
          ? { ...x, id: saved?.id || crypto.randomUUID(), pending: false, content: accum }
          : x)
      );

      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convoId);
    } catch (e: any) {
      toast.error("Ошибка соединения: " + e.message);
      setMessages((m) => m.filter((x) => x.id !== "pending"));
    } finally {
      setStreaming(false);
    }
  };

  const generateImage = async () => {
    const prompt = getInputValue().replace(/^\/(image|img|gen)\s*/i, "").trim();
    if (!prompt) {
      toast.error("Опишите, что нарисовать");
      return;
    }
    if (!userId) return;

    let convoId = activeId;
    if (!convoId) {
      const { data, error } = await supabase
        .from("conversations")
        .insert({ user_id: userId, title: "🎨 " + prompt.slice(0, 40) })
        .select().single();
      if (error) return toast.error(error.message);
      convoId = data!.id;
      setActiveId(convoId);
      setConvos((c) => [data as any, ...c]);
    }

    setStreaming(true);
    setInputValue("");

    const userMsg: Message = {
      id: crypto.randomUUID(), role: "user",
      content: `🎨 Генерация: ${prompt}`, attachments: [],
    };
    setMessages((m) => [...m, userMsg, { id: "pending", role: "assistant", content: "Генерирую изображение...", pending: true }]);

    await supabase.from("messages").insert({
      conversation_id: convoId, user_id: userId, role: "user",
      content: userMsg.content, attachments: [],
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        const errMsg = data.error || `Ошибка ${resp.status}`;
        toast.error(errMsg);
        setMessages((m) => m.filter((x) => x.id !== "pending"));
        setStreaming(false);
        return;
      }

      const imageUrl = data.image_url as string;
      const remaining = data.remaining ?? "?";
      const content = `Готово! Осталось генераций сегодня: **${remaining}/${data.limit ?? 2}**`;

      const attachments: Attachment[] = [{
        name: `nexus-${Date.now()}.png`,
        type: "image/png",
        url: imageUrl,
        data_url: imageUrl,
      }];

      const { data: saved } = await supabase.from("messages").insert({
        conversation_id: convoId, user_id: userId, role: "assistant",
        content, attachments: attachments as any,
      }).select().single();

      setMessages((m) =>
        m.map((x) => x.id === "pending"
          ? { id: saved?.id || crypto.randomUUID(), role: "assistant", content, attachments, pending: false }
          : x)
      );

      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convoId);
      toast.success(`Изображение готово! Осталось: ${remaining}`);
    } catch (e: any) {
      toast.error("Ошибка: " + e.message);
      setMessages((m) => m.filter((x) => x.id !== "pending"));
    } finally {
      setStreaming(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const v = getInputValue().trim();
      if (/^\/(image|img|gen)\b/i.test(v)) generateImage();
      else send();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f && f.type.startsWith("image/")) {
          const ext = f.type.split("/")[1] || "png";
          const named = new File(
            [f],
            f.name && f.name !== "image.png"
              ? f.name
              : `pasted-${Date.now()}.${ext}`,
            { type: f.type }
          );
          files.push(named);
        }
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      setPendingFiles((p) => [...p, ...files].slice(0, 5));
      toast.success(`Вставлено изображений: ${files.length}`);
    }
  };

  const closeSidebarOnMobile = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setSidebarOpen(false);
  };

  return (
    <div className="h-[100dvh] flex bg-background overflow-hidden">
      {/* Mobile backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }}
            transition={{ type: "spring", damping: 25 }}
            className="fixed md:static inset-y-0 left-0 z-40 w-[85vw] max-w-[300px] md:w-72 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col"
          >
            <div className="p-4 flex items-center gap-2 border-b border-sidebar-border">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                   style={{ background: "var(--gradient-primary)" }}>
                <Sparkles className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold gradient-text text-lg flex-1">Nexus</span>
              <Button
                variant="ghost" size="sm" className="md:hidden"
                onClick={() => setSidebarOpen(false)}
                aria-label="Закрыть меню"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-3">
              <Button onClick={() => { newChat(); closeSidebarOnMobile(); }} className="w-full gap-2">
                <Plus className="w-4 h-4" /> Новый чат
              </Button>
            </div>

            <ScrollArea className="flex-1 px-2">
              <div className="space-y-1 pb-2">
                {convos.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6 px-3">
                    Здесь появится история ваших чатов
                  </p>
                )}
                {convos.map((c) => (
                  <div
                    key={c.id}
                    className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      activeId === c.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"
                    }`}
                    onClick={() => { setActiveId(c.id); closeSidebarOnMobile(); }}
                  >
                    <MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm truncate flex-1">{c.title}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteChat(c.id); }}
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1"
                      aria-label="Удалить чат"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-3 border-t border-sidebar-border space-y-1">
              <Link to="/download">
                <Button variant="ghost" className="w-full justify-start gap-2" size="sm">
                  <Download className="w-4 h-4" /> Скачать приложение
                </Button>
              </Link>
              <Link to="/developers">
                <Button variant="ghost" className="w-full justify-start gap-2" size="sm">
                  <Code2 className="w-4 h-4" /> API для разработчиков
                </Button>
              </Link>
              <Button variant="ghost" className="w-full justify-start gap-2" size="sm" onClick={signOut}>
                <LogOut className="w-4 h-4" /> Выйти
              </Button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-4 glass">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle sidebar"
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
          <h1 className="text-sm font-medium text-muted-foreground">
            {convos.find((c) => c.id === activeId)?.title || "Nexus AI Agent"}
          </h1>
          <div className="w-9" />
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState onPick={(p) => { setInputValue(p); textareaRef.current?.focus(); }} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} toolsUsed={m.pending ? toolsUsed : 0} />
              ))}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-border bg-background/80 backdrop-blur-xl">
          <div className="max-w-3xl mx-auto px-4 py-3">
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-secondary text-xs">
                    {f.type.startsWith("image/") ? <ImageIcon className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                    <span className="max-w-[150px] truncate">{f.name}</span>
                    <button onClick={() => removeFile(i)} aria-label="Убрать">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative glass rounded-2xl p-2 flex items-end gap-2">
              <input
                ref={fileRef} type="file" multiple hidden
                accept="image/*,.pdf,.txt,.md,.json,.csv,.html,.css,.js,.ts,.tsx,.py"
                onChange={(e) => onPickFiles(e.target.files)}
              />
              <Button
                variant="ghost" size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={streaming}
                aria-label="Прикрепить файл"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost" size="sm"
                onClick={generateImage}
                disabled={streaming}
                aria-label="Сгенерировать изображение"
                title="Сгенерировать изображение (2/день бесплатно)"
              >
                <Wand2 className="w-4 h-4" />
              </Button>

              <Textarea
                ref={textareaRef}
                defaultValue=""
                onInput={autosize}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                placeholder="Сообщение или /image <описание> для генерации картинки (2/день)"
                rows={1}
                disabled={streaming}
                className="flex-1 min-h-[40px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 px-2"
              />

              <Button
                size="sm" onClick={send}
                disabled={streaming}
                className="rounded-xl"
                style={{ background: "var(--gradient-primary)" }}
              >
                {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              Nexus может ошибаться. Проверяйте важную информацию.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function MessageBubble({ message, toolsUsed }: { message: Message; toolsUsed: number }) {
  const isUser = message.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
    >
      <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${
        isUser ? "bg-secondary" : ""
      }`}
        style={!isUser ? { background: "var(--gradient-primary)" } : undefined}
      >
        {isUser ? <span className="text-xs font-medium">Вы</span> : <Sparkles className="w-4 h-4 text-primary-foreground" />}
      </div>
      <div className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}>
        {message.attachments && message.attachments.length > 0 && (
          <div className={`flex flex-wrap gap-2 mb-2 ${isUser ? "justify-end" : ""}`}>
            {message.attachments.map((a, i) => (
              a.type.startsWith("image/") ? (
                <img key={i} src={a.url || a.data_url} alt={a.name} className="max-h-48 rounded-lg border border-border" />
              ) : (
                <a key={i} href={a.url} target="_blank" rel="noreferrer"
                   className="flex items-center gap-2 px-2 py-1 rounded-lg bg-secondary text-xs">
                  <FileText className="w-3.5 h-3.5" />{a.name}
                </a>
              )
            ))}
          </div>
        )}
        {isUser ? (
          <div className="inline-block max-w-full px-4 py-2 rounded-2xl bg-secondary text-left">
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          </div>
        ) : (
          <div>
            {message.pending && message.content === "" && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                {toolsUsed > 0 ? (
                  <><Wrench className="w-3.5 h-3.5 animate-pulse" /> Использую инструменты ({toolsUsed})...</>
                ) : (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Думаю...</>
                )}
              </div>
            )}
            {message.content && <Markdown content={message.content} />}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function EmptyState({ onPick }: { onPick: (p: string) => void }) {
  const prompts = [
    "Напиши лендинг-страницу с анимированным героем на HTML и CSS",
    "Что нового в мире ИИ за последнюю неделю?",
    "Объясни Row Level Security в Postgres простыми словами",
    "Найди топ React-библиотек для drag-and-drop",
  ];
  return (
    <div className="h-full flex flex-col items-center justify-center px-4">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
           style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}>
        <Sparkles className="w-8 h-8 text-primary-foreground" />
      </div>
      <h2 className="text-3xl font-bold gradient-text mb-2">Привет, я Nexus</h2>
      <p className="text-muted-foreground text-center max-w-md mb-8">
        Ваш ИИ-агент с веб-поиском, GitHub, Wikipedia и анализом файлов. Спросите что угодно.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
        {prompts.map((p, i) => (
          <button
            key={i}
            onClick={() => onPick(p)}
            className="text-left p-3 rounded-xl glass hover:border-primary/50 transition-colors text-sm"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
