// supabase/functions/timetrack-sweep/index.ts
// Closes out incomplete shifts (TRD 5.2). Invoked every 15 min by pg_cron;
// each user is swept only once their local clock passes their sweep_time.
//
// Rules, per local work_date:
//   clock_out, no clock_in   -> clock_in  at assumed_clock_in  (05:50)
//   clock_in,  no clock_out  -> clock_out at assumed_clock_out (18:10)
//   lunch_out, no lunch_in   -> lunch_in  at lunch_out + assumed_lunch_minutes
//   lunch_in,  no lunch_out  -> lunch_out at lunch_in  - assumed_lunch_minutes
//   no lunch punches at all  -> no row; v_daily_hours deducts assumed_lunch_minutes
// Every generated punch is is_assumed = true and stays editable in History.
//
// Idempotent: partial unique index (user_id, work_date, punch_type) where
// source = 'sweep', plus the last_swept_date watermark.

import { createClient } from "jsr:@supabase/supabase-js@2";

type PunchType = "clock_in" | "lunch_out" | "lunch_in" | "clock_out";

interface Settings {
  user_id: string;
  timezone: string;
  sweep_time: string;
  assumed_clock_in: string;
  assumed_clock_out: string;
  assumed_lunch_minutes: number;
  last_swept_date: string | null;
  day_start_hour: number;
  missing_punch_mode: "assume" | "flag";
}

interface Punch {
  punch_type: PunchType;
  punched_at: string;
}

interface SweepResult {
  user_id: string;
  days: string[];
  inserted: number;
  skipped: string[];
}

const MAX_BACKFILL_DAYS = 14;
const MIN = 60_000;

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false }, db: { schema: "timetrack" } },
);

/* ---------------- Timezone helpers ---------------- */

function tzParts(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

function tzOffsetMs(d: Date, tz: string): number {
  const p = tzParts(d, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(d.getTime() / 1000) * 1000;
}

/** Wall-clock date + time in tz -> UTC instant. Two passes for DST edges. */
function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = tzOffsetMs(new Date(guess), tz);
  let utc = guess - off1;
  const off2 = tzOffsetMs(new Date(utc), tz);
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

function localDate(d: Date, tz: string): string {
  const p = tzParts(d, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

function localMinutes(d: Date, tz: string): number {
  const p = tzParts(d, tz);
  return p.h * 60 + p.min;
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const hhmm = (t: string) => t.slice(0, 5);

/* ---------------- Core sweep ---------------- */

/** Last work date that is safe to sweep. Work dates are shifted by
    day_start_hour so overnight shifts (e.g. 4 PM to 1 AM) stay whole. */
function sweepTarget(s: Settings, now: Date): string {
  const shiftedToday = localDate(new Date(now.getTime() - s.day_start_hour * 3_600_000), s.timezone);
  const passed = localMinutes(now, s.timezone) >= toMinutes(s.sweep_time);
  return addDays(shiftedToday, passed ? -1 : -2);
}

/** Wall-clock time on a work date; times before the day boundary belong to the next calendar day. */
function workTime(s: Settings, day: string, time: string): Date {
  const cal = toMinutes(time) < s.day_start_hour * 60 ? addDays(day, 1) : day;
  return zonedToUtc(cal, time, s.timezone);
}

function assumed(s: Settings, type: PunchType, at: Date, note: string) {
  return {
    user_id: s.user_id,
    punched_at: at.toISOString(),
    punch_type: type,
    source: "sweep",
    is_assumed: true,
    assumption_notes: note,
  };
}

async function sweepDay(s: Settings, day: string, result: SweepResult) {
  const { data, error } = await db
    .from("time_entries")
    .select("punch_type, punched_at")
    .eq("user_id", s.user_id)
    .eq("work_date", day)
    .is("deleted_at", null)
    .order("punched_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as Punch[];
  if (rows.length === 0) return;

  const find = (t: PunchType) => rows.find((r) => r.punch_type === t);
  const first = new Date(rows[0].punched_at);
  const last = new Date(rows[rows.length - 1].punched_at);
  const lunchMs = s.assumed_lunch_minutes * MIN;
  const inserts: ReturnType<typeof assumed>[] = [];

  // Lunch pair first, so clock-out bounds account for an assumed lunch_in
  const lOut = find("lunch_out");
  const lIn = find("lunch_in");
  let effectiveLast = last;

  if (lOut && !lIn) {
    const at = new Date(new Date(lOut.punched_at).getTime() + lunchMs);
    inserts.push(assumed(s, "lunch_in", at,
      `Missing lunch in; assumed ${s.assumed_lunch_minutes} min after lunch out`));
    if (at > effectiveLast) effectiveLast = at;
  }
  if (lIn && !lOut) {
    const at = new Date(new Date(lIn.punched_at).getTime() - lunchMs);
    inserts.push(assumed(s, "lunch_out", at,
      `Missing lunch out; assumed ${s.assumed_lunch_minutes} min before lunch in`));
  }

  if (find("clock_out") && !find("clock_in")) {
    const at = workTime(s, day, s.assumed_clock_in);
    if (at < first) {
      inserts.push(assumed(s, "clock_in", at, `Missing clock in; assumed ${hhmm(s.assumed_clock_in)}`));
    } else {
      result.skipped.push(`${day}: assumed clock_in not before first punch`);
    }
  }

  if (find("clock_in") && !find("clock_out")) {
    const at = workTime(s, day, s.assumed_clock_out);
    if (at > effectiveLast) {
      inserts.push(assumed(s, "clock_out", at, `Missing clock out; assumed ${hhmm(s.assumed_clock_out)}`));
    } else {
      result.skipped.push(`${day}: last punch is after assumed clock_out`);
    }
  }

  // onConflict can't target a partial unique index; 23505 means already swept.
  for (const row of inserts) {
    const { error: e } = await db.from("time_entries").insert(row);
    if (e && e.code !== "23505") throw e;
    if (!e) result.inserted++;
  }
}

async function sweepUser(s: Settings, now: Date): Promise<SweepResult> {
  const result: SweepResult = { user_id: s.user_id, days: [], inserted: 0, skipped: [] };
  const target = sweepTarget(s, now);
  const floor = addDays(target, -MAX_BACKFILL_DAYS + 1);

  let start = s.last_swept_date ? addDays(s.last_swept_date, 1) : floor;
  if (start < floor) start = floor;
  if (start > target) return result;

  for (let day = start; day <= target; day = addDays(day, 1)) {
    // "flag" users: never invent punches; incomplete days are shown for manual fixing
    if (s.missing_punch_mode === "assume") await sweepDay(s, day, result);
    result.days.push(day);
  }

  const { error } = await db
    .from("user_settings")
    .update({ last_swept_date: target })
    .eq("user_id", s.user_id);
  if (error) throw error;

  return result;
}

/* ---------------- HTTP entry ---------------- */

Deno.serve(async (req) => {
  // Secret lives in Vault; verified by a service_role-only RPC, so there is
  // no copy of it in function env vars to keep in sync.
  const provided = req.headers.get("x-cron-secret") ?? "";
  const { data: ok, error: authErr } = await db.rpc("check_cron_secret", { p_secret: provided });
  if (authErr || ok !== true) {
    return new Response("unauthorized", { status: 401 });
  }

  const now = new Date();
  const { data: users, error } = await db
    .from("user_settings")
    .select("user_id, timezone, sweep_time, assumed_clock_in, assumed_clock_out, assumed_lunch_minutes, last_swept_date, day_start_hour, missing_punch_mode");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results: SweepResult[] = [];
  const failures: { user_id: string; error: string }[] = [];

  for (const s of users as Settings[]) {
    try {
      results.push(await sweepUser(s, now));
    } catch (e) {
      failures.push({ user_id: s.user_id, error: (e as Error).message });
    }
  }

  return Response.json({ ran_at: now.toISOString(), results, failures }, {
    status: failures.length ? 207 : 200,
  });
});
