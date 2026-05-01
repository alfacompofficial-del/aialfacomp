import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download as DownloadIcon, Monitor, Smartphone, ArrowLeft, Sparkles, Globe } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const PUBLIC_BUCKET = `${SUPABASE_URL}/storage/v1/object/public/downloads`;

type Build = { name: string; url: string; size?: string; available: boolean };

const builds: Record<"win" | "android", Build> = {
  win: {
    name: "Nexus-win-x64.exe",
    url: `${PUBLIC_BUCKET}/Nexus-win-x64.exe`,
    available: false,
  },
  android: {
    name: "Nexus.apk",
    url: `${PUBLIC_BUCKET}/Nexus.apk`,
    available: false,
  },
};

export default function Download() {
  const [status, setStatus] = useState<{ win: boolean; android: boolean }>({ win: false, android: false });

  useEffect(() => {
    // HEAD-check both files
    Promise.all([
      fetch(builds.win.url, { method: "HEAD" }).then(r => r.ok).catch(() => false),
      fetch(builds.android.url, { method: "HEAD" }).then(r => r.ok).catch(() => false),
    ]).then(([win, android]) => setStatus({ win, android }));
  }, []);

  const downloadFile = async (b: Build) => {
    try {
      const res = await fetch(b.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = b.name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert("Файл ещё не загружен. Попробуйте позже.");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Назад в чат
        </Link>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="font-semibold">Nexus</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Скачать Nexus
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Установите Nexus как полноценное приложение на компьютер или телефон.
            Все возможности веб-версии без открытого браузера.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Windows */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="p-8 h-full flex flex-col bg-card/60 border-border/60">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-xl bg-primary/10">
                  <Monitor className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Windows</h2>
                  <p className="text-xs text-muted-foreground">Windows 10 / 11 (64-bit)</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-6 flex-1">
                Скачайте и запустите <code className="px-1.5 py-0.5 bg-muted rounded">Nexus-win-x64.exe</code>.
                Установка не требуется.
              </p>
              <Button
                size="lg"
                onClick={() => downloadFile(builds.win)}
                disabled={!status.win}
                className="w-full"
              >
                <DownloadIcon className="mr-2 h-4 w-4" />
                {status.win ? "Скачать .exe" : "Скоро"}
              </Button>
              {!status.win && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  Сборка готовится. Загляните позже.
                </p>
              )}
            </Card>
          </motion.div>

          {/* Android */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="p-8 h-full flex flex-col bg-card/60 border-border/60">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-xl bg-primary/10">
                  <Smartphone className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Android</h2>
                  <p className="text-xs text-muted-foreground">Android 7.0 и выше</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-6 flex-1">
                Скачайте .apk и откройте на телефоне. Возможно потребуется разрешить
                установку из неизвестных источников.
              </p>
              <Button
                size="lg"
                onClick={() => downloadFile(builds.android)}
                disabled={!status.android}
                className="w-full"
              >
                <DownloadIcon className="mr-2 h-4 w-4" />
                {status.android ? "Скачать .apk" : "Скоро"}
              </Button>
              {!status.android && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  Сборка готовится. Загляните позже.
                </p>
              )}
            </Card>
          </motion.div>

          {/* Web (always available) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="md:col-span-2"
          >
            <Card className="p-6 bg-muted/30 border-border/40 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Globe className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Уже работает в браузере</h3>
                <p className="text-sm text-muted-foreground">
                  Nexus полностью доступен онлайн без установки.
                </p>
              </div>
              <Link to="/">
                <Button variant="outline">Открыть</Button>
              </Link>
            </Card>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
