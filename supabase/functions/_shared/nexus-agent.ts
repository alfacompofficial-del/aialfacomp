// Shared Nexus agent: streaming-first tool loop, real tools, /think mode
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateFile } from './file-generators.ts';
export const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const BASE_PROMPT = `Ты — Nexus, продвинутый ИИ-агент. Самостоятельная система: своя личность, свои инструменты, свой стиль.

ТВОЯ ЛИЧНОСТЬ:
- Дружелюбный, умный, профессиональный
- По умолчанию отвечай на русском (если пользователь пишет на другом языке — на нём же)
- Кратко и по делу, подробно — когда нужно
- Никогда не говори "я Gemini/GPT/ChatGPT" — ты Nexus

СТРОГИЕ ПРАВИЛА:
- Без мата, оскорблений, грубостей
- Не помогай с незаконной/вредоносной деятельностью
- Если просьба нарушает правила — вежливо откажи

ИНСТРУМЕНТЫ — используй активно когда нужны актуальные данные:
- web_search — поиск в интернете (новости, факты, текущие события)
- fetch_url — открыть и прочитать конкретную веб-страницу
- github_search — поиск репозиториев и кода на GitHub
- wikipedia_lookup — энциклопедические факты
- fetch_docs — документация фреймворков (react, nextjs, tailwind, vue, ...)
- generate_file — СГЕНЕРИРОВАТЬ ФАЙЛ для скачивания: pdf, docx, txt, md, zip. Используй когда пользователь просит "сделай pdf/документ/отчёт/архив/скачать файл". Контент пиши в markdown (заголовки #, ##, списки -). Для .exe — генерируй zip с .py или .bat скриптом + README с инструкцией по сборке через pyinstaller (Windows .exe в браузере не собрать).

ВАЖНО: если пользователь спрашивает про сайт, ссылку, репозиторий или актуальные данные — СНАЧАЛА вызови инструмент, потом отвечай. Никогда не выдумывай ссылки.

ФОРМАТИРОВАНИЕ:
- Код всегда в markdown-блоках с языком: \`\`\`ts, \`\`\`python и т.д.
- Заголовки, списки, таблицы для структуры
- Источники указывай в конце ответа списком ссылок`;

const THINK_ADDON = `

🧠 РЕЖИМ ГЛУБОКОГО РАЗМЫШЛЕНИЯ АКТИВЕН:
- Сначала разложи задачу на шаги внутри себя
- Проверь факты через web_search / fetch_url / github_search
- Только потом дай точный, обоснованный ответ
- Обязательно укажи источники в конце
- Качество важнее скорости`;

export const TOOLS = [
  { type: 'function', function: {
      name: 'web_search',
      description: 'Поиск актуальной информации в интернете. Используй для новостей, текущих событий, фактов после даты обучения.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  }},
  { type: 'function', function: {
      name: 'fetch_url',
      description: 'Открыть конкретную веб-страницу и прочитать её содержимое. Используй когда есть URL или после web_search чтобы изучить источник детально.',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'Полный URL начиная с https://' } }, required: ['url'] },
  }},
  { type: 'function', function: {
      name: 'wikipedia_lookup',
      description: 'Поиск в Wikipedia (биографии, исторические факты, определения).',
      parameters: { type: 'object', properties: { query: { type: 'string' }, lang: { type: 'string', enum: ['ru', 'en'] } }, required: ['query'] },
  }},
  { type: 'function', function: {
      name: 'github_search',
      description: 'Поиск репозиториев и кода на GitHub.',
      parameters: { type: 'object', properties: {
        query: { type: 'string' },
        language: { type: 'string', description: 'Язык программирования (опц.)' },
        kind: { type: 'string', enum: ['repos', 'code'], description: 'repos (по умолч.) или code' },
      }, required: ['query'] },
  }},
  { type: 'function', function: {
      name: 'fetch_docs',
      description: 'Документация популярного фреймворка/библиотеки.',
      parameters: { type: 'object', properties: { library: { type: 'string' }, topic: { type: 'string' } }, required: ['library', 'topic'] },
  }},
  { type: 'function', function: {
      name: 'generate_file',
      description: 'Сгенерировать файл для скачивания пользователем (pdf, docx, txt, md, zip). Используй когда пользователь явно просит сделать файл/документ/отчёт/архив. Для zip передавай массив files. Контент в markdown (# заголовки, - списки).',
      parameters: { type: 'object', properties: {
        format: { type: 'string', enum: ['pdf', 'docx', 'txt', 'md', 'zip'] },
        filename: { type: 'string', description: 'Имя файла без расширения, например "resume" или "report"' },
        content: { type: 'string', description: 'Содержимое файла (markdown для pdf/docx/md, plain text для txt). Для zip — содержимое README.txt по умолчанию.' },
        files: { type: 'array', description: 'Только для zip: список файлов внутри архива', items: { type: 'object', properties: {
          name: { type: 'string' }, content: { type: 'string' },
        }, required: ['name', 'content'] } },
      }, required: ['format', 'filename'] },
  }},
];

// ───────────────────────── Tool implementations ─────────────────────────

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

interface ToolCtx {
  userId?: string | null;
  onFile?: (info: { name: string; url: string; size: number; mime: string }) => void;
}

async function execTool(name: string, args: any, ctx: ToolCtx = {}): Promise<string> {
  try {
    if (name === 'web_search') return await webSearch(args.query);
    if (name === 'fetch_url') return await fetchUrl(args.url);
    if (name === 'wikipedia_lookup') return await wikipediaLookup(args.query, args.lang || 'ru');
    if (name === 'github_search') return await githubSearch(args.query, args.language, args.kind || 'repos');
    if (name === 'fetch_docs') return await fetchDocs(args.library, args.topic);
    if (name === 'generate_file') return await generateFileTool(args, ctx);
    return `Неизвестный инструмент: ${name}`;
  } catch (e) {
    return `Ошибка ${name}: ${e instanceof Error ? e.message : 'unknown'}`;
  }
}

async function generateFileTool(args: any, ctx: ToolCtx): Promise<string> {
  if (!ctx.userId) return 'generate_file недоступен в этом контексте (нужен авторизованный пользователь).';
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) return 'Storage не настроен.';
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Daily limit: 10 files / day
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin.from('file_generations').select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId).gte('created_at', since);
  if ((count ?? 0) >= 10) return 'Достигнут дневной лимит генерации файлов (10/день). Попробуйте завтра.';

  let result;
  try {
    result = await generateFile(args.format, args.content || '', args.files);
  } catch (e) {
    return `Не удалось сгенерировать файл: ${e instanceof Error ? e.message : 'unknown'}`;
  }

  const safeName = (args.filename || 'file').toString().replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 60) || 'file';
  const fullName = `${safeName}.${result.ext}`;
  const path = `${ctx.userId}/${crypto.randomUUID()}-${fullName}`;

  const { error: upErr } = await admin.storage.from('generated-files').upload(path, result.bytes, {
    contentType: result.mime, upsert: false,
  });
  if (upErr) return `Ошибка загрузки: ${upErr.message}`;

  const { data: pub } = admin.storage.from('generated-files').getPublicUrl(path);
  const url = pub.publicUrl;

  await admin.from('file_generations').insert({
    user_id: ctx.userId, format: result.ext, filename: fullName,
  });

  ctx.onFile?.({ name: fullName, url, size: result.bytes.byteLength, mime: result.mime });

  return `✅ Файл готов: ${fullName} (${(result.bytes.byteLength / 1024).toFixed(1)} KB). Ссылка отправлена пользователю в виде кнопки скачивания.`;
}

async function webSearch(query: string): Promise<string> {
  const parts: string[] = [];
  // 1) DuckDuckGo Instant Answer
  try {
    const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
    if (r.ok) {
      const ia = await r.json();
      if (ia.AbstractText) parts.push(`${ia.Heading || ''}\n${ia.AbstractText}\n${ia.AbstractURL || ''}`.trim());
      else if (ia.RelatedTopics?.length) {
        parts.push(ia.RelatedTopics.slice(0, 3).map((t: any) => t.Text ? `- ${t.Text} ${t.FirstURL || ''}` : '').filter(Boolean).join('\n'));
      }
    }
  } catch {}

  // 2) DuckDuckGo HTML results
  const links: string[] = [];
  try {
    const html = await (await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': UA } })).text();
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && links.length < 6) {
      let url = m[1];
      const uddg = url.match(/uddg=([^&]+)/);
      if (uddg) url = decodeURIComponent(uddg[1]);
      const title = m[2].replace(/<[^>]+>/g, '').trim();
      const snip = m[3].replace(/<[^>]+>/g, '').trim().slice(0, 200);
      links.push(`- ${title}\n  ${url}\n  ${snip}`);
    }
  } catch {}

  // 3) Fallback: Wikipedia search if nothing found
  if (parts.length === 0 && links.length === 0) {
    try {
      const w = await fetch(`https://ru.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=3&format=json&origin=*`);
      if (w.ok) {
        const wd = await w.json();
        if (wd[1]?.length) parts.push(`Wikipedia: ${(wd[1] as string[]).join(', ')}`);
      }
    } catch {}
  }

  if (links.length) parts.push(`Источники:\n${links.join('\n')}`);
  return parts.length ? parts.join('\n\n') : `По запросу "${query}" ничего не найдено.`;
}

async function fetchUrl(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return 'fetch_url: URL должен начинаться с http(s)://';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json,text/plain,*/*' }, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return `fetch_url: HTTP ${r.status} для ${url}`;
    const ct = r.headers.get('content-type') || '';
    let text = await r.text();
    if (ct.includes('html')) {
      // strip scripts/styles
      text = text.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
      // extract title
      const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';
      // strip tags
      text = text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
      return `URL: ${url}\nTitle: ${title}\n\n${text.slice(0, 8000)}`;
    }
    return `URL: ${url}\nContent-Type: ${ct}\n\n${text.slice(0, 8000)}`;
  } catch (e) {
    return `fetch_url ошибка: ${e instanceof Error ? e.message : 'unknown'}`;
  }
}

async function wikipediaLookup(query: string, lang: string): Promise<string> {
  const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
  if (!r.ok) {
    const s = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=3&format=json&origin=*`);
    if (s.ok) { const sd = await s.json(); return `Похожие статьи: ${(sd[1] || []).join(', ')}`; }
    return `Wikipedia: не найдено "${query}"`;
  }
  const d = await r.json();
  return `${d.title}\n\n${d.extract}\n\n${d.content_urls?.desktop?.page || ''}`;
}

async function githubSearch(query: string, language?: string, kind: 'repos' | 'code' = 'repos'): Promise<string> {
  const q = language ? `${query} language:${language}` : query;
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'NexusBot' };
  const token = Deno.env.get('GITHUB_TOKEN');
  if (token) headers.Authorization = `Bearer ${token}`;

  if (kind === 'code') {
    if (!token) return 'GitHub code search требует GITHUB_TOKEN. Использую поиск по репозиториям...\n\n' + await githubSearch(query, language, 'repos');
    const r = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=5`, { headers });
    if (!r.ok) return `GitHub code: ошибка ${r.status}`;
    const d = await r.json();
    const items = (d.items || []).slice(0, 5).map((i: any) => `- ${i.repository?.full_name}/${i.path}\n  ${i.html_url}`);
    return items.length ? `Найденные файлы:\n${items.join('\n')}` : 'Ничего не найдено.';
  }

  const r = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=5`, { headers });
  if (!r.ok) return `GitHub: ошибка ${r.status}${!token ? ' (попробуй позже — публичный лимит 10/мин)' : ''}`;
  const d = await r.json();
  const items = (d.items || []).slice(0, 5).map((i: any) => `- ${i.full_name} (★${i.stargazers_count}): ${i.description || ''}\n  ${i.html_url}`);
  return items.length ? `Топ репозиториев:\n${items.join('\n')}` : 'Ничего не найдено.';
}

const DOC_URLS: Record<string, string> = {
  react: 'https://react.dev/reference/react',
  nextjs: 'https://nextjs.org/docs',
  next: 'https://nextjs.org/docs',
  vue: 'https://vuejs.org/guide/introduction.html',
  svelte: 'https://svelte.dev/docs',
  tailwind: 'https://tailwindcss.com/docs',
  tailwindcss: 'https://tailwindcss.com/docs',
  typescript: 'https://www.typescriptlang.org/docs/',
  python: 'https://docs.python.org/3/',
  django: 'https://docs.djangoproject.com/en/stable/',
  fastapi: 'https://fastapi.tiangolo.com/',
  supabase: 'https://supabase.com/docs',
  vite: 'https://vitejs.dev/guide/',
  node: 'https://nodejs.org/docs/latest/api/',
  deno: 'https://docs.deno.com/',
};

async function fetchDocs(library: string, topic: string): Promise<string> {
  const key = library.toLowerCase().replace(/[^a-z]/g, '');
  const baseUrl = DOC_URLS[key];
  if (baseUrl) {
    const content = await fetchUrl(baseUrl);
    const search = await webSearch(`${library} ${topic} documentation site:${new URL(baseUrl).hostname}`);
    return `Документация ${library} → ${topic}\n\n${content}\n\n---\n\nДополнительно:\n${search}`;
  }
  return await webSearch(`${library} ${topic} documentation`);
}

// ───────────────────────── Streaming agent loop ─────────────────────────

interface AccumulatedToolCall { id: string; name: string; args: string; }

/** Stream chat completion, accumulating tool_calls. Returns either tool calls to execute, or null if done. */
async function streamUntilToolsOrDone(
  body: any,
  apiKey: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
): Promise<{ toolCalls: AccumulatedToolCall[]; assistantContent: string } | { error: Response }> {
  const resp = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!resp.ok || !resp.body) {
    return { error: resp };
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const tcMap = new Map<number, AccumulatedToolCall>();
  let assistantContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) !== -1) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      let p: any;
      try { p = JSON.parse(payload); } catch { buf = line + '\n' + buf; break; }
      const delta = p.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const existing = tcMap.get(idx) || { id: '', name: '', args: '' };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.args += tc.function.arguments;
          tcMap.set(idx, existing);
        }
      }
      if (delta.content) {
        assistantContent += delta.content;
        // Stream content tokens to client only if NOT building tool calls
        if (tcMap.size === 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: delta.content } }] })}\n\n`));
        }
      }
    }
  }

  const toolCalls = Array.from(tcMap.values()).filter(t => t.name);
  return { toolCalls, assistantContent };
}

export async function runAgentStream(
  userMessages: any[],
  model: string,
  corsHeaders: Record<string, string>,
  opts: { think?: boolean; userId?: string | null } = {},
): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

  const sysPrompt = BASE_PROMPT + (opts.think ? THINK_ADDON : '');
  const useModel = opts.think ? 'openai/gpt-5' : model;
  const reasoning = opts.think ? { effort: 'high' as const } : undefined;

  const convo: any[] = [{ role: 'system', content: sysPrompt }, ...userMessages];
  const toolsUsedNames: string[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const onFile = (info: { name: string; url: string; size: number; mime: string }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ meta: { file: info } })}\n\n`));
      };
      const ctx: ToolCtx = { userId: opts.userId, onFile };

      try {
        for (let i = 0; i < 6; i++) {
          const body: any = { model: useModel, messages: convo, tools: TOOLS };
          if (reasoning) body.reasoning = reasoning;

          const res = await streamUntilToolsOrDone(body, LOVABLE_API_KEY, controller, encoder);
          if ('error' in res) {
            const status = res.error.status;
            const msg = status === 429 ? 'Слишком много запросов. Подождите минуту.'
              : status === 402 ? 'Закончились кредиты Lovable AI.'
              : 'Ошибка AI шлюза';
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            return;
          }

          if (res.toolCalls.length === 0) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            return;
          }

          for (const tc of res.toolCalls) toolsUsedNames.push(tc.name);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ meta: { tools: toolsUsedNames } })}\n\n`));

          convo.push({
            role: 'assistant',
            content: res.assistantContent || null,
            tool_calls: res.toolCalls.map(tc => ({
              id: tc.id, type: 'function',
              function: { name: tc.name, arguments: tc.args || '{}' },
            })),
          });

          for (const tc of res.toolCalls) {
            let args: any = {};
            try { args = JSON.parse(tc.args || '{}'); } catch {}
            const result = await execTool(tc.name, args, ctx);
            convo.push({ role: 'tool', tool_call_id: tc.id, content: result.slice(0, 8000) });
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Превышен лимит итераций' })}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (e) {
        console.error('agent stream error', e);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' })}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
}
