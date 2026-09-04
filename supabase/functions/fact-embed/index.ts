import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// gte-small embedder for fact-hunt semantic dedupe (questions + fact_hunt_entries).
// verify_jwt=true on the function means Supabase's edge runtime already checked
// the caller's Authorization header before this code runs.
// Three call shapes:
//   query (dedupe-check a not-yet-inserted candidate): POST { query: string }        -> { embedding: number[] }
//   batch backfill:                                    POST { rows: [{ table, id, content }] }  (<=200) -> { updated, failed }
//   database webhook:                                  POST { table, record }        -> { ok }
const model = new Supabase.ai.Session("gte-small");

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);

const CONTENT_BY_TABLE: Record<string, (r: Record<string, unknown>) => string> = {
  questions: (r) => `${r.answer ?? ""} ${r.text ?? ""}`,
  fact_hunt_entries: (r) => `${r.answer ?? ""} ${r.fact ?? ""}`,
};

async function embed(content: string) {
  return await model.run(content, { mean_pool: true, normalize: true });
}

async function embedAndStore(table: string, id: string, content: string) {
  const embedding = await embed(content);
  const { error } = await supabaseAdmin
    .from(table)
    .update({ embedding: JSON.stringify(embedding) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400 });
  }

  // Query shape: embed a candidate's text without writing anything (dedupe check pre-insert).
  if (typeof body.query === "string") {
    const embedding = await embed(body.query);
    return new Response(JSON.stringify({ embedding }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Database Webhook shape: { type: 'INSERT', table, record, schema }
  if (body.record && body.table) {
    const table = body.table as string;
    const contentFn = CONTENT_BY_TABLE[table];
    if (!contentFn) {
      return new Response(JSON.stringify({ error: `unknown table ${table}` }), { status: 400 });
    }
    try {
      await embedAndStore(table, String(body.record.id), contentFn(body.record));
    } catch (e) {
      console.warn(e instanceof Error ? e.message : String(e));
      return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }));
  }

  // Batch backfill shape: { rows: [{ table, id, content }] }
  if (Array.isArray(body.rows)) {
    const rows = body.rows as { table: string; id: string; content: string }[];
    if (rows.length === 0 || rows.length > 200) {
      return new Response(JSON.stringify({ error: "rows must be 1-200 items" }), { status: 400 });
    }
    let updated = 0;
    const failed: { id: string; error: string }[] = [];
    for (const row of rows) {
      try {
        await embedAndStore(row.table, row.id, row.content);
        updated++;
      } catch (e) {
        failed.push({ id: row.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return new Response(JSON.stringify({ updated, failed }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "body must have `query`, `rows`, or `record`+`table`" }), { status: 400 });
});
