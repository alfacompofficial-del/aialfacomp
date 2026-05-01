// One-shot helper: copy uploaded apps from 'apps' bucket to public 'downloads' bucket.
// Call via: curl -X POST https://<project>.supabase.co/functions/v1/copy-apps-to-downloads
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const jobs = [
    { from: "app-debug.apk",     to: "Nexus.apk" },
    { from: "Code Alfacomp.exe", to: "Nexus-win-x64.exe" },
  ];

  const results: Array<Record<string, unknown>> = [];

  // First, remove any stale (broken) DB-only entries in 'downloads'
  for (const j of jobs) {
    await supabase.storage.from("downloads").remove([j.to]).catch(() => {});
  }

  for (const j of jobs) {
    try {
      const { data: blob, error: dlErr } = await supabase.storage.from("apps").download(j.from);
      if (dlErr || !blob) {
        results.push({ file: j.from, ok: false, stage: "download", error: dlErr?.message });
        continue;
      }
      const { error: upErr } = await supabase.storage
        .from("downloads")
        .upload(j.to, blob, {
          upsert: true,
          contentType: j.to.endsWith(".apk")
            ? "application/vnd.android.package-archive"
            : "application/octet-stream",
        });
      if (upErr) {
        results.push({ file: j.from, ok: false, stage: "upload", error: upErr.message });
        continue;
      }
      results.push({ file: j.from, to: j.to, ok: true });
    } catch (e) {
      results.push({ file: j.from, ok: false, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
