/**
 * In-memory stand-in for the subset of the Google Sheets REST API v4 the app
 * uses. It lets the real Google Sheets repositories be exercised end-to-end in
 * tests, without network access or credentials.
 */
type Cell = string | number | boolean | null;

interface FakeSheet {
  sheetId: number;
  title: string;
  rows: Cell[][];
  rowCount: number;
  columnCount: number;
  frozenRowCount: number;
  protectedRanges: Array<{ protectedRangeId: number; description?: string; editors?: unknown; warningOnly?: boolean }>;
}

const letterToIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const indexToLetter = (index: number) => {
  let s = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

interface Ref {
  sheet: FakeSheet;
  startRow: number; // 0-based
  endRow: number | null; // inclusive, null = to end
  startCol: number;
  endCol: number | null;
}

export class FakeSheetsServer {
  readonly sheets = new Map<string, FakeSheet>();
  readonly requests: string[] = [];
  private nextSheetId = 100;
  private nextProtectionId = 1;

  constructor(
    readonly title = 'Milkly test DB',
    /** Simulated network delay [min, max] ms, applied before AND after the server processes a request. */
    private readonly latencyMs: [number, number] = [0, 0],
  ) {
    this.addSheet('Sheet1', 26);
  }

  private async delay() {
    const [min, max] = this.latencyMs;
    if (max > 0) await new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));
  }

  readonly fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    await this.delay(); // request travelling to Google
    const response = this.handle(input, init);
    await this.delay(); // response travelling back
    return response;
  };

  private handle(input: string | URL | Request, init: RequestInit): Response {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const path = decodeURIComponent(url.pathname.replace(/^\/v4\/spreadsheets\/[^/:]+/, ''));
    this.requests.push(`${method} ${path}`);
    try {
      if (method === 'GET' && path === '') return this.json(this.metadata());
      if (method === 'GET' && path === '/values:batchGet') {
        return this.json({ valueRanges: url.searchParams.getAll('ranges').map((range) => ({ range, values: this.read(range) })) });
      }
      if (method === 'PUT' && path.startsWith('/values/')) {
        this.write(path.slice('/values/'.length), body.values);
        return this.json({});
      }
      if (method === 'POST' && path === '/values:batchUpdate') {
        for (const entry of body.data) this.write(entry.range, entry.values);
        return this.json({});
      }
      if (method === 'POST' && path.endsWith(':append')) {
        return this.json({ updates: { updatedRange: this.append(path.slice('/values/'.length, -':append'.length), body.values) } });
      }
      if (method === 'POST' && path === ':batchUpdate') return this.json({ replies: body.requests.map((request: Record<string, unknown>) => this.structural(request)) });
      return this.error(404, 'Not found');
    } catch (error) {
      return this.error(400, (error as Error).message);
    }
  };

  /** Cells of a tab as the human would see them in Sheets (for assertions). */
  table(title: string): Cell[][] {
    return this.sheets.get(title)?.rows ?? [];
  }

  private addSheet(title: string, columnCount = 26, frozenRowCount = 0) {
    const sheet: FakeSheet = { sheetId: this.nextSheetId++, title, rows: [], rowCount: 1000, columnCount, frozenRowCount, protectedRanges: [] };
    this.sheets.set(title, sheet);
    return sheet;
  }

  private metadata() {
    return {
      properties: { title: this.title },
      sheets: [...this.sheets.values()].map((sheet) => ({
        properties: {
          sheetId: sheet.sheetId,
          title: sheet.title,
          gridProperties: { rowCount: sheet.rowCount, columnCount: sheet.columnCount, frozenRowCount: sheet.frozenRowCount },
        },
        protectedRanges: sheet.protectedRanges,
      })),
    };
  }

  private parse(range: string): Ref {
    const match = range.match(/^(?:'((?:[^']|'')+)'|([^!]+))(?:!(.+))?$/);
    if (!match) throw new Error(`Unable to parse range: ${range}`);
    const title = (match[1] ?? match[2]).replace(/''/g, "'");
    const sheet = this.sheets.get(title);
    if (!sheet) throw new Error(`Unable to parse range: ${range}`);
    const ref = match[3];
    if (!ref) return { sheet, startRow: 0, endRow: null, startCol: 0, endCol: null };
    const rows = ref.match(/^(\d+):(\d+)$/);
    if (rows) return { sheet, startRow: Number(rows[1]) - 1, endRow: Number(rows[2]) - 1, startCol: 0, endCol: null };
    const cells = ref.match(/^([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/);
    if (!cells) throw new Error(`Unable to parse range: ${range}`);
    return {
      sheet,
      startCol: letterToIndex(cells[1]),
      startRow: cells[2] ? Number(cells[2]) - 1 : 0,
      endCol: cells[3] ? letterToIndex(cells[3]) : letterToIndex(cells[1]),
      endRow: cells[3] ? (cells[4] ? Number(cells[4]) - 1 : null) : cells[2] ? Number(cells[2]) - 1 : null,
    };
  }

  private read(range: string): Cell[][] {
    const ref = this.parse(range);
    const endRow = ref.endRow ?? ref.sheet.rows.length - 1;
    const out: Cell[][] = [];
    for (let r = ref.startRow; r <= endRow; r += 1) {
      const row = ref.sheet.rows[r] ?? [];
      const endCol = ref.endCol ?? row.length - 1;
      const slice = row.slice(ref.startCol, endCol + 1);
      while (slice.length && (slice[slice.length - 1] === '' || slice[slice.length - 1] == null)) slice.pop();
      out.push(slice);
    }
    while (out.length && out[out.length - 1].length === 0) out.pop();
    return out;
  }

  private write(range: string, values: Cell[][]) {
    const ref = this.parse(range);
    values.forEach((row, i) => {
      const target = (ref.sheet.rows[ref.startRow + i] ??= []);
      row.forEach((value, j) => {
        const column = ref.startCol + j;
        if (column >= ref.sheet.columnCount) throw new Error(`Range ${range} exceeds grid limits`);
        target[column] = value;
      });
    });
  }

  private append(range: string, values: Cell[][]): string {
    const ref = this.parse(range);
    let last = ref.sheet.rows.length - 1;
    while (last >= 0 && (ref.sheet.rows[last] ?? []).every((cell) => cell === '' || cell == null)) last -= 1;
    const start = last + 1;
    values.forEach((row, i) => {
      if (row.length > ref.sheet.columnCount) throw new Error('exceeds grid limits');
      ref.sheet.rows[start + i] = [...row];
    });
    const width = Math.max(...values.map((row) => row.length));
    return `${ref.sheet.title}!A${start + 1}:${indexToLetter(width - 1)}${start + values.length}`;
  }

  private structural(request: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (request.addSheet) {
      const props = request.addSheet.properties;
      const sheet = this.addSheet(props.title, props.gridProperties?.columnCount ?? 26, props.gridProperties?.frozenRowCount ?? 0);
      return { addSheet: { properties: { sheetId: sheet.sheetId, title: sheet.title } } };
    }
    const byId = (id: number) => [...this.sheets.values()].find((sheet) => sheet.sheetId === id)!;
    if (request.updateSheetProperties) {
      const { sheetId, gridProperties } = request.updateSheetProperties.properties;
      Object.assign(byId(sheetId), gridProperties);
      return {};
    }
    if (request.addProtectedRange) {
      const range = request.addProtectedRange.protectedRange;
      byId(range.range.sheetId).protectedRanges.push({ ...range, protectedRangeId: this.nextProtectionId++ });
      return {};
    }
    if (request.updateProtectedRange) {
      for (const sheet of this.sheets.values()) {
        const existing = sheet.protectedRanges.find((r) => r.protectedRangeId === request.updateProtectedRange.protectedRange.protectedRangeId);
        if (existing) Object.assign(existing, request.updateProtectedRange.protectedRange);
      }
      return {};
    }
    throw new Error(`Unsupported request ${Object.keys(request)[0]}`);
  }

  private json(body: unknown) {
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  private error(status: number, message: string) {
    return new Response(JSON.stringify({ error: { code: status, message, status: 'INVALID_ARGUMENT' } }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
