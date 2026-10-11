// Voice: speech-to-text (multipart upload) and short spoken summary (text-to-speech WAV)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const BASE = 'https://ai.gateway.lovable.dev/v1';
const STT_MODEL = 'openai/gpt-transcribe';
const TTS_MODEL = 'google/gemini-3.1-flash-tts-preview';
const SUMMARY_MODEL = 'google/gemini-3-flash-preview';

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function errorFrom(r: Response, label: string) {
  const t = await r.text();
  console.error(`${label} [${r.status}]: ${t}`);
  const msg = r.status === 429 ? 'Слишком много запросов, подождите'
    : r.status === 402 ? 'Закончились AI-кредиты'
    : `${label}: ${t.slice(0, 300)}`;
  return json({ error: msg }, r.status);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!KEY) return json({ error: 'LOVABLE_API_KEY не настроен' }, 500);

  try {
    const ct = req.headers.get('content-type') || '';
    // ---------- Speech to text ----------
    if (ct.startsWith('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File) || !file.size) return json({ error: 'Пустая запись' }, 400);
      if (file.size > 24 * 1024 * 1024) return json({ error: 'Запись слишком длинная' }, 400);
      const fd = new FormData();
      fd.append('model', STT_MODEL);
      fd.append('file', file, file.name || 'voice.webm');
      fd.append('response_format', 'json');
      fd.append('stream', 'true');
      const r = await fetch(`${BASE}/audio/transcriptions`, {
        method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: fd,
      });
      if (!r.ok || !r.body) return await errorFrom(r, 'Распознавание');
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '', text = '', final = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const p = line.slice(5).trim();
          if (!p || p === '[DONE]') continue;
          try {
            const ev = JSON.parse(p);
            if (ev.type === 'transcript.text.delta' && ev.delta) text += ev.delta;
            if (ev.type === 'transcript.text.done' && typeof ev.text === 'string') final = ev.text;
            if (ev.error) return json({ error: ev.error.message || 'Ошибка распознавания' }, 502);
          } catch { /* partial */ }
        }
      }
      return json({ text: (final || text).trim() });
    }

    // ---------- Text to speech (short summary) ----------
    const body = await req.json().catch(() => ({}));
    const source = String(body.text || '').slice(0, 12000);
    if (!source.trim()) return json({ error: 'Нет текста' }, 400);

    // 1) Compress to 2-3 spoken sentences
    const sr = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        messages: [
          { role: 'system', content: 'Сожми ответ ИИ-ассистента в 2–3 коротких разговорных предложения для озвучки. Без кода, без markdown, без ссылок. Язык — как в тексте. Пример: "Сайт упал из-за ошибки 500 в строке 42. Я её исправил, осталось подтвердить деплой."' },
          { role: 'user', content: source },
        ],
      }),
    });
    if (!sr.ok) return await errorFrom(sr, 'Сводка');
    const sj = await sr.json();
    const summary = String(sj.choices?.[0]?.message?.content || '').trim().slice(0, 1200);
    if (!summary) return json({ error: 'Не удалось сделать сводку' }, 502);

    // 2) Speak it (complete WAV)
    const tr = await fetch(`${BASE}/audio/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: TTS_MODEL,
        contents: [{ role: 'user', parts: [{ text: summary }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
        stream_format: 'audio',
      }),
    });
    if (!tr.ok || !tr.body) return await errorFrom(tr, 'Озвучка');
    return new Response(tr.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': tr.headers.get('content-type') || 'audio/wav',
        'X-Summary': encodeURIComponent(summary),
        'Access-Control-Expose-Headers': 'X-Summary',
      },
    });
  } catch (e) {
    console.error('voice error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown' }, 500);
  }
});
