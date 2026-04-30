import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Plus, Copy, Trash2, Key, Check, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  daily_limit: number;
  revoked: boolean;
  created_at: string;
  last_used_at: string | null;
};

export default function DeveloperKeys() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [dlgOpen, setDlgOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate("/auth", { replace: true });
      else load();
    });
  }, []);

  async function load() {
    setLoading(true);
    const { data: keysData, error } = await supabase
      .from("api_keys")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setKeys(keysData || []);

    // Usage in last 24h per key
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: usageData } = await supabase
      .from("api_usage")
      .select("key_id")
      .gte("created_at", since);
    const counts: Record<string, number> = {};
    (usageData || []).forEach((r: any) => {
      counts[r.key_id] = (counts[r.key_id] || 0) + 1;
    });
    setUsage(counts);
    setLoading(false);
  }

  async function createKey() {
    if (!newName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("manage-api-key", {
      body: { action: "create", name: newName.trim() },
    });
    setCreating(false);
    if (error || !data?.key) {
      toast.error(error?.message || data?.error || "Ошибка");
      return;
    }
    setCreatedKey(data.key);
    setNewName("");
    load();
  }

  async function revokeKey(id: string) {
    if (!confirm("Отозвать ключ? Действие необратимо.")) return;
    const { error } = await supabase.functions.invoke("manage-api-key", {
      body: { action: "revoke", id },
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Ключ отозван");
      load();
    }
  }

  async function deleteKey(id: string) {
    if (!confirm("Удалить ключ навсегда?")) return;
    const { error } = await supabase.functions.invoke("manage-api-key", {
      body: { action: "delete", id },
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Удалено");
      load();
    }
  }

  function copyKey() {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 px-6 py-4 flex items-center justify-between">
        <Link to="/developers" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Назад
        </Link>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="font-semibold">Nexus</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">API ключи</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Управляйте ключами для доступа к Nexus API
            </p>
          </div>
          <Button onClick={() => { setCreatedKey(null); setDlgOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Новый ключ
          </Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Загрузка...</p>
        ) : keys.length === 0 ? (
          <Card className="p-12 text-center bg-card/60">
            <Key className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="font-semibold mb-2">Пока нет ключей</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Создайте первый ключ, чтобы начать использовать Nexus API
            </p>
            <Button onClick={() => { setCreatedKey(null); setDlgOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Создать ключ
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {keys.map(k => {
                const used = usage[k.id] || 0;
                const pct = Math.min(100, (used / k.daily_limit) * 100);
                return (
                  <motion.div
                    key={k.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <Card className={`p-5 bg-card/60 ${k.revoked ? "opacity-60" : ""}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold truncate">{k.name}</h3>
                            {k.revoked && (
                              <span className="text-xs px-2 py-0.5 rounded bg-destructive/15 text-destructive">
                                Отозван
                              </span>
                            )}
                          </div>
                          <code className="text-xs text-muted-foreground font-mono">{k.key_prefix}</code>
                          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                            <span>Создан: {new Date(k.created_at).toLocaleDateString("ru")}</span>
                            {k.last_used_at && (
                              <span>Использован: {new Date(k.last_used_at).toLocaleDateString("ru")}</span>
                            )}
                          </div>
                          <div className="mt-3">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground">За 24 часа</span>
                              <span>{used} / {k.daily_limit}</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          {!k.revoked && (
                            <Button size="sm" variant="outline" onClick={() => revokeKey(k.id)}>
                              Отозвать
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => deleteKey(k.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </main>

      <Dialog open={dlgOpen} onOpenChange={(o) => { setDlgOpen(o); if (!o) setCreatedKey(null); }}>
        <DialogContent>
          {!createdKey ? (
            <>
              <DialogHeader>
                <DialogTitle>Новый API ключ</DialogTitle>
                <DialogDescription>
                  Дайте ключу имя, чтобы потом было легче найти.
                </DialogDescription>
              </DialogHeader>
              <Input
                placeholder="Например: Мой бот"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createKey()}
                maxLength={80}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setDlgOpen(false)}>Отмена</Button>
                <Button onClick={createKey} disabled={!newName.trim() || creating}>
                  {creating ? "Создаём..." : "Создать"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary" /> Ключ создан
                </DialogTitle>
                <DialogDescription>
                  Скопируйте ключ сейчас — он показывается только один раз.
                </DialogDescription>
              </DialogHeader>
              <div className="bg-muted p-3 rounded-md font-mono text-xs break-all">
                {createdKey}
              </div>
              <div className="flex items-start gap-2 p-3 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 rounded-md text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Храните ключ в безопасности. Мы не сможем показать его снова.</span>
              </div>
              <DialogFooter>
                <Button onClick={copyKey}>
                  {copied ? <><Check className="mr-2 h-4 w-4" /> Скопировано</> : <><Copy className="mr-2 h-4 w-4" /> Копировать</>}
                </Button>
                <Button variant="outline" onClick={() => { setDlgOpen(false); setCreatedKey(null); }}>
                  Готово
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
