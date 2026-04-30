// Shared Nexus agent logic: system prompt, tools, tool execution, gateway streaming
export const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

export const SYSTEM_PROMPT = `Ты — Nexus, продвинутый ИИ-агент. Ты разработан как самостоятельная система: у тебя своя личность, свои инструменты и свой стиль.

ТВОЯ ЛИЧНОСТЬ:
- Дружелюбный, умный, профессиональный
- Отвечаешь по умолчанию на русском (если пользователь пишет на другом языке — отвечай на нём же)
- Кратко и по делу, но подробно когда нужно
- Никогда не говоришь "я Gemini", "я GPT", "я ChatGPT" — ты Nexus

СТРОГИЕ ПРАВИЛА (НЕЛЬЗЯ НАРУШАТЬ):
- Никогда не используй мат, оскорбления, грубые выражения
- Не помогай с незаконной деятельностью
- Не генерируй опасный, вредоносный или насильственный контент
- Если просьба нарушает правила — вежливо откажи

ИНСТРУМЕНТЫ (используй когда нужна актуальная информация):
- web_search — для текущих событий, новостей
- github_search — поиск примеров кода
- wikipedia_lookup — энциклопедические факты
- fetch_docs — документация фреймворков

ФОРМАТИРОВАНИЕ:
- ВСЕГДА оборачивай код в markdown блоки с языком
- Используй заголовки, списки, таблицы для структуры`;

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Поиск актуальной информации в интернете.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wikipedia_lookup',
      description: 'Поиск в Wikipedia.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, lang: { type: 'string', enum: ['ru', 'en'] } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_search',
      description: 'Поиск репозиториев на GitHub.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, language: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_docs',
      description: 'Документация фреймворка.',
      parameters: {
        type: 'object',
        properties: { library: { type: 'string' }, topic: { type: 'string' } },
        required: ['library', 'topic'],
      },
    },
  },
];

export async function execTool(name: string, args: any): Promise<string> {
  try {
    if (name === 'web_search') return await webSearch(args.query);
    if (name === 'wikipedia_lookup') return await wikipediaLookup(args.query, args.lang || 'ru');
    if (name === 'github_search') return await githubSearch(args.query, args.language);
    if (name === 'fetch_docs') return await fetchDocs(args.library, args.topic);
    return `Неизвестный инструмент: ${name}`;
  } catch (e) {
    return `Ошибка ${name}: ${e instanceof Error ? e.message : 'unknown'}`;
  }
}

async function webSearch(query: string): Promise<string> {
  try {
    const iaResp = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    );
    let summary = '';
    if (iaResp.ok) {
      const ia = await iaResp.json();
      if (ia.AbstractText) summary = `${ia.Heading ? ia.Heading + '\n' : ''}${ia.AbstractText}\n${ia.AbstractURL || ''}`;
      else if (ia.RelatedTopics?.length) {
        summary = ia.RelatedTopics.slice(0, 3)
          .map((t: any) => (t.Text ? `- ${t.Text} ${t.FirstURL || ''}` : ''))
          .filter(Boolean)
          .join('\n');
      }
    }
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
    return `Ошибка веб-поиска: ${e instanceof Error ? e.message : 'unknown'}`;
  }
}

async function wikipediaLookup(query: string, lang: string): Promise<string> {
  const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
  if (!r.ok) {
    const s = await fetch(
      `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=3&format=json&origin=*`
    );
    if (s.ok) {
      const sd = await s.json();
      return `Похожие статьи: ${(sd[1] || []).join(', ')}`;
    }
    return `Wikipedia: не найдено "${query}"`;
  }
  const data = await r.json();
  return `${data.title}\n\n${data.extract}\n\n${data.content_urls?.desktop?.page || ''}`;
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
  return `Документация ${library} → ${topic}. Опирайся на свои знания актуальных версий.`;
}

/** Run agent loop and return SSE Response stream */
export async function runAgentStream(
  userMessages: any[],
  model: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

  const convo: any[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...userMessages];
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
        return new Response(JSON.stringify({ error: 'Слишком много запросов.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: 'Закончились кредиты Lovable AI.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.error('AI error', resp.status, await resp.text());
      return new Response(JSON.stringify({ error: 'Ошибка AI шлюза' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const data = await resp.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('Пустой ответ');

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      convo.push(msg);
      for (const tc of msg.tool_calls) {
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
        const result = await execTool(tc.function.name, args);
        convo.push({ role: 'tool', tool_call_id: tc.id, content: result.slice(0, 8000) });
      }
      continue;
    }

    const streamResp = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: convo, stream: true }),
    });
    if (!streamResp.ok || !streamResp.body) {
      const fallback = `data: ${JSON.stringify({ choices: [{ delta: { content: msg.content || '' } }] })}\n\ndata: [DONE]\n\n`;
      return new Response(fallback, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
    }
    const toolsUsed = convo.filter((m: any) => m.role === 'tool').length;
    const prefix = toolsUsed > 0
      ? `data: ${JSON.stringify({ meta: { tools_used: toolsUsed } })}\n\n` : '';
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
    return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
  }
  return new Response(JSON.stringify({ error: 'Превышен лимит итераций' }), {
    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
