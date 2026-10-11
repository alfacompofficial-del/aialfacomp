import { useEffect, useRef, useState, useCallback } from "react";
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
  MessageSquare, Image as ImageIcon, FileText, Wrench, Download, Code2, Wand2, Brain,
  Settings as SettingsIcon, Globe, Pencil, Check, ChevronLeft, ChevronRight,
  Mic, MicOff, Volume2, Copy, AlertCircle, Wrench as WrenchIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

type Conversation = { id: string; title: string; updated_at: string };
type Attachment = { name: string; type: string; url: string; data_url?: string; size?: number };

/** One branch/version of a pair (user + assistant) */
type MsgVersion = {
  userContent: string;
  userAttachments: Attachment[];
  assistantContent: string;
  assistantAttachments: Attachment[];
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  pending?: boolean;
  /** For user messages: all versions, current index */
  versions?: MsgVersion[];
  versionIndex?: number;
};

// ─────────────────────────────────────────────────────────────
// Context compression: summarise old messages when >30
// ─────────────────────────────────────────────────────────────
async function compressHistory(messages: Message[], token: string, supabaseUrl: string): Promise<Message[]> {
  if (messages.length <= 30) return messages;
  const toSummarise = messages.slice(0, messages.length - 20);
  const recent = messages.slice(messages.length - 20);
  const textForSummary = toSummarise.map(m => `${m.role === "user" ? "Пользователь" : "Nexus"}: ${m.content.slice(0, 800)}`).join("\n\n");
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messages: [
          { role: "user", content: `Создай краткий конспект этого диалога (2-3 абзаца, только суть, без приветствий):\n\n${textForSummary}` }
        ],
        model: "google/gemini-3-flash-preview",
      }),
    });
    if (!resp.ok) return messages;
    const reader = resp.body!.getReader();
    const dec = new TextDecoder();
    let buf = "", summary = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") break;
        try { const p = JSON.parse(payload); if (p.choices?.[0]?.delta?.content) summary += p.choices[0].delta.content; } catch {}
      }
    }
    if (!summary) return messages;
    const summaryMsg: Message = {
      id: "summary-" + Date.now(),
      role: "assistant",
      content: `📋 **Краткий конспект предыдущего диалога:**\n\n${summary}`,
    };
    return [summaryMsg, ...recent];
  } catch { return messages; }
}

// ─────────────────────────────────────────────────────────────
// GitHub repo cache key
// ─────────────────────────────────────────────────────────────
function extractRepoKey(text: string): string | null {
  const m = text.match(/github\.com\/([^/\s]+\/[^/\s#?]+)/i);
  return m ? m[1].toLowerCase() : null;
}

export default function Chat() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [toolsUsed, setToolsUsed] = useState<string[]>([]);
  const [thinkMode, setThinkMode] = useState(false);
  const [thinkingText, setThinkingText] = useState("");
  const [thinkTimer, setThinkTimer] = useState(0); // seconds elapsed
  const [thinkMaxMin, setThinkMaxMin] = useState(10); // from settings
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [ttsLoading, setTtsLoading] = useState<string | null>(null); // message id
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const thinkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getInputValue = () => textareaRef.current?.value ?? "";
  const setInputValue = (v: string) => {
    if (textareaRef.current) { textareaRef.current.value = v; autosize(); }
  };
  const autosize = () => {
    const el = textareaRef.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  // Auth guard + settings
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate("/auth", { replace: true }); return; }
      const uid = data.session.user.id;
      setUserId(uid);
      // Load think_minutes from settings
      const { data: s } = await supabase.from("user_settings").select("think_minutes").eq("user_id", uid).maybeSingle();
      if (s?.think_minutes) setThinkMaxMin(s.think_minutes);
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
    supabase.from("conversations").select("id,title,updated_at")
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) return toast.error(error.message);
        setConvos(data || []);
        if (data && data.length > 0 && !activeId) setActiveId(data[0].id);
      });
  }, [userId]);

  // Load messages with versions
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    supabase.from("messages").select("id,role,content,attachments,versions")
      .eq("conversation_id", activeId).order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) return toast.error(error.message);
        setMessages((data || []).map((m: any) => ({
          id: m.id, role: m.role, content: m.content,
          attachments: Array.isArray(m.attachments) ? m.attachments : [],
          versions: Array.isArray(m.versions) ? m.versions : undefined,
          versionIndex: Array.isArray(m.versions) && m.versions.length > 0 ? m.versions.length - 1 : 0,
        })));
      });
  }, [activeId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  // Think timer
  useEffect(() => {
    if (thinkMode && streaming) {
      setThinkTimer(0);
      thinkIntervalRef.current = setInterval(() => setThinkTimer(t => t + 1), 1000);
    } else {
      if (thinkIntervalRef.current) { clearInterval(thinkIntervalRef.current); thinkIntervalRef.current = null; }
      setThinkTimer(0);
    }
    return () => { if (thinkIntervalRef.current) clearInterval(thinkIntervalRef.current); };
  }, [thinkMode, streaming]);

  const newChat = async () => {
    if (!userId) return;
    const { data, error } = await supabase.from("conversations")
      .insert({ user_id: userId, title: "Новый чат" }).select().single();
    if (error) return toast.error(error.message);
    setConvos(c => [data as any, ...c]);
    setActiveId(data!.id); setMessages([]);
  };

  const deleteChat = async (id: string) => {
    await supabase.from("conversations").delete().eq("id", id);
    setConvos(c => c.filter(x => x.id !== id));
    if (activeId === id) { setActiveId(null); setMessages([]); }
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    setPendingFiles(p => [...p, ...Array.from(files)].slice(0, 5));
  };
  const removeFile = (i: number) => setPendingFiles(p => p.filter((_, idx) => idx !== i));
  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = reject; r.readAsDataURL(file); });

  const uploadFile = async (file: File): Promise<Attachment> => {
    const path = `${userId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("attachments").upload(path, file);
    if (error) throw error;
    const { data: signed } = await supabase.storage.from("attachments").createSignedUrl(path, 60 * 60 * 24 * 7);
    const att: Attachment = { name: file.name, type: file.type, url: signed?.signedUrl || "" };
    if (file.type.startsWith("image/")) att.data_url = await fileToDataUrl(file);
    return att;
  };

  // ─────────────────────────────────────────────────────────────
  // Core send
  // ─────────────────────────────────────────────────────────────
  const runSend = useCallback(async (text: string, files: File[], useThink: boolean, convoId: string, editMsgId?: string) => {
    if (!userId) return;
    setStreaming(true); setToolsUsed([]); setThinkingText("");

    let attachments: Attachment[] = [];
    try { attachments = await Promise.all(files.map(uploadFile)); }
    catch (e: any) { toast.error("Ошибка загрузки файла: " + e.message); setStreaming(false); return; }

    const userMsg: Message = { id: editMsgId || crypto.randomUUID(), role: "user", content: text, attachments };
    setMessages(m => {
      const filtered = editMsgId ? m.filter(x => {
        // remove this msg and everything after it
        const idx = m.findIndex(x2 => x2.id === editMsgId);
        return m.indexOf(x) < idx;
      }) : m;
      return [...filtered, userMsg, { id: "pending", role: "assistant", content: "", pending: true }];
    });

    // Save/update user message in DB
    if (editMsgId) {
      await supabase.from("messages").update({ content: text, attachments: attachments as any }).eq("id", editMsgId);
      // delete assistant messages after this one (DB)
      const { data: laterMsgs } = await supabase.from("messages")
        .select("id,created_at").eq("conversation_id", convoId).order("created_at", { ascending: true });
      if (laterMsgs) {
        const editIdx = laterMsgs.findIndex(m => m.id === editMsgId);
        const toDelete = laterMsgs.slice(editIdx + 1).map(m => m.id);
        if (toDelete.length) await supabase.from("messages").delete().in("id", toDelete);
      }
    } else {
      await supabase.from("messages").insert({
        conversation_id: convoId, user_id: userId, role: "user", content: text, attachments: attachments as any,
      });
      if (messages.length === 0 && text) {
        const title = text.slice(0, 50);
        await supabase.from("conversations").update({ title }).eq("id", convoId);
        setConvos(c => c.map(x => x.id === convoId ? { ...x, title } : x));
      }
    }

    // Build payload
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    // Load full history for context
    const { data: dbMsgs } = await supabase.from("messages")
      .select("role,content,attachments").eq("conversation_id", convoId).order("created_at", { ascending: true });

    let historyMsgs: Message[] = (dbMsgs || []).map((m: any) => ({
      id: crypto.randomUUID(), role: m.role, content: m.content,
      attachments: Array.isArray(m.attachments) ? m.attachments : [],
    }));
    // Add current userMsg if not in DB yet (new send)
    if (!historyMsgs.find(m => m.content === text && m.role === "user")) {
      historyMsgs = [...historyMsgs, userMsg];
    }

    // Compress if history is long
    historyMsgs = await compressHistory(historyMsgs, token, supabaseUrl);

    const apiMessages = historyMsgs.map(m => {
      if (m.role !== "user" || !m.attachments?.length) return { role: m.role, content: m.content };
      const parts: any[] = [{ type: "text", text: m.content || "" }];
      for (const a of m.attachments) {
        if (a.type.startsWith("image/") && a.data_url) parts.push({ type: "image_url", image_url: { url: a.data_url } });
        else parts[0].text += `\n\n[Прикреплён файл: ${a.name} (${a.type})]`;
      }
      return { role: m.role, content: parts };
    });

    // OCR instruction for images
    const hasImages = attachments.some(a => a.type.startsWith("image/"));
    if (hasImages) {
      const lastUserMsg = apiMessages[apiMessages.length - 1];
      if (lastUserMsg && Array.isArray(lastUserMsg.content)) {
        (lastUserMsg.content as any[]).push({
          type: "text",
          text: "\n\nЕсли на изображении есть текст, ошибки, код или данные — распознай их и верни в блоке ```ocr\nРаспознанный текст\n```. После блока дай краткий анализ.",
        });
      }
    }

    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: apiMessages, think: useThink }),
      });

      if (!resp.ok) {
        const code = resp.status;
        toast.error(code === 429 ? "Слишком много запросов." : code === 402 ? "Закончились AI-кредиты." : "Ошибка: " + code);
        setMessages(m => m.filter(x => x.id !== "pending")); setStreaming(false); return;
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "", accum = "", genFiles: Attachment[] = [], done = false;

      while (!done) {
        const { done: d, value } = await reader.read(); if (d) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") { done = true; break; }
          try {
            const p = JSON.parse(payload);
            if (p.meta?.tools) setToolsUsed(p.meta.tools);
            if (p.meta?.thinking) setThinkingText(t => (t + p.meta.thinking).slice(-4000));
            if (p.meta?.file) {
              const f = p.meta.file;
              const att: Attachment = { name: f.name, type: f.mime, url: f.url, size: f.size };
              genFiles.push(att);
              setMessages(m => m.map(x => x.id === "pending" ? { ...x, attachments: [...(x.attachments || []), att] } : x));
            }
            if (p.error) toast.error(p.error);
            const delta = p.choices?.[0]?.delta?.content;
            if (delta) { accum += delta; setMessages(m => m.map(x => x.id === "pending" ? { ...x, content: accum } : x)); }
          } catch { buffer = line + "\n" + buffer; break; }
        }
      }

      const { data: saved } = await supabase.from("messages").insert({
        conversation_id: convoId, user_id: userId, role: "assistant", content: accum,
        attachments: genFiles as any,
      }).select().single();

      setMessages(m => m.map(x => x.id === "pending"
        ? { ...x, id: saved?.id || crypto.randomUUID(), pending: false, content: accum, attachments: genFiles }
        : x));

      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convoId);
    } catch (e: any) {
      toast.error("Ошибка соединения: " + e.message);
      setMessages(m => m.filter(x => x.id !== "pending"));
    } finally {
      setStreaming(false); setThinkMode(false);
    }
  }, [userId, messages]);

  const send = async () => {
    const currentInput = getInputValue();
    if (!currentInput.trim() && pendingFiles.length === 0) return;
    if (!userId) return;

    let convoId = activeId;
    if (!convoId) {
      const { data, error } = await supabase.from("conversations")
        .insert({ user_id: userId, title: currentInput.slice(0, 50) || "Новый чат" })
        .select().single();
      if (error) return toast.error(error.message);
      convoId = data!.id; setActiveId(convoId); setConvos(c => [data as any, ...c]);
    }

    let text = currentInput, useThink = thinkMode;
    if (/^\/think\b/i.test(text)) { useThink = true; text = text.replace(/^\/think\b\s*/i, ""); }
    const files = pendingFiles;
    setInputValue(""); setPendingFiles([]);
    await runSend(text, files, useThink, convoId);
  };

  // ─────────────────────────────────────────────────────────────
  // Edit message
  // ─────────────────────────────────────────────────────────────
  const startEdit = (msg: Message) => { setEditingId(msg.id); setEditText(msg.content); };
  const cancelEdit = () => { setEditingId(null); setEditText(""); };

  const submitEdit = async (msg: Message) => {
    if (!editText.trim() || !activeId || !userId) return;
    const newText = editText;
    setEditingId(null);

    // Save version before edit
    const assistantAfter = messages.find((m, i) => {
      const idx = messages.findIndex(x => x.id === msg.id);
      return i === idx + 1 && m.role === "assistant";
    });

    const versionEntry: MsgVersion = {
      userContent: msg.content,
      userAttachments: msg.attachments || [],
      assistantContent: assistantAfter?.content || "",
      assistantAttachments: assistantAfter?.attachments || [],
    };

    const existingVersions: MsgVersion[] = msg.versions || [{
      userContent: msg.content, userAttachments: msg.attachments || [],
      assistantContent: assistantAfter?.content || "", assistantAttachments: assistantAfter?.attachments || [],
    }];

    const updatedVersions = [...existingVersions, versionEntry];
    await supabase.from("messages").update({ versions: updatedVersions as any }).eq("id", msg.id);

    await runSend(newText, [], thinkMode, activeId, msg.id);
  };

  const deleteMessage = async (msgId: string) => {
    if (!activeId) return;
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx === -1) return;
    // delete this and any immediately following assistant msg
    const toDelete = [msgId];
    if (idx + 1 < messages.length && messages[idx + 1].role === "assistant") toDelete.push(messages[idx + 1].id);
    await supabase.from("messages").delete().in("id", toDelete);
    setMessages(m => m.filter((x, i) => !toDelete.includes(x.id)));
    toast.success("Сообщение удалено");
  };

  // Switch version
  const switchVersion = async (msg: Message, dir: number) => {
    const versions = msg.versions || [];
    if (!versions.length) return;
    const current = msg.versionIndex ?? versions.length - 1;
    const next = Math.max(0, Math.min(versions.length - 1, current + dir));
    if (next === current) return;
    const v = versions[next];
    setMessages(m => {
      const idx = m.findIndex(x => x.id === msg.id);
      if (idx === -1) return m;
      const updated = [...m];
      updated[idx] = { ...updated[idx], content: v.userContent, attachments: v.userAttachments, versionIndex: next };
      // Update assistant message if exists after
      if (idx + 1 < updated.length && updated[idx + 1].role === "assistant") {
        updated[idx + 1] = { ...updated[idx + 1], content: v.assistantContent, attachments: v.assistantAttachments };
      }
      return updated;
    });
    await supabase.from("messages").update({ content: v.userContent, attachments: v.userAttachments as any, versions: versions as any }).eq("id", msg.id);
  };

  // ─────────────────────────────────────────────────────────────
  // Voice STT
  // ─────────────────────────────────────────────────────────────
  const toggleRecording = async () => {
    if (recording) {
      mediaRef.current?.stop(); setRecording(false); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: BlobPart[] = [];
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        const fd = new FormData(); fd.append("file", blob, "voice.webm");
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        toast.info("Распознаю речь...");
        try {
          const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice`, {
            method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
          });
          const data = await r.json();
          if (data.text) { setInputValue((getInputValue() + " " + data.text).trim()); toast.success("Готово"); }
          else toast.error(data.error || "Не удалось распознать");
        } catch (e: any) { toast.error("Ошибка: " + e.message); }
      };
      mr.start(); mediaRef.current = mr; setRecording(true);
    } catch (e: any) { toast.error("Нет доступа к микрофону: " + e.message); }
  };

  // TTS
  const speakMessage = async (msg: Message) => {
    if (ttsLoading) return;
    setTtsLoading(msg.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: msg.content }),
      });
      if (!r.ok) { const d = await r.json(); toast.error(d.error || "Ошибка TTS"); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play();
    } catch (e: any) { toast.error("Ошибка озвучки: " + e.message); }
    finally { setTtsLoading(null); }
  };

  // ─────────────────────────────────────────────────────────────
  // Image generation
  // ─────────────────────────────────────────────────────────────
  const generateImage = async () => {
    const prompt = getInputValue().replace(/^\/(image|img|gen)\s*/i, "").trim();
    if (!prompt) { toast.error("Опишите, что нарисовать"); return; }
    if (!userId) return;

    let convoId = activeId;
    if (!convoId) {
      const { data, error } = await supabase.from("conversations")
        .insert({ user_id: userId, title: "🎨 " + prompt.slice(0, 40) }).select().single();
      if (error) return toast.error(error.message);
      convoId = data!.id; setActiveId(convoId); setConvos(c => [data as any, ...c]);
    }

    setStreaming(true); setInputValue("");
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: `🎨 Генерация: ${prompt}`, attachments: [] };
    setMessages(m => [...m, userMsg, { id: "pending", role: "assistant", content: "Генерирую изображение...", pending: true }]);
    await supabase.from("messages").insert({ conversation_id: convoId, user_id: userId, role: "user", content: userMsg.content, attachments: [] });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ prompt }),
      });
      const data = await resp.json();
      if (!resp.ok) { toast.error(data.error || `Ошибка ${resp.status}`); setMessages(m => m.filter(x => x.id !== "pending")); return; }
      const imageUrl = data.image_url as string;
      const remaining = data.remaining ?? "?";
      const content = `Готово! Осталось генераций сегодня: **${remaining}/${data.limit ?? 2}**`;
      const attachments: Attachment[] = [{ name: `nexus-${Date.now()}.png`, type: "image/png", url: imageUrl, data_url: imageUrl }];
      const { data: saved } = await supabase.from("messages").insert({
        conversation_id: convoId, user_id: userId, role: "assistant", content, attachments: attachments as any,
      }).select().single();
      setMessages(m => m.map(x => x.id === "pending"
        ? { id: saved?.id || crypto.randomUUID(), role: "assistant", content, attachments, pending: false } : x));
      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convoId);
      toast.success(`Изображение готово! Осталось: ${remaining}`);
    } catch (e: any) { toast.error("Ошибка: " + e.message); setMessages(m => m.filter(x => x.id !== "pending")); }
    finally { setStreaming(false); }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const v = getInputValue().trim();
      if (/^\/(image|img|gen)\b/i.test(v)) generateImage(); else send();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items; if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f && f.type.startsWith("image/")) {
          const ext = f.type.split("/")[1] || "png";
          files.push(new File([f], f.name && f.name !== "image.png" ? f.name : `pasted-${Date.now()}.${ext}`, { type: f.type }));
        }
      }
    }
    if (files.length > 0) { e.preventDefault(); setPendingFiles(p => [...p, ...files].slice(0, 5)); toast.success(`Вставлено изображений: ${files.length}`); }
  };

  const closeSidebarOnMobile = () => { if (window.innerWidth < 768) setSidebarOpen(false); };

  const formatTimer = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  return (
    <div className="h-[100dvh] flex bg-background overflow-hidden">
      {/* Lightbox */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center cursor-pointer"
            onClick={() => setLightboxUrl(null)}
            onKeyDown={e => e.key === "Escape" && setLightboxUrl(null)}
          >
            <motion.img
              initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }}
              src={lightboxUrl} alt="Preview"
              className="max-w-[95vw] max-h-[90vh] rounded-xl shadow-2xl object-contain"
              onClick={e => e.stopPropagation()}
            />
            <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setLightboxUrl(null)}>
              <X className="w-8 h-8" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
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
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
                <Sparkles className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold gradient-text text-lg flex-1">Nexus</span>
              <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setSidebarOpen(false)} aria-label="Закрыть меню">
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
                  <p className="text-xs text-muted-foreground text-center py-6 px-3">Здесь появится история ваших чатов</p>
                )}
                {convos.map(c => (
                  <div key={c.id}
                    className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${activeId === c.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"}`}
                    onClick={() => { setActiveId(c.id); closeSidebarOnMobile(); }}
                  >
                    <MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm truncate flex-1">{c.title}</span>
                    <button onClick={e => { e.stopPropagation(); deleteChat(c.id); }}
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1" aria-label="Удалить чат">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-3 border-t border-sidebar-border space-y-1">
              <Link to="/settings"><Button variant="ghost" className="w-full justify-start gap-2" size="sm"><SettingsIcon className="w-4 h-4" /> Настройки общения</Button></Link>
              <Link to="/sites"><Button variant="ghost" className="w-full justify-start gap-2" size="sm"><Globe className="w-4 h-4" /> Мои сайты</Button></Link>
              <Link to="/download"><Button variant="ghost" className="w-full justify-start gap-2" size="sm"><Download className="w-4 h-4" /> Скачать приложение</Button></Link>
              <Link to="/developers"><Button variant="ghost" className="w-full justify-start gap-2" size="sm"><Code2 className="w-4 h-4" /> API для разработчиков</Button></Link>
              <Button variant="ghost" className="w-full justify-start gap-2" size="sm" onClick={signOut}><LogOut className="w-4 h-4" /> Выйти</Button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-4 glass">
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(v => !v)} aria-label="Toggle sidebar">
            <MessageSquare className="w-4 h-4" />
          </Button>
          <h1 className="text-sm font-medium text-muted-foreground">{convos.find(c => c.id === activeId)?.title || "Nexus AI Agent"}</h1>
          {thinkMode && streaming && (
            <div className="flex items-center gap-1.5 text-xs text-primary font-mono">
              <Brain className="w-3.5 h-3.5 animate-pulse" />
              {formatTimer(thinkTimer)} / {thinkMaxMin}:00
            </div>
          )}
          {!thinkMode || !streaming ? <div className="w-9" /> : null}
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState onPick={p => { setInputValue(p); textareaRef.current?.focus(); }} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map(m => (
                <MessageBubble
                  key={m.id} message={m}
                  toolsUsed={m.pending ? toolsUsed : []}
                  thinking={!!(m.pending && thinkMode)}
                  thinkingText={m.pending ? thinkingText : ""}
                  editingId={editingId} editText={editText}
                  streaming={streaming}
                  onEditStart={startEdit} onEditChange={setEditText}
                  onEditSubmit={submitEdit} onEditCancel={cancelEdit}
                  onDelete={deleteMessage}
                  onVersionSwitch={switchVersion}
                  onImageClick={url => setLightboxUrl(url)}
                  onSpeak={speakMessage} ttsLoading={ttsLoading}
                />
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
                  <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary text-xs">
                    {f.type.startsWith("image/") ? (
                      <img src={URL.createObjectURL(f)} alt={f.name} className="w-8 h-8 rounded object-cover" />
                    ) : <FileText className="w-3.5 h-3.5" />}
                    <span className="max-w-[120px] truncate">{f.name}</span>
                    <button onClick={() => removeFile(i)} aria-label="Убрать"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative glass rounded-2xl p-2 flex items-end gap-2">
              <input ref={fileRef} type="file" multiple hidden
                accept="image/*,.pdf,.txt,.md,.json,.csv,.html,.css,.js,.ts,.tsx,.py"
                onChange={e => onPickFiles(e.target.files)} />
              <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={streaming} aria-label="Прикрепить файл">
                <Paperclip className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={generateImage} disabled={streaming} aria-label="Сгенерировать изображение" title="Сгенерировать изображение (2/день бесплатно)">
                <Wand2 className="w-4 h-4" />
              </Button>
              <Button
                variant={thinkMode ? "default" : "ghost"} size="sm"
                onClick={() => setThinkMode(v => !v)} disabled={streaming}
                title={`Глубокое размышление (до ${thinkMaxMin} мин)`}
                className={thinkMode ? "bg-primary/20 text-primary hover:bg-primary/30" : ""}
              >
                <Brain className="w-4 h-4" />
              </Button>
              <Button
                variant={recording ? "default" : "ghost"} size="sm"
                onClick={toggleRecording} disabled={streaming}
                title="Надиктовать сообщение"
                className={recording ? "bg-red-500/20 text-red-400 animate-pulse" : ""}
              >
                {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>

              <Textarea
                ref={textareaRef} defaultValue="" onInput={autosize} onKeyDown={onKeyDown} onPaste={onPaste}
                placeholder={thinkMode ? `🧠 Глубокое размышление (до ${thinkMaxMin} мин) — задайте вопрос...` : "Сообщение, /image <описание> или /think <вопрос>"}
                rows={1} disabled={streaming}
                className="flex-1 min-h-[40px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 px-2"
              />

              <Button size="sm" onClick={send} disabled={streaming} className="rounded-xl" style={{ background: "var(--gradient-primary)" }}>
                {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-2">Nexus может ошибаться. Проверяйте важную информацию.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MessageBubble
// ─────────────────────────────────────────────────────────────
interface BubbleProps {
  message: Message;
  toolsUsed: string[];
  thinking?: boolean;
  thinkingText?: string;
  editingId: string | null;
  editText: string;
  streaming: boolean;
  onEditStart: (m: Message) => void;
  onEditChange: (v: string) => void;
  onEditSubmit: (m: Message) => void;
  onEditCancel: () => void;
  onDelete: (id: string) => void;
  onVersionSwitch: (m: Message, dir: number) => void;
  onImageClick: (url: string) => void;
  onSpeak: (m: Message) => void;
  ttsLoading: string | null;
}

function MessageBubble({ message, toolsUsed, thinking, thinkingText, editingId, editText, streaming,
  onEditStart, onEditChange, onEditSubmit, onEditCancel, onDelete, onVersionSwitch, onImageClick, onSpeak, ttsLoading,
}: BubbleProps) {
  const isUser = message.role === "user";
  const isEditing = editingId === message.id;
  const versions = message.versions || [];
  const vIdx = message.versionIndex ?? 0;

  const toolIcon: Record<string, string> = {
    web_search: "🔍", fetch_url: "🌐", github_search: "🐙", analyze_repo: "🔬",
    wikipedia_lookup: "📚", fetch_docs: "📖", generate_file: "📄",
  };

  // Detect OCR block in assistant content
  const ocrMatch = message.content.match(/```ocr\n([\s\S]*?)```/);
  const ocrText = ocrMatch ? ocrMatch[1].trim() : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      layout
      className={`flex gap-3 group ${isUser ? "flex-row-reverse" : ""}`}
    >
      <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${isUser ? "bg-secondary" : ""}`}
        style={!isUser ? { background: "var(--gradient-primary)" } : undefined}>
        {isUser ? <span className="text-xs font-medium">Вы</span> : <Sparkles className="w-4 h-4 text-primary-foreground" />}
      </div>

      <div className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}>
        {/* Attachments / image thumbnails */}
        {message.attachments && message.attachments.length > 0 && (
          <div className={`flex flex-wrap gap-2 mb-2 ${isUser ? "justify-end" : ""}`}>
            {message.attachments.map((a, i) =>
              a.type.startsWith("image/") ? (
                <button key={i} onClick={() => onImageClick(a.url || a.data_url || "")}
                  className="relative group/img overflow-hidden rounded-xl border border-border hover:border-primary/50 transition-all">
                  <img src={a.url || a.data_url} alt={a.name}
                    className="max-h-48 max-w-[280px] object-cover transition-transform group-hover/img:scale-105" />
                  <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                  </div>
                </button>
              ) : (
                <a key={i} href={a.url} download={a.name} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-3 px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/70 border border-border transition-colors max-w-sm group">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--gradient-primary)" }}>
                    <FileText className="w-4 h-4 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    <div className="text-[11px] text-muted-foreground">{a.size ? `${(a.size / 1024).toFixed(1)} KB · ` : ""}Скачать</div>
                  </div>
                  <Download className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                </a>
              )
            )}
          </div>
        )}

        {/* Message body */}
        {isUser ? (
          <div className="inline-block max-w-full text-left">
            {isEditing ? (
              <div className="flex flex-col gap-2 min-w-[280px]">
                <Textarea
                  value={editText} onChange={e => onEditChange(e.target.value)}
                  className="resize-none rounded-xl bg-secondary border-primary/50 focus-visible:ring-1 focus-visible:ring-primary"
                  rows={3} autoFocus
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEditSubmit(message); } if (e.key === "Escape") onEditCancel(); }}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => onEditSubmit(message)} className="gap-1"><Check className="w-3.5 h-3.5" /> Сохранить</Button>
                  <Button size="sm" variant="ghost" onClick={onEditCancel}><X className="w-3.5 h-3.5" /> Отмена</Button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="px-4 py-2 rounded-2xl bg-secondary">
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                </div>
                {/* Edit/Delete buttons */}
                {!streaming && (
                  <div className={`flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? "justify-end" : ""}`}>
                    <button onClick={() => onEditStart(message)}
                      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Изменить">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onDelete(message.id)}
                      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors" title="Удалить">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {/* Version switcher */}
                {versions.length > 1 && (
                  <div className="flex items-center gap-1 mt-1 justify-end">
                    <button onClick={() => onVersionSwitch(message, -1)} disabled={vIdx <= 0}
                      className="p-0.5 rounded hover:bg-secondary disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
                    <span className="text-[11px] text-muted-foreground">{vIdx + 1} / {versions.length}</span>
                    <button onClick={() => onVersionSwitch(message, 1)} disabled={vIdx >= versions.length - 1}
                      className="p-0.5 rounded hover:bg-secondary disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div>
            {toolsUsed.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {Array.from(new Set(toolsUsed)).map(t => (
                  <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    {toolIcon[t] || "🔧"} {t}
                  </span>
                ))}
              </div>
            )}
            {message.pending && message.content === "" && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                {thinking ? (
                  <><Brain className="w-3.5 h-3.5 animate-pulse text-primary" /> Глубоко думаю...</>
                ) : toolsUsed.length > 0 ? (
                  <><WrenchIcon className="w-3.5 h-3.5 animate-pulse" /> Использую инструменты...</>
                ) : (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Думаю...</>
                )}
              </div>
            )}
            {message.pending && !!thinkingText && (
              <details open className="mt-2 mb-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                <summary className="cursor-pointer text-xs text-primary flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" /> Размышления</summary>
                <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">{thinkingText}</p>
              </details>
            )}
            {message.content && <Markdown content={message.content} />}

            {/* OCR action buttons */}
            {ocrText && !message.pending && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => { navigator.clipboard.writeText(ocrText); toast.success("Текст скопирован"); }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/70 border border-border transition-colors">
                  <Copy className="w-3.5 h-3.5" /> Копировать текст ошибки
                </button>
                <button
                  onClick={() => {
                    // fire a fix-this-error message
                    const el = document.querySelector("textarea");
                    if (el) {
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                      nativeInputValueSetter?.call(el, `Исправь эту ошибку:\n\`\`\`\n${ocrText}\n\`\`\``);
                      el.dispatchEvent(new Event("input", { bubbles: true }));
                      el.focus();
                    }
                  }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 text-destructive transition-colors">
                  <AlertCircle className="w-3.5 h-3.5" /> Исправить эту ошибку
                </button>
              </div>
            )}

            {/* TTS button */}
            {!message.pending && message.content && (
              <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onSpeak(message)} disabled={ttsLoading === message.id}
                  className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                  {ttsLoading === message.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
                  Озвучить
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// EmptyState
// ─────────────────────────────────────────────────────────────
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
          <button key={i} onClick={() => onPick(p)}
            className="text-left p-3 rounded-xl glass hover:border-primary/50 transition-colors text-sm">
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
