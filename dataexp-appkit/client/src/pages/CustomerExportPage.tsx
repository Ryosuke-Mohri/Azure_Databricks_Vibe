import { useMemo, useState } from 'react';
import {
  useAnalyticsQuery,
  DataTable,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { Download } from 'lucide-react';

const GENDERS = [
  { value: '', label: 'すべて' },
  { value: '男', label: '男' },
  { value: '女', label: '女' },
];

const FLAG_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'true', label: 'はい' },
  { value: 'false', label: 'いいえ' },
];

const CSV_HEADERS = [
  'customer_id',
  'last_name',
  'first_name',
  'birthdate',
  'gender',
  'area',
  'join_date',
  'carlife_square_member',
  'cosmo_card_holder',
] as const;

function toCsvValue(value: string | boolean): string {
  const str = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function CustomerExportPage() {
  const [area, setArea] = useState('');
  const [gender, setGender] = useState('');
  const [carlife, setCarlife] = useState('all');
  const [cosmo, setCosmo] = useState('all');
  const [nameSearch, setNameSearch] = useState('');

  const areasQuery = useAnalyticsQuery('areas', useMemo(() => ({}), []));

  const customerParams = useMemo(
    () => ({
      area: sql.string(area),
      gender: sql.string(gender),
      carlife: sql.string(carlife),
      cosmo: sql.string(cosmo),
      name_search: sql.string(nameSearch),
    }),
    [area, gender, carlife, cosmo, nameSearch],
  );

  const { data, loading, error } = useAnalyticsQuery('customers', customerParams);

  const rowCount = data?.length ?? 0;

  const handleExport = () => {
    if (!data || data.length === 0) return;
    const lines = [
      CSV_HEADERS.join(','),
      ...data.map((row) => CSV_HEADERS.map((h) => toCsvValue(row[h])).join(',')),
    ];
    // BOM付きUTF-8でExcelの日本語文字化けを防ぐ
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'customers_export.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setArea('');
    setGender('');
    setCarlife('all');
    setCosmo('all');
    setNameSearch('');
  };

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>フィルター</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name-search">氏名・顧客ID検索</Label>
              <Input
                id="name-search"
                placeholder="例: 斎藤 / C00376"
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="area-select">エリア（都道府県）</Label>
              <Select value={area || '__all__'} onValueChange={(v) => setArea(v === '__all__' ? '' : v)}>
                <SelectTrigger id="area-select">
                  <SelectValue placeholder="すべて" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">すべて</SelectItem>
                  {areasQuery.data?.map((row) => (
                    <SelectItem key={row.area} value={row.area}>
                      {row.area}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender-select">性別</Label>
              <Select value={gender || '__all__'} onValueChange={(v) => setGender(v === '__all__' ? '' : v)}>
                <SelectTrigger id="gender-select">
                  <SelectValue placeholder="すべて" />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => (
                    <SelectItem key={g.label} value={g.value || '__all__'}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="carlife-select">カーライフスクエア会員</Label>
              <Select value={carlife} onValueChange={setCarlife}>
                <SelectTrigger id="carlife-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FLAG_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cosmo-select">コスモカード保有</Label>
              <Select value={cosmo} onValueChange={setCosmo}>
                <SelectTrigger id="cosmo-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FLAG_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button variant="outline" onClick={resetFilters} className="w-full">
                フィルターをリセット
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CardTitle>検索結果</CardTitle>
            <Badge variant="secondary">{loading ? '読み込み中…' : `${rowCount} 件`}</Badge>
          </div>
          <Button onClick={handleExport} disabled={loading || rowCount === 0}>
            <Download className="h-4 w-4" />
            CSVエクスポート
          </Button>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-destructive bg-destructive/10 p-3 rounded-md text-sm">
              データの取得に失敗しました: {error}
            </div>
          ) : (
            <DataTable
              queryKey="customers"
              parameters={customerParams}
              filterColumn="last_name"
              filterPlaceholder="姓で絞り込み…"
              pageSize={20}
              pageSizeOptions={[10, 20, 50, 100]}
              ariaLabel="顧客データ一覧"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
