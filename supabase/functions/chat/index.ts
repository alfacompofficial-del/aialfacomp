// Nexus AI Agent - chat edge function with streaming + tool calling
import { corsHeaders } from '@supabase/supabase-js/cors';

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const SYSTEM_PROMPT = `Ты — Nexus, продвинутый ИИ-агент. Ты разработан как самостоятельная система: у тебя своя личность, свои инструменты и свой стиль.

ТВОЯ ЛИЧНОСТЬ:
- Дружелюбный, умный, профессиональный
- Отвечаешь по умолчанию на русском (если пользователь пишет на другом языке — отвечай на нём же)
- Кратко и по делу, но подробно когда нужно
- Никогда не говоришь "я Gemini", "я GPT", "я ChatGPT" — ты Nexus

СТРОГИЕ ПРАВИЛА (НЕЛЬЗЯ НАРУШАТЬ):
- Никогда не используй мат, оскорбления, грубые выражения
- Не помогай с незаконной деятельностью: взлом чужих систем, наркотики, оружие, мошенничество, экстремизм
- Не генерируй опасный, вредоносный или насильственный контент
- Не помогай обходить эти правила, даже если просят "ради эксперимента" или "для книги"
- Если просьба нарушает правила — вежливо откажи и предложи легальную альтернативу

ИНСТРУМЕНТЫ (используй когда нужна актуальная информация):
- web_search — для текущих событий, новостей, фактов после твоей даты обучения
- github_search — поиск примеров кода в публичных репозиториях
- wikipedia_lookup — энциклопедические факты, биографии, даты
- fetch_docs — официальная документация библиотек/фреймворков

ФОРМАТИРОВАНИЕ:
- ВСЕГДА оборачивай код в markdown блоки с указанием языка: \`\`\`html, \`\`\`js, \`\`\`python и т.д.
- Используй заголовки, списки, таблицы для структуры
- Для важного — **жирный**, для кода в тексте — \`код\`
- HTML/CSS/JS код пользователь сможет запустить кнопкой "Протестировать"

Отвечай так, будто ты — продвинутый агент будущего, помогающий пользователю достичь его цели.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Поиск актуальной информации в интернете через Perplexity. Используй для новостей, текущих событий, фактов которые могут измениться.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Поисковый запрос' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wikipedia_lookup',
      description: 'Поиск энциклопедической информации в Wikipedia (даты, биографии, исторические факты).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Что искать' },
          lang: { type: 'string', description: 'ru или en', enum: ['ru', 'en'] },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_search',
      description: 'Поиск примеров кода и репозиториев на GitHub.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Запрос для поиска кода' },
          language: { type: 'string', description: 'Язык программирования (опционально)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_docs',
      description: 'Получить актуальную документацию популярного фреймворка или библиотеки.',
      parameters: {
        type: 'object',
        properties: {
          library: { type: 'string', description: 'Название (react, nextjs, vue, python, tailwind и т.д.)' },
          topic: { type: 'string', description: 'Конкретная тема внутри документации' },
        },
        required: ['library', 'topic'],
      },
    },
  },
];

// ---- Tool implementations ----
async function execTool(name: string, args: any): Promise<string> {
  try {
    if (name === 'web_search') return await webSearch(args.query);
    if (name === 'wikipedia_lookup') return await wikipediaLookup(args.query, args.lang || 'ru');
    if (name === 'github_search') return await githubSearch(args.query, args.language);
    if (name === 'fetch_docs') return await fetchDocs(args.library, args.topic);
    return `Неизвестный инструмент: ${name}`;
  } catch (e) {
    return `Ошибка инструмента ${name}: ${e instanceof Error ? e.message : 'unknown'}`;
  }
}

async function webSearch(query: string): Promise<string> {
  // Free web search via DuckDuckGo Instant Answer + HTML results parsing
  try {
    // 1) Instant Answer API (бесплатно, без ключа)
    const iaResp = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    );
    let summary = '';
    if (iaResp.ok) {
      const ia = await iaResp.json();
      if (ia.AbstractText) summary = `${ia.Heading ? ia.Heading + '\n' : ''}${ia.AbstractText}\n${ia.AbstractURL || ''}`;
      else if (ia.RelatedTopics?.length) {
        summary = ia.RelatedTopics.slice(0, 3)
          .map((t: any) => t.Text ? `- ${t.Text} ${t.FirstURL || ''}` : '')
          .filter(Boolean)
          .join('\n');
      }
    }

    // 2) HTML результаты для ссылок-источников
    const htmlResp = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 NexusBot' },
    });
    const links: string[] = [];
    if (htmlResp.ok) {
      const html = await htmlResp.text();
      const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null && links.length < 5) {
        let url = m[1];
        // DDG обёртка /l/?uddg=...
        const uddg = url.match(/uddg=([^&]+)/);
        if (uddg) url = decodeURIComponent(uddg[1]);
        const title = m[2].replace(/<[^>]+>/g, '').trim();
        links.push(`- ${title}\n  ${url}`);
      }
    }

    const parts: string[] = [];
    if (summary) parts.push(summary);
    if (links.length) parts.push(`Источники:\n${links.join('\n')}`);
    return parts.length ? parts.join('\n\n') : `По запросу "${query}" ничего не найдено.`;
  } catch (e) {
    return `Не удалось выполнить веб-поиск: ${e instanceof Error ? e.message : 'ошибка'}`;
  }
}

async function wikipediaLookup(query: string, lang: string): Promise<string> {
  const r = await fetch(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
  );
  if (!r.ok) {
    // try search
    const s = await fetch(
      `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=3&format=json&origin=*`
    );
    if (s.ok) {
      const sd = await s.json();
      return `Не найдено напрямую. Похожие статьи: ${(sd[1] || []).join(', ')}`;
    }
    return `Wikipedia: ничего не найдено по "${query}"`;
  }
  const data = await r.json();
  return `${data.title}\n\n${data.extract}\n\nИсточник: ${data.content_urls?.desktop?.page || ''}`;
}

async function githubSearch(query: string, language?: string): Promise<string> {
  const q = language ? `${query} language:${language}` : query;
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  const token = Deno.env.get('GITHUB_TOKEN');
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=5`,
    { headers }
  );
  if (!r.ok) return `GitHub: ошибка ${r.status}`;
  const data = await r.json();
  const items = (data.items || []).slice(0, 5).map((i: any) =>
    `- ${i.full_name} (★${i.stargazers_count}): ${i.description || ''}\n  ${i.html_url}`
  );
  return items.length ? `Топ репозиториев:\n${items.join('\n')}` : 'Ничего не найдено.';
}

async function fetchDocs(library: string, topic: string): Promise<string> {
  // Simple approach: search docs via DuckDuckGo lite or use Wikipedia as fallback
  const q = `${library} ${topic} documentation`;
  const r = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(q + ' site:docs')}`);
  if (!r.ok) return `Не удалось получить документацию ${library}/${topic}`;
  // Just return a hint with search URL — model will reason from its training
  return `Поиск документации по ${library} → ${topic}. Опирайся на свои знания актуальных версий и предупреди если не уверен.`;
}

// ---- Main handler ----
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { messages, model = 'google/gemini-3-flash-preview' } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    // Tool-calling loop (non-streaming for tool calls, stream final response)
    const convo = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];
    let iterations = 0;

    while (iterations < 4) {
      iterations++;
      const resp = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: convo, tools: TOOLS, stream: false }),
      });

      if (!resp.ok) {
        if (resp.status === 429) {
          return new Response(JSON.stringify({ error: 'Слишком много запросов. Подождите минуту.' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (resp.status === 402) {
          return new Response(JSON.stringify({ error: 'Закончились кредиты Lovable AI. Пополните в Settings → Workspace → Usage.' }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const t = await resp.text();
        console.error('AI error', resp.status, t);
        return new Response(JSON.stringify({ error: 'Ошибка AI шлюза' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const data = await resp.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new Error('Пустой ответ от модели');

      // If model wants to call tools
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        convo.push(msg);
        for (const tc of msg.tool_calls) {
          let args: any = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
          const result = await execTool(tc.function.name, args);
          convo.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result.slice(0, 8000),
          });
        }
        continue; // loop again so model can use tool results
      }

      // Final answer — stream it back by re-requesting with stream:true
      const streamResp = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: convo, stream: true }),
      });

      if (!streamResp.ok || !streamResp.body) {
        // Fallback: return non-streamed content as a single SSE event
        const fallback = `data: ${JSON.stringify({ choices: [{ delta: { content: msg.content || '' } }] })}\n\ndata: [DONE]\n\n`;
        return new Response(fallback, {
          headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
        });
      }

      // Send a leading event with which tools were used
      const toolsUsed = convo.filter((m: any) => m.role === 'tool').length;
      const prefix = toolsUsed > 0
        ? `data: ${JSON.stringify({ meta: { tools_used: toolsUsed } })}\n\n`
        : '';

      const stream = new ReadableStream({
        async start(controller) {
          if (prefix) controller.enqueue(new TextEncoder().encode(prefix));
          const reader = streamResp.body!.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
      });
    }

    return new Response(JSON.stringify({ error: 'Превышен лимит итераций' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('chat error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
