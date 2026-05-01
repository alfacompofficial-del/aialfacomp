// Helper: rebuild downloads bucket from files currently sitting in 'apps' bucket.
// Uses raw storage API calls to bypass DB inconsistencies.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const out: any = { steps: [] };

  // 1) List what's actually in apps bucket
  const { data: appsList, error: listErr } = await supabase.storage.from("apps").list("", { limit: 100 });
  out.steps.push({ step: "list-apps", files: appsList, error: listErr?.message });

  // 2) List what's in downloads
  const { data: dlList } = await supabase.storage.from("downloads").list("", { limit: 100 });
  out.steps.push({ step: "list-downloads", files: dlList });

  // 3) Remove broken records in downloads (files with no body)
  const targets = ["Nexus.apk", "Nexus-win-x64.exe"];
  const { data: rmData, error: rmErr } = await supabase.storage.from("downloads").remove(targets);
  out.steps.push({ step: "remove-broken", removed: rmData, error: rmErr?.message });

  // 4) Try to copy from apps -> downloads using storage native copy
  const jobs = [
    { from: "app-debug.apk", to: "Nexus.apk" },
    { from: "Code Alfacomp.exe", to: "Nexus-win-x64.exe" },
  ];

  for (const j of jobs) {
    // Try storage.copy first (server-side, no download)
    const copyRes = await fetch(`${SUPABASE_URL}/storage/v1/object/copy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bucketId: "apps",
        sourceKey: j.from,
        destinationBucket: "downloads",
        destinationKey: j.to,
      }),
    });
    const copyText = await copyRes.text();
    out.steps.push({ step: `copy-${j.from}`, status: copyRes.status, body: copyText });
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
