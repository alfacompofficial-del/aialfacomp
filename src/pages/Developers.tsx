import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles, Key, BookOpen, Zap, Shield, Code2 } from "lucide-react";

export default function Developers() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Назад
        </Link>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="font-semibold">Nexus</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-16">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs mb-4">
            <Code2 className="h-3 w-3" /> API для разработчиков
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Встройте Nexus в свой продукт
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Получите бесплатный API-ключ и используйте всю мощь Nexus в своих приложениях.
            Чат, веб-поиск, GitHub, Wikipedia — одна точка входа.
          </p>
          <div className="flex gap-3 justify-center mt-8">
            <Link to="/developers/keys">
              <Button size="lg"><Key className="mr-2 h-4 w-4" />Получить API ключ</Button>
            </Link>
            <Link to="/developers/docs">
              <Button size="lg" variant="outline"><BookOpen className="mr-2 h-4 w-4" />Документация</Button>
            </Link>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-4 mb-12">
          {[
            { icon: Zap, title: "Быстро", text: "Streaming SSE как у OpenAI. Первый токен за <500мс." },
            { icon: Shield, title: "Безопасно", text: "Ключи хранятся как SHA-256. Можно отозвать одним кликом." },
            { icon: Code2, title: "Совместимо", text: "OpenAI-совместимый формат. Просто поменяйте URL." },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * (i + 1) }}
            >
              <Card className="p-6 h-full bg-card/60 border-border/60">
                <f.icon className="h-6 w-6 text-primary mb-3" />
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.text}</p>
              </Card>
            </motion.div>
          ))}
        </div>

        <Card className="p-6 bg-muted/30">
          <h3 className="font-semibold mb-3">Лимиты бесплатного тарифа</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• 100 запросов в сутки на ключ</li>
            <li>• Все инструменты Nexus (web search, Wikipedia, GitHub, fetch_docs)</li>
            <li>• Streaming responses</li>
            <li>• Без подписки и карты</li>
          </ul>
        </Card>
      </main>
    </div>
  );
}
