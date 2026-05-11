/** Normalize captured actions so repeats collapse to one calendar row. */

const SCHEDULE_TYPES = new Set(["calendar", "reminder", "followup"]);
const SCHEDULE_LIKE_TYPES = new Set(["calendar", "reminder", "followup", "note"]);

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normTitle(s) {
  let t = norm(s).replace(/[.!?]+$/g, "").trim();
  t = t.replace(/^(the|a|an)\s+/, "");
  return t.replace(/\s+/g, " ").trim();
}

/** Local YYYY-MM-DD when `when` parses as ISO / Date.parse-able. */
export function dateDedupeKey(when) {
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

/** Same calendar day + clock time (local), ignoring ISO string quirks. */
export function whenDedupeKey(when) {
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

export function actionFingerprint(a) {
  const ty = norm(a.type || "note");
  const title = normTitle(a.title);
  const dk = dateDedupeKey(a.when);

  if (SCHEDULE_TYPES.has(ty) && dk) return `${ty}|${title}|d:${dk}`;

  const wk = whenDedupeKey(a.when);
  if (wk) return `${ty}|${title}|t:${wk}`;

  return `${ty}|${title}|`;
}

/** Match pending (!done) actions only — same task after complete may be added again. */
export function hasDuplicatePending(existingActions, candidate) {
  const fp = actionFingerprint(candidate);
  if (existingActions.some((x) => !x.done && actionFingerprint(x) === fp)) return true;

  const ty = norm(candidate.type || "note");
  if (!SCHEDULE_LIKE_TYPES.has(ty)) return false;
  const ct = normTitle(candidate.title);
  const cdk = dateDedupeKey(candidate.when);

  return existingActions.some((x) => {
    if (x.done) return false;
    const xt = norm(x.type || "note");
    if (!SCHEDULE_LIKE_TYPES.has(xt)) return false;
    if (normTitle(x.title) !== ct) return false;
    const xdk = dateDedupeKey(x.when);
    if (cdk && xdk) return cdk === xdk;
    return true;
  });
}
