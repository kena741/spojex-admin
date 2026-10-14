import { SpojexApiError, type SpojexHttp } from "@/lib/api/http";

const ADMIN_TABLES = new Set(["admin", "admin_role", "admin_activity_log"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryResult<T = any> = {
  data: T;
  error: { message: string; code?: string; details?: string } | null;
  count: number | null;
  status: number;
  statusText: string;
};

type FilterFn = (row: Record<string, unknown>) => boolean;

type OrderBy = { column: string; ascending: boolean };

type Embed = {
  table: string;
  alias: string;
  fkColumn: string;
  columns: Set<string>;
  isCount: boolean;
};

function asError(err: unknown): QueryResult<null>["error"] {
  if (err instanceof SpojexApiError) {
    return { message: err.message, code: err.code, details: err.details };
  }
  if (err instanceof Error) return { message: err.message };
  return { message: String(err) };
}

function equals(a: unknown, b: unknown) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === "boolean" || typeof b === "boolean") return a === b || String(a) === String(b);
  return String(a) === String(b);
}

function compare(a: unknown, b: unknown) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  const an = Number(a);
  const bn = Number(b);
  if (!Number.isNaN(an) && !Number.isNaN(bn) && String(a).trim() !== "" && String(b).trim() !== "") {
    if (String(a).match(/^-?\d+(\.\d+)?$/) && String(b).match(/^-?\d+(\.\d+)?$/)) {
      return an === bn ? 0 : an > bn ? 1 : -1;
    }
  }
  const ad = Date.parse(String(a));
  const bd = Date.parse(String(b));
  if (!Number.isNaN(ad) && !Number.isNaN(bd) && String(a).includes("-") && String(b).includes("-")) {
    return ad === bd ? 0 : ad > bd ? 1 : -1;
  }
  return String(a).localeCompare(String(b));
}

function likeToRegex(pattern: string, caseSensitive: boolean) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, caseSensitive ? undefined : "i");
}

function tablePath(table: string) {
  if (ADMIN_TABLES.has(table)) return `/api/v1/admin/data/${table}`;
  return `/api/v1/data/${table}`;
}

export class SpojexQueryBuilder implements PromiseLike<QueryResult> {
  private columns = "*";
  private filters: FilterFn[] = [];
  private orders: OrderBy[] = [];
  private limitN: number | null = null;
  private offsetN = 0;
  private singleMode = false;
  private maybeSingleMode = false;
  private action: "select" | "insert" | "update" | "delete" = "select";
  private payload: unknown = null;
  private returnRows = false;
  private eqHints: Record<string, unknown> = {};
  private inHints: Record<string, unknown[]> = {};
  private headOnly = false;
  private wantCount = false;

  constructor(
    private readonly http: SpojexHttp,
    private readonly table: string,
  ) {}

  select(columns = "*", opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
    this.columns = columns;
    if (this.action === "update" || this.action === "delete" || this.action === "insert") {
      this.returnRows = true;
      return this;
    }
    this.action = "select";
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.headOnly = true;
    return this;
  }

  insert(values: unknown) {
    this.action = "insert";
    this.payload = values;
    return this;
  }

  upsert(values: unknown, _opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    return this.insert(values);
  }

  update(values: Record<string, unknown>) {
    this.action = "update";
    this.payload = values;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => equals(row[column], value));
    this.eqHints[column] = value;
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => !equals(row[column], value));
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push((row) => compare(row[column], value) > 0);
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push((row) => compare(row[column], value) >= 0);
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push((row) => compare(row[column], value) < 0);
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push((row) => compare(row[column], value) <= 0);
    return this;
  }

  like(column: string, pattern: string) {
    const re = likeToRegex(pattern, true);
    this.filters.push((row) => re.test(String(row[column] ?? "")));
    return this;
  }

  ilike(column: string, pattern: string) {
    const re = likeToRegex(pattern, false);
    this.filters.push((row) => re.test(String(row[column] ?? "")));
    return this;
  }

  is(column: string, value: unknown) {
    if (value === null) this.filters.push((row) => row[column] == null);
    else this.filters.push((row) => equals(row[column], value));
    return this;
  }

  in(column: string, values: unknown[]) {
    const set = new Set(values.map((v) => String(v)));
    this.filters.push((row) => set.has(String(row[column])));
    this.inHints[column] = values;
    return this;
  }

  contains(column: string, value: unknown) {
    this.filters.push((row) => {
      const current = row[column];
      if (Array.isArray(current) && Array.isArray(value)) {
        return value.every((v) => current.includes(v));
      }
      if (current && typeof current === "object" && value && typeof value === "object") {
        return Object.entries(value as Record<string, unknown>).every(
          ([k, v]) => (current as Record<string, unknown>)[k] === v,
        );
      }
      return String(current).includes(String(value));
    });
    return this;
  }

  match(query: Record<string, unknown>) {
    for (const [k, v] of Object.entries(query)) this.eq(k, v);
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === "is" && value === null) {
      this.filters.push((row) => row[column] != null);
      return this;
    }
    if (operator === "eq") return this.neq(column, value);
    return this;
  }

  or(filters: string) {
    // Split on top-level commas only (PostgREST-style: col.op.value,...).
    const parts: string[] = [];
    let depth = 0;
    let buf = "";
    for (const ch of filters) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth = Math.max(0, depth - 1);
      if (ch === "," && depth === 0) {
        const part = buf.trim();
        if (part) parts.push(part);
        buf = "";
        continue;
      }
      buf += ch;
    }
    const last = buf.trim();
    if (last) parts.push(last);

    this.filters.push((row) => {
      for (const part of parts) {
        const m = part.trim().match(/^(\w+)\.(eq|neq|is|ilike|like)\.(.*)$/i);
        if (!m) continue;
        const col = m[1];
        const op = m[2].toLowerCase();
        const raw = m[3];
        const value = raw === "null" ? null : raw.replace(/"/g, "");
        const cell = String(row[col] ?? "");
        let ok = false;
        if (op === "eq") {
          ok =
            value == null
              ? row[col] == null
              : value === ""
                ? row[col] == null || cell.trim() === ""
                : equals(row[col], value);
        } else if (op === "neq") ok = !equals(row[col], value);
        else if (op === "is") ok = value === null ? row[col] == null : equals(row[col], value);
        else if (op === "ilike") ok = likeToRegex(value ?? "", false).test(cell);
        else if (op === "like") ok = likeToRegex(value ?? "", true).test(cell);
        if (ok) return true;
      }
      return false;
    });
    return this;
  }

  filter(column: string, operator: string, value: unknown) {
    switch (operator) {
      case "eq":
        return this.eq(column, value);
      case "neq":
        return this.neq(column, value);
      case "gt":
        return this.gt(column, value);
      case "gte":
        return this.gte(column, value);
      case "lt":
        return this.lt(column, value);
      case "lte":
        return this.lte(column, value);
      case "like":
        return this.like(column, String(value));
      case "ilike":
        return this.ilike(column, String(value));
      case "in":
        return this.in(column, Array.isArray(value) ? value : [value]);
      case "is":
        return this.is(column, value);
      default:
        return this;
    }
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: opts?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.limitN = count;
    return this;
  }

  range(from: number, to: number) {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }

  single() {
    this.singleMode = true;
    this.limitN ??= 1;
    return this;
  }

  maybeSingle() {
    this.maybeSingleMode = true;
    this.limitN ??= 1;
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<QueryResult> {
    try {
      switch (this.action) {
        case "insert":
          return this.ok(await this.executeInsert());
        case "update":
          return this.ok(await this.executeUpdate());
        case "delete":
          return this.ok(await this.executeDelete());
        default:
          return this.ok(await this.executeSelect());
      }
    } catch (err) {
      if (err instanceof SpojexApiError && err.status === 401 && this.action === "select") {
        if (this.singleMode || this.maybeSingleMode) {
          return { data: null, error: null, count: null, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
      }
      return {
        data: null,
        error: asError(err),
        count: null,
        status: err instanceof SpojexApiError ? err.status : 500,
        statusText: "ERROR",
      };
    }
  }

  private ok(data: unknown, count?: number | null): QueryResult {
    return {
      // Match untyped Spojex client (`data: any`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: data as any,
      error: null,
      count: count ?? (Array.isArray(data) ? data.length : data == null ? 0 : 1),
      status: 200,
      statusText: "OK",
    };
  }

  private matches(row: Record<string, unknown>) {
    return this.filters.every((f) => f(row));
  }

  private applyOrder(rows: Record<string, unknown>[]) {
    if (!this.orders.length) return rows;
    return [...rows].sort((a, b) => {
      for (const order of this.orders) {
        const cmp = compare(a[order.column], b[order.column]);
        if (cmp !== 0) return order.ascending ? cmp : -cmp;
      }
      return 0;
    });
  }

  private finalize(rows: Record<string, unknown>[]) {
    if (this.headOnly) return null;
    if (this.singleMode) {
      if (!rows.length) {
        throw new SpojexApiError("JSON object requested, multiple (or no) rows returned", 406);
      }
      return rows[0];
    }
    if (this.maybeSingleMode) return rows[0] ?? null;
    return rows;
  }

  private asMapList(raw: unknown): Record<string, unknown>[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
  }

  private async list(query?: Record<string, string>) {
    // Client-side filters (or/ilike/in/…) thin results after fetch — pull a wider
    // page so `.limit(12).or(…ilike…)` still searches beyond the first 12 rows.
    const hasClientFilters = this.filters.length > 0;
    const base = this.limitN == null ? 200 : this.limitN + this.offsetN;
    const pageSize = hasClientFilters
      ? Math.min(Math.max(base, Object.keys(this.inHints).length ? base + 200 : 200), 500)
      : Math.min(Math.max(base, 1), 500);
    const raw = await this.http.get(tablePath(this.table), {
      limit: pageSize,
      offset: 0,
      ...query,
    });
    return this.asMapList(raw);
  }

  private async executeSelect() {
    const idHint = this.eqHints.id;
    if (
      idHint != null &&
      this.filters.length === 1 &&
      Object.keys(this.eqHints).length === 1 &&
      Object.keys(this.inHints).length === 0
    ) {
      try {
        const row = (await this.http.get(`${tablePath(this.table)}/${idHint}`)) as Record<
          string,
          unknown
        > | null;
        const rows = row ? [row] : [];
        const expanded = await this.expandEmbeds(rows);
        if (this.wantCount) {
          const data = this.finalize(expanded);
          return this.wrapCount(data, expanded.length);
        }
        return this.finalize(expanded);
      } catch (err) {
        if (err instanceof SpojexApiError && err.status === 404) {
          if (this.wantCount) return this.wrapCount(this.finalize([]), 0);
          return this.finalize([]);
        }
        throw err;
      }
    }

    let rows = await this.list();
    if (Object.keys(this.eqHints).length) {
      const query: Record<string, string> = {};
      for (const [k, v] of Object.entries(this.eqHints)) {
        if (v != null) query[k] = String(v);
      }
      if (Object.keys(query).length) {
        try {
          const filtered = await this.list(query);
          if (filtered.length || !rows.length) rows = filtered;
        } catch {
          /* keep client-side filter */
        }
      }
    }

    rows = rows.filter((r) => this.matches(r));
    rows = this.applyOrder(rows);
    if (this.offsetN > 0) rows = rows.slice(this.offsetN);
    const total = rows.length;
    if (this.limitN != null && rows.length > this.limitN) rows = rows.slice(0, this.limitN);
    rows = await this.expandEmbeds(rows);
    if (this.wantCount) return this.wrapCount(this.finalize(rows), total);
    return this.finalize(rows);
  }

  private wrapCount(data: unknown, count: number) {
    // Caller of execute() uses ok(); for count we return a special shape via execute override.
    // Instead, stash on a symbol — simpler: return { __count: count, data }.
    return { __spojex_count: count, __spojex_data: data };
  }

  private async executeInsert() {
    const values = this.payload;
    if (values == null) throw new SpojexApiError("Missing insert payload", 400);
    if (Array.isArray(values)) {
      const created: Record<string, unknown>[] = [];
      for (const item of values) {
        const row = (await this.http.post(tablePath(this.table), item)) as Record<string, unknown>;
        created.push(row);
      }
      return this.finalize(created);
    }
    const created = (await this.http.post(tablePath(this.table), values)) as Record<string, unknown>;
    if (this.singleMode || this.maybeSingleMode) return created;
    return [created];
  }

  private async executeUpdate() {
    const payload = this.payload as Record<string, unknown> | null;
    if (!payload) throw new SpojexApiError("Missing update payload", 400);
    const idHint = this.eqHints.id;
    if (idHint != null && this.filters.length === 1) {
      const updated = (await this.http.patch(
        `${tablePath(this.table)}/${idHint}`,
        payload,
      )) as Record<string, unknown>;
      return this.singleMode || this.maybeSingleMode ? updated : [updated];
    }
    const matched = await this.executeSelect();
    const rows = this.unwrapRows(matched);
    const updated: Record<string, unknown>[] = [];
    for (const row of rows) {
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      updated.push(
        (await this.http.patch(`${tablePath(this.table)}/${id}`, payload)) as Record<string, unknown>,
      );
    }
    if (this.singleMode) {
      if (!updated.length) throw new SpojexApiError("No rows updated", 404);
      return updated[0];
    }
    if (this.maybeSingleMode) return updated[0] ?? null;
    return updated;
  }

  private async executeDelete() {
    const idHint = this.eqHints.id;
    if (idHint != null && this.filters.length === 1) {
      await this.http.delete(`${tablePath(this.table)}/${idHint}`);
      return this.returnRows ? [] : null;
    }
    const matched = await this.executeSelect();
    const rows = this.unwrapRows(matched);
    for (const row of rows) {
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      await this.http.delete(`${tablePath(this.table)}/${id}`);
    }
    return this.returnRows ? rows : null;
  }

  private unwrapRows(matched: unknown): Record<string, unknown>[] {
    if (matched && typeof matched === "object" && "__spojex_data" in (matched as object)) {
      matched = (matched as { __spojex_data: unknown }).__spojex_data;
    }
    if (Array.isArray(matched)) {
      return matched.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
    }
    if (matched && typeof matched === "object") return [matched as Record<string, unknown>];
    return [];
  }

  // Override ok path for count wrappers
  private async executeSelectWithCountAware(): Promise<QueryResult> {
    const result = await this.executeSelect();
    if (result && typeof result === "object" && "__spojex_count" in (result as object)) {
      const wrapped = result as { __spojex_count: number; __spojex_data: unknown };
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: wrapped.__spojex_data as any,
        error: null,
        count: wrapped.__spojex_count,
        status: 200,
        statusText: "OK",
      };
    }
    return this.ok(result);
  }

  // Patch execute to use count-aware select — redefine execute properly below via monkeypatch in file
  private async expandEmbeds(rows: Record<string, unknown>[]) {
    if (!rows.length || this.columns.trim() === "*" || !this.columns.includes("(")) return rows;
    const embeds = parseEmbeds(this.columns);
    if (!embeds.length) return rows;
    let result = rows;
    for (const embed of embeds) {
      result = embed.isCount
        ? await this.expandCount(result, embed)
        : await this.expandRelation(result, embed);
    }
    return result;
  }

  private async expandRelation(rows: Record<string, unknown>[], embed: Embed) {
    const ids = new Set(
      rows.map((r) => String(r[embed.fkColumn] ?? "").trim()).filter(Boolean),
    );
    if (!ids.size) {
      return rows.map((r) => ({ ...r, [embed.alias]: null }));
    }
    let related: Record<string, unknown>[] = [];
    try {
      related = this.asMapList(await this.http.get(tablePath(embed.table), { limit: 500 }));
    } catch {
      return rows;
    }
    const byId = new Map<string, Record<string, unknown>>();
    for (const item of related) {
      const id = String(item.id ?? "").trim();
      const userId = String(item.user_id ?? "").trim();
      if (id) byId.set(id, item);
      if (userId && !byId.has(userId)) byId.set(userId, item);
    }
    return rows.map((row) => {
      const relatedRow = byId.get(String(row[embed.fkColumn] ?? ""));
      return {
        ...row,
        [embed.alias]: relatedRow ? project(relatedRow, embed.columns) : null,
      };
    });
  }

  private async expandCount(rows: Record<string, unknown>[], embed: Embed) {
    const parentKey = `${this.table.endsWith("s") ? this.table.slice(0, -1) : this.table}_id`;
    const out: Record<string, unknown>[] = [];
    for (const row of rows) {
      const id = String(row.id ?? "").trim();
      let count = 0;
      if (id) {
        try {
          const related = this.asMapList(
            await this.http.get(tablePath(embed.table), { limit: 500, [parentKey]: id }),
          );
          count = related.filter((r) => String(r[parentKey] ?? "") === id).length;
          if (!count) count = related.filter((r) => String(r.id) === id).length;
        } catch {
          /* ignore */
        }
      }
      out.push({ ...row, [embed.alias]: [{ count }] });
    }
    return out;
  }
}

// Fix execute to use count-aware path — replace method via prototype patch at bottom
const _origExecute = SpojexQueryBuilder.prototype["execute" as never] as (
  this: SpojexQueryBuilder,
) => Promise<QueryResult>;

SpojexQueryBuilder.prototype["execute" as never] = async function (this: SpojexQueryBuilder) {
  try {
    if ((this as unknown as { action: string }).action === "select") {
      return await (this as unknown as { executeSelectWithCountAware: () => Promise<QueryResult> }).executeSelectWithCountAware();
    }
    return await _origExecute.call(this);
  } catch (err) {
    return {
      data: null,
      error: asError(err),
      count: null,
      status: err instanceof SpojexApiError ? err.status : 500,
      statusText: "ERROR",
    };
  }
} as never;

function project(row: Record<string, unknown>, columns: Set<string>) {
  if (!columns.size || columns.has("*")) return row;
  const out: Record<string, unknown> = {};
  for (const key of columns) {
    if (key in row) out[key] = row[key];
  }
  return out;
}

function parseEmbeds(columns: string): Embed[] {
  const embeds: Embed[] = [];
  const re = /([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?(?:![a-zA-Z0-9_]+)?\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(columns))) {
    const aliasOrTable = match[1];
    const fkOrNull = match[2];
    const inner = match[3].trim();
    const isCount = inner === "count";
    const tableName = aliasOrTable;
    const alias = aliasOrTable;
    const fk =
      fkOrNull ??
      (tableName.endsWith("s") ? `${tableName.slice(0, -1)}_id` : `${tableName}_id`);
    const resolvedFk =
      alias === "users"
        ? fkOrNull ?? "user_id"
        : alias === "gyms"
          ? fkOrNull ?? "gym_id"
          : alias === "stadiums"
            ? fkOrNull ?? "stadium_id"
            : alias === "events"
              ? fkOrNull ?? "event_id"
              : alias === "services"
                ? fkOrNull ?? "service_id"
                : alias === "gym_members"
                  ? fkOrNull ?? "member_id"
                  : fk;
    const cols = isCount
      ? new Set<string>()
      : new Set(
          inner
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
        );
    embeds.push({
      table: tableName,
      alias,
      fkColumn: resolvedFk,
      columns: cols,
      isCount,
    });
  }
  return embeds;
}
