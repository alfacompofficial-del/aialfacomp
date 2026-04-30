import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Sparkles } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";

const API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-api`;

export default function DeveloperDocs() {
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

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-10">
        <section>
          <h1 className="text-4xl font-bold mb-3">Документация Nexus API</h1>
          <p className="text-muted-foreground text-lg">
            REST API совместимый с OpenAI Chat Completions. Streaming поддерживается через SSE.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-3">Базовый URL</h2>
          <Card className="p-4 bg-muted/40 font-mono text-sm break-all">
            {API_URL}
          </Card>
          <p className="text-sm text-muted-foreground mt-2">
            Когда вы подключите домен <code>apiai.alfacomp.uz</code>, можно использовать его вместо этого URL.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-3">Авторизация</h2>
          <p className="text-muted-foreground mb-3">
            Передавайте ключ в заголовке <code>Authorization: Bearer nx_live_…</code>
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-3">Пример: cURL</h2>
          <CodeBlock lang="bash" code={`curl -N "${API_URL}" \\
  -H "Authorization: Bearer nx_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      {"role": "user", "content": "Привет, кто ты?"}
    ]
  }'`} />
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-3">Пример: JavaScript</h2>
          <CodeBlock lang="javascript" code={`const res = await fetch("${API_URL}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer nx_live_YOUR_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Расскажи про Nexus" }]
  })
});

const reader = res.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  // SSE: data: {"choices":[{"delta":{"content":"…"}}]}
  console.log(chunk);
}`} />
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-3">Пример: Python</h2>
          <CodeBlock lang="python" code={`import requests, json

resp = requests.post(
    "${API_URL}",
    headers={
        "Authorization": "Bearer nx_live_YOUR_KEY",
        "Content-Type": "application/json",
    },
    json={"messages": [{"role": "user", "content": "Привет!"}]},
    stream=True,
)

for line in resp.iter_lines():
    if not line: continue
    s = line.decode("utf-8")
    if s.startswith("data: "):
        data = s[6:]
        if data == "[DONE]": break
        chunk = json.loads(data)
        delta = chunk["choices"][0]["delta"].get("content", "")
        print(delta, end="", flush=True)`} />
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-3">Параметры запроса</h2>
          <Card className="p-5 bg-card/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left py-2 pr-4">Поле</th>
                  <th className="text-left py-2 pr-4">Тип</th>
                  <th className="text-left py-2">Описание</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/20">
                  <td className="py-2 pr-4 font-mono">messages</td>
                  <td className="py-2 pr-4">array</td>
                  <td className="py-2">Массив сообщений {`{role, content}`}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono">model</td>
                  <td className="py-2 pr-4">string</td>
                  <td className="py-2">По умолчанию <code>google/gemini-3-flash-preview</code></td>
                </tr>
              </tbody>
            </table>
          </Card>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-3">Лимиты и коды ошибок</h2>
          <Card className="p-5 bg-card/60 space-y-2 text-sm">
            <div><code className="font-mono">200</code> — успешный SSE-стрим</div>
            <div><code className="font-mono">401</code> — отсутствует или неверный API ключ</div>
            <div><code className="font-mono">429</code> — превышен дневной лимит (100/сутки)</div>
            <div><code className="font-mono">402</code> — закончились кредиты Lovable AI на стороне Nexus</div>
            <div><code className="font-mono">500</code> — внутренняя ошибка</div>
          </Card>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-3">Инструменты Nexus</h2>
          <p className="text-muted-foreground mb-3">
            Агент сам решает когда использовать инструменты:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• <strong>web_search</strong> — актуальная информация из интернета</li>
            <li>• <strong>wikipedia_lookup</strong> — энциклопедические факты</li>
            <li>• <strong>github_search</strong> — поиск репозиториев</li>
            <li>• <strong>fetch_docs</strong> — документация фреймворков</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
