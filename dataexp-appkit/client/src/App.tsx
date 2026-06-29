import { CustomerExportPage } from './pages/CustomerExportPage';

export default function App() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-4 md:px-6 py-3">
        <h1 className="text-lg font-semibold text-foreground">顧客データエクスポート</h1>
        <p className="text-sm text-muted-foreground">training.dsg_vibe.customers</p>
      </header>
      <main className="flex-1 p-4 md:p-6">
        <CustomerExportPage />
      </main>
    </div>
  );
}
