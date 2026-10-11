import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, RotateCcw, Save, Github, Database, Eye, EyeOff, Check, X,
} from "lucide-react";

type Settings = {
  custom_instructions: string;
  tone: string;
  verbosity: string;
  language: string;
  preferred_name: string;
  always_cite: boolean;
  code_first: boolean;
  think_minutes: number;
};

const DEFAULTS: Settings = {
  custom_instructions: "",
  tone: "neutral",
  verbosity: "normal",
  language: "auto",
  preferred_name: "",
  always_cite: false,
  code_first: false,
  think_minutes: 10,
};

type IntegrationStatus = {
  github: boolean;
  supabase: boolean;
  supabase_project_ref: string;
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Integration state
  const [intStatus, setIntStatus] = useState<IntegrationStatus>({ github: false, supabase: false, supabase_project_ref: "" });
  const [githubToken, setGithubToken] = useState("");
  const [supabaseRef, setSupabaseRef] = useState("");
  const [supabaseToken, setSupabaseToken] = useState("");
  const [showGhToken, setShowGhToken] = useState(false);
  const [showSbToken, setShowSbToken] = useState(false);
  const [savingInt, setSavingInt] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return navigate("/auth", { replace: true });
      const uid = data.session.user.id;
      setUserId(uid);

      // Load user settings
      const { data: row } = await supabase.from("user_settings").select("*").eq("user_id", uid).maybeSingle();
      if (row) {
        setS({
          custom_instructions: row.custom_instructions || "",
          tone: row.tone || "neutral",
          verbosity: row.verbosity || "normal",
          language: row.language || "auto",
          preferred_name: row.preferred_name || "",
          always_cite: !!row.always_cite,
          code_first: !!row.code_first,
          think_minutes: (row as any).think_minutes ?? 10,
        });
      }

      // Load integration status
      try {
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/integrations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
          body: JSON.stringify({ action: "status" }),
        });
        if (resp.ok) {
          const d = await resp.json();
          setIntStatus(d);
          if (d.supabase_project_ref) setSupabaseRef(d.supabase_project_ref);
        }
      } catch {}

      setLoading(false);
    });
  }, [navigate]);

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase.from("user_settings").upsert({
      user_id: userId,
      custom_instructions: s.custom_instructions.slice(0, 2000),
      tone: s.tone,
      verbosity: s.verbosity,
      language: s.language,
      preferred_name: s.preferred_name || null,
      always_cite: s.always_cite,
      code_first: s.code_first,
      think_minutes: s.think_minutes,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Настройки сохранены — Nexus будет их учитывать");
  };

  const reset = () => { setS(DEFAULTS); toast.info("Значения сброшены. Нажмите «Сохранить», чтобы применить."); };

  const saveIntegrations = async () => {
    setSavingInt(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Нужно войти"); return; }
      const body: Record<string, string> = { action: "save" };
      if (githubToken) body.github_token = githubToken;
      if (supabaseRef) body.supabase_project_ref = supabaseRef;
      if (supabaseToken) body.supabase_access_token = supabaseToken;

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const d = await resp.json();
      if (!resp.ok) { toast.error(d.error || "Ошибка"); return; }

      // Refresh status
      const sr = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "status" }),
      });
      if (sr.ok) { const sd = await sr.json(); setIntStatus(sd); if (sd.supabase_project_ref) setSupabaseRef(sd.supabase_project_ref); }
      setGithubToken(""); setSupabaseToken("");
      toast.success("Интеграции сохранены");
    } finally { setSavingInt(false); }
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="h-14 border-b border-border flex items-center gap-3 px-4">
        <Link to="/">
          <Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="w-4 h-4" /> Назад</Button>
        </Link>
        <h1 className="font-semibold">Настройки общения</h1>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">

          {/* Persona */}
          <Card className="p-5 space-y-3">
            <Label htmlFor="ci">Как со мной общаться</Label>
            <Textarea id="ci" value={s.custom_instructions} maxLength={2000} rows={6}
              onChange={e => setS({ ...s, custom_instructions: e.target.value })}
              placeholder="Например: не подлизывайся, спорь со мной, отвечай кратко и без вступлений, всегда предлагай альтернативу" />
            <p className="text-xs text-muted-foreground">{s.custom_instructions.length}/2000</p>
          </Card>

          <Card className="p-5 space-y-4">
            <div className="space-y-2">
              <Label>Как к вам обращаться</Label>
              <Input value={s.preferred_name} maxLength={40} onChange={e => setS({ ...s, preferred_name: e.target.value })} placeholder="Имя (необязательно)" />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Тон</Label>
                <Select value={s.tone} onValueChange={v => setS({ ...s, tone: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="neutral">Нейтральный</SelectItem>
                    <SelectItem value="friendly">Дружелюбный</SelectItem>
                    <SelectItem value="critic">Жёсткий критик</SelectItem>
                    <SelectItem value="concise_pro">Сухой профессионал</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Длина ответа</Label>
                <Select value={s.verbosity} onValueChange={v => setS({ ...s, verbosity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Кратко</SelectItem>
                    <SelectItem value="normal">Обычно</SelectItem>
                    <SelectItem value="detailed">Подробно</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Язык ответа</Label>
                <Select value={s.language} onValueChange={v => setS({ ...s, language: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Как я пишу</SelectItem>
                    <SelectItem value="русский">Русский</SelectItem>
                    <SelectItem value="узбекский">Узбекский</SelectItem>
                    <SelectItem value="english">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 pt-2">
              <div><Label htmlFor="cite">Всегда указывать источники</Label><p className="text-xs text-muted-foreground">Ссылки на источники в конце ответа</p></div>
              <Switch id="cite" checked={s.always_cite} onCheckedChange={v => setS({ ...s, always_cite: v })} />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div><Label htmlFor="codefirst">Сразу код без вступлений</Label><p className="text-xs text-muted-foreground">Пояснения — после кода</p></div>
              <Switch id="codefirst" checked={s.code_first} onCheckedChange={v => setS({ ...s, code_first: v })} />
            </div>
          </Card>

          {/* Think time */}
          <Card className="p-5 space-y-4">
            <div>
              <Label>Время глубокого размышления</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Максимальное время для режима 🧠 (кнопка Brain)</p>
            </div>
            <div className="flex items-center gap-4">
              <Slider
                min={5} max={15} step={1}
                value={[s.think_minutes]}
                onValueChange={([v]) => setS({ ...s, think_minutes: v })}
                className="flex-1"
              />
              <span className="text-sm font-mono w-16 text-right">{s.think_minutes} мин</span>
            </div>
            <p className="text-xs text-muted-foreground">Диапазон: 5–15 минут. Таймер показывается в заголовке чата.</p>
          </Card>

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Сохранить
            </Button>
            <Button variant="ghost" onClick={reset} className="gap-2"><RotateCcw className="w-4 h-4" /> Сбросить</Button>
          </div>

          {/* Integrations */}
          <Card className="p-5 space-y-5">
            <div>
              <h2 className="font-semibold text-base">Интеграции</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Токены хранятся зашифровано и доступны только вашему аккаунту.</p>
            </div>

            {/* GitHub */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Github className="w-4 h-4" />
                <Label className="font-medium">GitHub</Label>
                {intStatus.github
                  ? <span className="flex items-center gap-1 text-xs text-green-400"><Check className="w-3.5 h-3.5" /> Подключён</span>
                  : <span className="flex items-center gap-1 text-xs text-muted-foreground"><X className="w-3.5 h-3.5" /> Не подключён</span>}
              </div>
              <div className="relative">
                <Input
                  type={showGhToken ? "text" : "password"}
                  value={githubToken}
                  onChange={e => setGithubToken(e.target.value)}
                  placeholder={intStatus.github ? "Введите новый токен, чтобы обновить" : "ghp_xxxxxxxxxxxxxxxxxxxx"}
                  className="pr-10"
                />
                <button type="button" onClick={() => setShowGhToken(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showGhToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Нужен токен с правами <code className="bg-secondary px-1 rounded">repo</code>. Создайте на <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="text-primary underline">github.com/settings/tokens</a></p>
            </div>

            {/* Supabase */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                <Label className="font-medium">Supabase (ваш проект)</Label>
                {intStatus.supabase
                  ? <span className="flex items-center gap-1 text-xs text-green-400"><Check className="w-3.5 h-3.5" /> Подключён</span>
                  : <span className="flex items-center gap-1 text-xs text-muted-foreground"><X className="w-3.5 h-3.5" /> Не подключён</span>}
              </div>
              <Input
                value={supabaseRef}
                onChange={e => setSupabaseRef(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                placeholder="ID проекта (напр. abcdefghijklmnop)"
              />
              <div className="relative">
                <Input
                  type={showSbToken ? "text" : "password"}
                  value={supabaseToken}
                  onChange={e => setSupabaseToken(e.target.value)}
                  placeholder={intStatus.supabase ? "Введите новый токен, чтобы обновить" : "Токен доступа управления"}
                  className="pr-10"
                />
                <button type="button" onClick={() => setShowSbToken(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showSbToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                ID и токен берутся из вашего проекта на <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-primary underline">supabase.com/dashboard</a> → Settings → API
              </p>
            </div>

            <Button onClick={saveIntegrations} disabled={savingInt} className="gap-2">
              {savingInt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Сохранить интеграции
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
