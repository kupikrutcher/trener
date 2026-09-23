// Функция Supabase «students»: учитель создаёт учеников, сбрасывает пароли, удаляет.
// Ключ service_role есть только здесь, на сервере Supabase, — на сайт он не попадает.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// Ученики входят по логину; для Supabase он превращается в служебный адрес, писем туда не бывает.
const DOMAIN = "students.example.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const TR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
const translit = (s: string) =>
  s.toLowerCase().split("").map((c) => TR[c] ?? c).join("").replace(/[^a-z0-9]/g, "");

// «Иванов Пётр» → ivanov.p
function baseLogin(name: string) {
  const parts = name.trim().split(/\s+/).map(translit).filter(Boolean);
  if (!parts.length) return "student";
  return (parts[0] + (parts[1] ? "." + parts[1][0] : "")).slice(0, 24);
}

function password() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const b = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b, (x) => abc[x % abc.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: { user }, error: uerr } = await admin.auth.getUser(jwt);
    if (uerr || !user) return json({ error: "Нужно войти" }, 401);
    const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (me?.role !== "teacher") return json({ error: "Только для учителя" }, 403);

    const body = await req.json();

    if (body.action === "create") {
      const names: string[] = (body.names || []).map((s: string) => String(s).trim()).filter(Boolean).slice(0, 200);
      if (!names.length) return json({ error: "Список пуст" }, 400);
      const { data: existing } = await admin.from("profiles").select("login");
      const taken = new Set((existing || []).map((p: { login: string }) => p.login));
      const created = [], failed = [];
      for (const full_name of names) {
        const base = baseLogin(full_name);
        let login = base, k = 2;
        while (taken.has(login)) login = base + k++;
        const pass = password();
        const { data, error } = await admin.auth.admin.createUser({
          email: `${login}@${DOMAIN}`, password: pass, email_confirm: true,
        });
        if (error || !data.user) { failed.push({ full_name, error: error?.message || "ошибка" }); continue; }
        const { error: perr } = await admin.from("profiles").insert({ id: data.user.id, login, full_name, role: "student" });
        if (perr) {
          await admin.auth.admin.deleteUser(data.user.id);
          failed.push({ full_name, error: perr.message });
          continue;
        }
        taken.add(login);
        created.push({ id: data.user.id, full_name, login, password: pass });
      }
      return json({ created, failed });
    }

    if (body.action === "reset") {
      const { data: p } = await admin.from("profiles").select("role").eq("id", body.id).single();
      if (!p || p.role !== "student") return json({ error: "Ученик не найден" }, 404);
      const pass = password();
      const { error } = await admin.auth.admin.updateUserById(body.id, { password: pass });
      if (error) return json({ error: error.message }, 400);
      return json({ password: pass });
    }

    if (body.action === "delete") {
      const { data: p } = await admin.from("profiles").select("role").eq("id", body.id).single();
      if (!p || p.role !== "student") return json({ error: "Ученик не найден" }, 404);
      const { error } = await admin.auth.admin.deleteUser(body.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Неизвестное действие" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
