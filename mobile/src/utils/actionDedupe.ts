import type { CapturedAction } from "@/context/EchoContext";

/** Types where repeating the same event on the same calendar day should stay one row. */
const SCHEDULE_TYPES = new Set(["calendar", "reminder", "followup"]);

/** Calendar-ish rows that often flip type / date across transcript chunks (note vs calendar). */
const SCHEDULE_LIKE_TYPES = new Set(["calendar", "reminder", "followup", "note"]);

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Strip trailing punctuation and light article prefixes so "The algebra exam" ≡ "Algebra exam". */
function normTitle(s: string | null | undefined): string {
  let t = norm(s).replace(/[.!?]+$/g, "").trim();
  t = t.replace(/^(the|a|an)\s+/, "");
  return t.replace(/\s+/g, " ").trim();
}

/** Local calendar date only — merges flaky clock times for the same exam/meeting on one day. */
export function dateDedupeKey(when: string | null | undefined): string {
  const raw = String(when ?? "").trim();
  if (!raw) return "";
  const t = Date.parse(raw);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }
  return "";
}

/**
 * Canonical slot for "same calendar day + same clock time" regardless of ISO formatting.
 */
export function whenDedupeKey(when: string | null | undefined): string {
  const raw = String(when ?? "").trim();
  if (!raw) return "";
  const t = Date.parse(raw);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    const mins = d.getHours() * 60 + d.getMinutes();
    return `${y}-${mo}-${da}_${mins}`;
  }
  return norm(raw);
}

export function actionFingerprint(a: {
  title: string;
  detail?: string | null;
  when?: string | null;
  type?: string | null;
}): string {
  const ty = norm(a.type || "note");
  const title = normTitle(a.title);
  const dk = dateDedupeKey(a.when);

  // Same calendar / reminder / follow-up title on the same local day ⇒ one pending row
  // (repeated transcript mentions → stable dedupe even if ISO times shift slightly).
  if (SCHEDULE_TYPES.has(ty) && dk) return `${ty}|${title}|d:${dk}`;

  const wk = whenDedupeKey(a.when);
  if (wk) return `${ty}|${title}|t:${wk}`;

  // Undated or unparseable when: never key on detail — LLM rephrases every chunk.
  return `${ty}|${title}|`;
}

export function hasDuplicatePending(actions: CapturedAction[], candidate: Parameters<typeof actionFingerprint>[0]): boolean {
  const fp = actionFingerprint(candidate);
  if (actions.some((x) => !x.done && actionFingerprint(x) === fp)) return true;

  const ty = norm(candidate.type || "note");
  if (!SCHEDULE_LIKE_TYPES.has(ty)) return false;
  const ct = normTitle(candidate.title);
  const cdk = dateDedupeKey(candidate.when);

  return actions.some((x) => {
    if (x.done) return false;
    const xt = norm(x.type || "note");
    if (!SCHEDULE_LIKE_TYPES.has(xt)) return false;
    if (normTitle(x.title) !== ct) return false;
    const xdk = dateDedupeKey(x.when);
    if (cdk && xdk) return cdk === xdk;
    // Same title but date missing on one side (or both) → treat as the same repeated mention.
    return true;
  });
}
