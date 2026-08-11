import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Loader2, RotateCcw, Save } from "lucide-react";

type Settings = {
  custom_instructions: string;
  tone: string;
  verbosity: string;
  language: string;
  preferred_name: string;
  always_cite: boolean;
  code_first: boolean;
};

const DEFAULTS: Settings = {
  custom_instructions: "",
  tone: "neutral",
  verbosity: "normal",
  language: "auto",
  preferred_name: "",
  always_cite: false,
  code_first: false,
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return navigate("/auth", { replace: true });
      setUserId(data.session.user.id);
      const { data: row } = await supabase
        .from("user_settings").select("*").eq("user_id", data.session.user.id).maybeSingle();
      if (row) {
        setS({
          custom_instructions: row.custom_instructions || "",
          tone: row.tone || "neutral",
          verbosity: row.verbosity || "normal",
          language: row.language || "auto",
          preferred_name: row.preferred_name || "",
          always_cite: !!row.always_cite,
          code_first: !!row.code_first,
        });
      }
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
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Настройки сохранены — Nexus будет их учитывать");
  };

  const reset = () => {
    setS(DEFAULTS);
    toast.info("Значения сброшены. Нажмите «Сохранить», чтобы применить.");
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="h-14 border-b border-border flex items-center gap-3 px-4">
        <Link to="/">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Назад
          </Button>
        </Link>
        <h1 className="font-semibold">Настройки общения</h1>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          <Card className="p-5 space-y-3">
            <Label htmlFor="ci">Как со мной общаться</Label>
            <Textarea
              id="ci"
              value={s.custom_instructions}
              maxLength={2000}
              rows={6}
              onChange={(e) => setS({ ...s, custom_instructions: e.target.value })}
              placeholder="Например: не подлизывайся, спорь со мной, отвечай кратко и без вступлений, всегда предлагай альтернативу"
            />
            <p className="text-xs text-muted-foreground">{s.custom_instructions.length}/2000</p>
          </Card>

          <Card className="p-5 space-y-4">
            <div className="space-y-2">
              <Label>Как к вам обращаться</Label>
              <Input
                value={s.preferred_name}
                maxLength={40}
                onChange={(e) => setS({ ...s, preferred_name: e.target.value })}
                placeholder="Имя (необязательно)"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Тон</Label>
                <Select value={s.tone} onValueChange={(v) => setS({ ...s, tone: v })}>
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
                <Select value={s.verbosity} onValueChange={(v) => setS({ ...s, verbosity: v })}>
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
                <Select value={s.language} onValueChange={(v) => setS({ ...s, language: v })}>
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
              <div>
                <Label htmlFor="cite">Всегда указывать источники</Label>
                <p className="text-xs text-muted-foreground">Ссылки на источники в конце ответа</p>
              </div>
              <Switch id="cite" checked={s.always_cite} onCheckedChange={(v) => setS({ ...s, always_cite: v })} />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="codefirst">Сразу код без вступлений</Label>
                <p className="text-xs text-muted-foreground">Пояснения — после кода</p>
              </div>
              <Switch id="codefirst" checked={s.code_first} onCheckedChange={(v) => setS({ ...s, code_first: v })} />
            </div>
          </Card>

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Сохранить
            </Button>
            <Button variant="ghost" onClick={reset} className="gap-2">
              <RotateCcw className="w-4 h-4" /> Сбросить
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
