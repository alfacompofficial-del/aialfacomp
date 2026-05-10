## Цель
Добавить в Nexus возможность генерировать файлы (PDF, DOCX, TXT, MD, ZIP со скриптами) прямо в чате. Пользователь скачивает их кнопкой в сообщении.

## Как это работает

```
Пользователь: "Сделай PDF-резюме фронтенд-разработчика"
        ↓
ИИ решает использовать инструмент generate_file
        ↓
Edge function собирает файл → загружает в Storage → возвращает URL
        ↓
В чате появляется карточка: 📄 resume.pdf · 24 KB · [Скачать]
```

## Изменения

### 1. Storage
Новый публичный bucket `generated-files` для готовых артефактов (срок жизни — без ограничений, доступ по прямой ссылке).

### 2. Backend — новый инструмент `generate_file`
В `supabase/functions/_shared/nexus-agent.ts` добавляем инструмент со схемой:
```
{ format: "pdf" | "docx" | "txt" | "md" | "zip",
  filename: string,
  content: string,        // markdown / plain text / описание
  files?: [{name, content}] // только для zip
}
```

Реализация по форматам (всё в Deno, без тяжёлых зависимостей):
- **txt / md** — просто `new Blob([content])`
- **pdf** — библиотека `pdf-lib` (`https://esm.sh/pdf-lib`), парсим markdown в простой текст с заголовками
- **docx** — библиотека `docx` (`https://esm.sh/docx`) — параграфы из markdown
- **zip** — `JSZip` (`https://esm.sh/jszip`), кладём массив файлов внутрь

Файл загружается в bucket `generated-files/{user_id}/{uuid}.{ext}`, возвращаем публичный URL + размер.

### 3. SSE-событие для UI
Агент отправляет клиенту:
```
data: {"meta":{"file":{"name":"resume.pdf","url":"...","size":24576,"mime":"application/pdf"}}}
```

### 4. Frontend (`src/pages/Chat.tsx`)
- Парсим `meta.file` из стрима, сохраняем в attachments последнего сообщения
- В `MessageBubble` добавляем карточку файла: иконка по типу, имя, размер, кнопка «Скачать» (`<a href download>`)
- Сохраняем в БД через колонку `messages.attachments` (уже есть)

### 5. Системный промпт
Добавляем в `BASE_PROMPT` блок:
> Если пользователь просит «сделай pdf / документ / отчёт / скачать файл / архив» — вызывай `generate_file`.

### 6. Лимит
Чтобы не злоупотребляли — 10 файлов в день на пользователя. Используем существующую таблицу-паттерн как у `image_generations`: новая таблица `file_generations (user_id, format, created_at)`.

## Про .exe
Технически собрать Windows .exe в Deno-runtime нельзя. Решение: при запросе «сделай exe» ИИ генерирует **ZIP с готовым `.py` или `.bat` скриптом** + `README.txt` с командой `pyinstaller --onefile script.py` для локальной сборки. В системном промпте это объясняем.

## Технические детали

**Файлы для изменений:**
- `supabase/migrations/...` — bucket `generated-files` + таблица `file_generations` + RLS
- `supabase/functions/_shared/nexus-agent.ts` — новый tool `generate_file`, импорты `pdf-lib`, `docx`, `jszip`, эмиссия `meta.file`
- `src/pages/Chat.tsx` — обработка `meta.file`, рендер карточки файла в `MessageBubble`

**Не меняем:**
- `chat/index.ts` и `public-api/index.ts` — они уже делегируют агенту
- Существующие инструменты (`web_search`, `fetch_url` и т.д.)

**Лимит:** 10 файлов / день / пользователь. Превышение — текстовая ошибка от инструмента.
