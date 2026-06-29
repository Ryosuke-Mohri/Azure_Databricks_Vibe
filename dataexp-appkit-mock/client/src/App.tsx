import { useMemo, useState } from 'react';
import {
  useAnalyticsQuery,
  Button,
  Input,
  Label,
  Badge,
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  BarChart,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { ChevronDown, X, Download, Save, Search, Bookmark } from 'lucide-react';

// ── 列定義 ───────────────────────────────────────────────────────────────────
type ColumnKey =
  | 'customer_id'
  | 'last_name'
  | 'first_name'
  | 'birthdate'
  | 'gender'
  | 'area'
  | 'join_date'
  | 'carlife_square_member'
  | 'cosmo_card_holder';

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'customer_id', label: '顧客ID' },
  { key: 'last_name', label: '姓' },
  { key: 'first_name', label: '名' },
  { key: 'birthdate', label: '生年月日' },
  { key: 'gender', label: '性別' },
  { key: 'area', label: '地域' },
  { key: 'join_date', label: '入会日' },
  { key: 'carlife_square_member', label: 'カーライフスクエア会員' },
  { key: 'cosmo_card_holder', label: 'コスモカード保有' },
];

const GENDERS = ['男', '女'];
const PREVIEW_LIMIT = 1000;
const DATE_MIN = '2018-01-01';
const DATE_MAX = '2024-12-31';

type TriState = '' | 'true' | 'false';

interface FilterState {
  areas: string[];
  genders: string[];
  carlife: TriState;
  cosmo: TriState;
  joinFrom: string;
  joinTo: string;
  columns: ColumnKey[];
}

const DEFAULT_FILTER: FilterState = {
  areas: [],
  genders: [],
  carlife: '',
  cosmo: '',
  joinFrom: DATE_MIN,
  joinTo: DATE_MAX,
  columns: COLUMNS.map((c) => c.key),
};

type CustomerRow = {
  customer_id: string;
  last_name: string;
  first_name: string;
  birthdate: string;
  gender: string;
  area: string;
  join_date: string;
  carlife_square_member: boolean;
  cosmo_card_holder: boolean;
};

export default function App() {
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [mode, setMode] = useState<'filter' | 'saved'>('filter');
  const [filterName, setFilterName] = useState('');
  const [format, setFormat] = useState<'csv' | 'excel' | 'json'>('csv');
  const [notice, setNotice] = useState<string | null>(null);
  const [savedRefresh, setSavedRefresh] = useState('0');
  const [saving, setSaving] = useState(false);

  const queryParams = useMemo(
    () => ({
      areas: sql.string(filter.areas.join(',')),
      genders: sql.string(filter.genders.join(',')),
      carlife: sql.string(filter.carlife),
      cosmo: sql.string(filter.cosmo),
      join_from: sql.date(filter.joinFrom || DATE_MIN),
      join_to: sql.date(filter.joinTo || DATE_MAX),
    }),
    [filter.areas, filter.genders, filter.carlife, filter.cosmo, filter.joinFrom, filter.joinTo],
  );

  const previewParams = useMemo(
    () => ({ ...queryParams, row_limit: sql.int(PREVIEW_LIMIT) }),
    [queryParams],
  );

  const areasQuery = useAnalyticsQuery('customer_areas', {});
  const countsQuery = useAnalyticsQuery('customers_counts', queryParams);
  const previewQuery = useAnalyticsQuery('customers_filtered', previewParams);
  const savedQuery = useAnalyticsQuery('saved_filters_list', { refresh: sql.string(savedRefresh) });

  const areaOptions = (areasQuery.data ?? []).map((r) => r.area);
  const totalCount = countsQuery.data?.[0]?.total_count ?? 0;
  const filteredCount = countsQuery.data?.[0]?.filtered_count ?? 0;
  const rows = (previewQuery.data ?? []) as CustomerRow[];
  const selectedColumns = COLUMNS.filter((c) => filter.columns.includes(c.key));

  // ── ヘルパー ────────────────────────────────────────────────────────────────
  function toggleArray<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function formatCell(row: CustomerRow, key: ColumnKey) {
    const v = row[key];
    if (typeof v === 'boolean') return v ? '✓' : '';
    return String(v ?? '');
  }

  // ── エクスポート ──────────────────────────────────────────────────────────
  function download(content: string, mime: string, ext: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers_export.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportData() {
    if (rows.length === 0) return;
    const cols = selectedColumns;
    if (format === 'json') {
      const out = rows.map((r) =>
        Object.fromEntries(cols.map((c) => [c.key, r[c.key]])),
      );
      download(JSON.stringify(out, null, 2), 'application/json', 'json');
      return;
    }
    const header = cols.map((c) => c.label);
    const body = rows.map((r) =>
      cols.map((c) => {
        const v = r[c.key];
        return typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v ?? '');
      }),
    );
    if (format === 'csv') {
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      const csv = [header, ...body].map((row) => row.map(esc).join(',')).join('\r\n');
      download('﻿' + csv, 'text/csv;charset=utf-8', 'csv');
    } else {
      download(buildExcelXml(header, body), 'application/vnd.ms-excel', 'xls');
    }
  }

  // ── 保存フィルタ ──────────────────────────────────────────────────────────
  async function readError(res: Response, fallback: string): Promise<string> {
    try {
      const body: unknown = await res.json();
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
        return body.error;
      }
    } catch {
      // ignore
    }
    return fallback;
  }

  async function saveFilter() {
    if (!filterName.trim()) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: filterName.trim(), filters: JSON.stringify(filter) }),
      });
      if (!res.ok) throw new Error(await readError(res, '保存に失敗しました'));
      setNotice(`フィルタ「${filterName.trim()}」を保存しました。`);
      setFilterName('');
      setSavedRefresh((n) => String(Number(n) + 1));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  function restoreFilter(raw: string, name: string) {
    try {
      const parsed = JSON.parse(raw) as Partial<FilterState>;
      setFilter({ ...DEFAULT_FILTER, ...parsed });
      setMode('filter');
      setNotice(`保存フィルタ「${name}」を復元しました。`);
    } catch {
      setNotice('保存フィルタの読み込みに失敗しました。');
    }
  }

  async function deleteFilter(id: string) {
    try {
      const res = await fetch(`/api/filters/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, '削除に失敗しました'));
      setSavedRefresh((n) => String(Number(n) + 1));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '削除に失敗しました');
    }
  }

  const chartData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.area, (counts.get(r.area) ?? 0) + 1);
    return [...counts.entries()]
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── 左パネル：フィルタ ──────────────────────────────────────────── */}
      <aside className="w-80 shrink-0 border-r bg-muted/30 p-5 space-y-5 overflow-y-auto h-screen">
        <h2 className="text-lg font-bold">フィルタ</h2>
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as 'filter' | 'saved')}
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="filter" id="mode-filter" />
            <Label htmlFor="mode-filter" className="flex items-center gap-1 cursor-pointer">
              <Search className="h-4 w-4" /> フィルタ
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="saved" id="mode-saved" />
            <Label htmlFor="mode-saved" className="flex items-center gap-1 cursor-pointer">
              <Bookmark className="h-4 w-4" /> 保存フィルタ
            </Label>
          </div>
        </RadioGroup>

        <Separator />

        {notice && (
          <div className="bg-emerald-50 text-emerald-800 text-sm rounded-md p-3 border border-emerald-200">
            {notice}
          </div>
        )}

        {mode === 'filter' ? (
          <div className="space-y-5">
            {/* 地域 */}
            <MultiSelectField
              label="地域"
              placeholder="地域を選択"
              options={areaOptions}
              selected={filter.areas}
              loading={areasQuery.loading}
              onToggle={(v) => setFilter((f) => ({ ...f, areas: toggleArray(f.areas, v) }))}
              onClear={() => setFilter((f) => ({ ...f, areas: [] }))}
            />

            {/* 性別 */}
            <MultiSelectField
              label="性別"
              placeholder="性別を選択"
              options={GENDERS}
              selected={filter.genders}
              onToggle={(v) => setFilter((f) => ({ ...f, genders: toggleArray(f.genders, v) }))}
              onClear={() => setFilter((f) => ({ ...f, genders: [] }))}
            />

            {/* カーライフスクエア会員 */}
            <TriStateField
              label="カーライフスクエア会員"
              value={filter.carlife}
              trueLabel="会員のみ"
              falseLabel="非会員のみ"
              onChange={(v) => setFilter((f) => ({ ...f, carlife: v }))}
            />

            {/* コスモカード保有 */}
            <TriStateField
              label="コスモカード保有"
              value={filter.cosmo}
              trueLabel="保有のみ"
              falseLabel="非保有のみ"
              onChange={(v) => setFilter((f) => ({ ...f, cosmo: v }))}
            />

            {/* 入会日範囲 */}
            <div className="space-y-2">
              <Label>入会日 (範囲)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={filter.joinFrom}
                  min={DATE_MIN}
                  max={DATE_MAX}
                  onChange={(e) => setFilter((f) => ({ ...f, joinFrom: e.target.value }))}
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="date"
                  value={filter.joinTo}
                  min={DATE_MIN}
                  max={DATE_MAX}
                  onChange={(e) => setFilter((f) => ({ ...f, joinTo: e.target.value }))}
                />
              </div>
            </div>

            {/* 出力する列 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>出力する列</Label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setFilter((f) => ({ ...f, columns: [] }))}
                >
                  クリア
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 rounded-md border bg-background p-2">
                {COLUMNS.map((c) => {
                  const active = filter.columns.includes(c.key);
                  return (
                    <Badge
                      key={c.key}
                      variant={active ? 'default' : 'outline'}
                      className="cursor-pointer select-none"
                      onClick={() =>
                        setFilter((f) => ({ ...f, columns: toggleArray(f.columns, c.key) }))
                      }
                    >
                      {c.label}
                      {active && <X className="ml-1 h-3 w-3" />}
                    </Badge>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* 条件を保存 */}
            <div className="space-y-3">
              <h3 className="font-bold">条件を保存</h3>
              <div className="space-y-2">
                <Label htmlFor="filter-name">フィルタ名</Label>
                <Input
                  id="filter-name"
                  placeholder="例: 関東・女性・会員"
                  value={filterName}
                  onChange={(e) => setFilterName(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                className="w-full"
                disabled={!filterName.trim() || saving}
                onClick={() => void saveFilter()}
              >
                <Save className="mr-2 h-4 w-4" />
                この条件を保存
              </Button>
            </div>
          </div>
        ) : (
          <SavedFiltersList
            loading={savedQuery.loading}
            items={savedQuery.data ?? []}
            onRestore={restoreFilter}
            onDelete={deleteFilter}
          />
        )}
      </aside>

      {/* ── メインコンテンツ ───────────────────────────────────────────── */}
      <main className="flex-1 p-8 overflow-y-auto h-screen">
        <h1 className="text-3xl font-bold mb-2">🚗 Cosmo 顧客データエクスポート</h1>
        <p className="text-sm text-muted-foreground mb-6">
          データソース:{' '}
          <code className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
            training.dsg_vibe.customers
          </code>
        </p>

        {/* KPI */}
        <div className="grid grid-cols-3 gap-6 mb-8 max-w-3xl">
          <Kpi label="全件数" value={totalCount} loading={countsQuery.loading} />
          <Kpi label="抽出件数" value={filteredCount} loading={countsQuery.loading} />
          <Kpi label="出力列数" value={selectedColumns.length} />
        </div>

        {/* プレビュー */}
        <h2 className="text-2xl font-bold mb-4">プレビュー</h2>
        <Tabs defaultValue="table">
          <TabsList className="mb-4">
            <TabsTrigger value="table">📋 テーブル</TabsTrigger>
            <TabsTrigger value="chart">📊 グラフ</TabsTrigger>
          </TabsList>

          <TabsContent value="table">
            {previewQuery.loading ? (
              <Skeleton className="h-80 w-full" />
            ) : previewQuery.error ? (
              <div className="text-destructive bg-destructive/10 p-3 rounded-md">
                {previewQuery.error}
              </div>
            ) : (
              <div className="rounded-lg border overflow-auto max-h-[28rem]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-right text-muted-foreground font-medium w-12">
                        #
                      </th>
                      {selectedColumns.map((c) => (
                        <th key={c.key} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 200).map((row, i) => (
                      <tr key={row.customer_id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 text-right text-muted-foreground">{i + 1}</td>
                        {selectedColumns.map((c) => (
                          <td key={c.key} className="px-3 py-2 whitespace-nowrap">
                            {typeof row[c.key] === 'boolean' ? (
                              <Checkbox checked={row[c.key] as boolean} disabled />
                            ) : (
                              formatCell(row, c.key)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td
                          colSpan={selectedColumns.length + 1}
                          className="px-3 py-8 text-center text-muted-foreground"
                        >
                          該当するデータがありません
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {rows.length > 200 && (
              <p className="text-xs text-muted-foreground mt-2">
                先頭 200 件を表示中（エクスポートは全 {rows.length} 件）
              </p>
            )}
          </TabsContent>

          <TabsContent value="chart">
            {chartData.length > 0 ? (
              <div className="rounded-lg border p-4">
                <BarChart
                  data={chartData}
                  xKey="area"
                  yKey="count"
                  title="地域別 抽出件数"
                  height={360}
                />
              </div>
            ) : (
              <div className="text-muted-foreground p-8 text-center">表示するデータがありません</div>
            )}
          </TabsContent>
        </Tabs>

        {/* エクスポート */}
        <h2 className="text-2xl font-bold mt-10 mb-4">エクスポート</h2>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>フォーマット</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as 'csv' | 'excel' | 'json')}
              className="flex gap-6"
            >
              {(['csv', 'excel', 'json'] as const).map((f) => (
                <div key={f} className="flex items-center gap-2">
                  <RadioGroupItem value={f} id={`fmt-${f}`} />
                  <Label htmlFor={`fmt-${f}`} className="cursor-pointer">
                    {f === 'csv' ? 'CSV' : f === 'excel' ? 'Excel' : 'JSON'}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <Button onClick={exportData} disabled={rows.length === 0 || selectedColumns.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            {format === 'csv' ? 'CSV' : format === 'excel' ? 'Excel' : 'JSON'} をダウンロード
          </Button>
        </div>
      </main>
    </div>
  );
}

// ── 小コンポーネント ────────────────────────────────────────────────────────
function Kpi({ label, value, loading }: { label: string; value: number; loading?: boolean }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground mb-1">{label}</div>
      {loading ? (
        <Skeleton className="h-9 w-20" />
      ) : (
        <div className="text-4xl font-bold">{value.toLocaleString()}</div>
      )}
    </div>
  );
}

function MultiSelectField({
  label,
  placeholder,
  options,
  selected,
  loading,
  onToggle,
  onClear,
}: {
  label: string;
  placeholder: string;
  options: string[];
  selected: string[];
  loading?: boolean;
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm"
          >
            <span className="flex flex-wrap gap-1">
              {selected.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : (
                selected.map((s) => (
                  <Badge key={s} variant="default" className="gap-1">
                    {s}
                    <X
                      className="h-3 w-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggle(s);
                      }}
                    />
                  </Badge>
                ))
              )}
            </span>
            <span className="flex items-center gap-1">
              {selected.length > 0 && (
                <X
                  className="h-4 w-4 text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClear();
                  }}
                />
              )}
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0 max-h-72 overflow-y-auto" align="start">
          {loading ? (
            <div className="p-3">
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <div className="p-1">
              {options.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
                >
                  <Checkbox checked={selected.includes(opt)} onCheckedChange={() => onToggle(opt)} />
                  {opt}
                </label>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function TriStateField({
  label,
  value,
  trueLabel,
  falseLabel,
  onChange,
}: {
  label: string;
  value: TriState;
  trueLabel: string;
  falseLabel: string;
  onChange: (v: TriState) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value === '' ? 'all' : value} onValueChange={(v) => onChange(v === 'all' ? '' : (v as TriState))}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">すべて</SelectItem>
          <SelectItem value="true">{trueLabel}</SelectItem>
          <SelectItem value="false">{falseLabel}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function SavedFiltersList({
  loading,
  items,
  onRestore,
  onDelete,
}: {
  loading: boolean;
  items: Array<{ id: string; name: string; filters: string; created_at: string }>;
  onRestore: (raw: string, name: string) => void;
  onDelete: (id: string) => void | Promise<void>;
}) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">保存されたフィルタはありません。</p>;
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div
          key={it.id}
          className="flex items-center justify-between gap-2 rounded-md border bg-background p-3"
        >
          <button
            type="button"
            className="flex-1 text-left"
            onClick={() => onRestore(it.filters, it.name)}
          >
            <div className="font-medium text-sm">{it.name}</div>
            <div className="text-xs text-muted-foreground">{it.created_at?.slice(0, 19)}</div>
          </button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(it.id)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// SpreadsheetML (Excel が開ける XML) を生成
function buildExcelXml(header: string[], body: string[][]): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cell = (s: string) => `<Cell><Data ss:Type="String">${esc(s)}</Data></Cell>`;
  const row = (cells: string[]) => `<Row>${cells.map(cell).join('')}</Row>`;
  const rowsXml = [row(header), ...body.map(row)].join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="customers"><Table>${rowsXml}</Table></Worksheet>
</Workbook>`;
}
