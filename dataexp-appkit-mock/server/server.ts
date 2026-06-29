import { createApp, analytics, server, getExecutionContext } from '@databricks/appkit';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

const SAVED_FILTERS_TABLE = 'training.dsg_vibe.saved_filters';

const saveFilterSchema = z.object({
  name: z.string().min(1).max(200),
  filters: z.string().min(1).max(100000),
});

async function execStatement(statement: string, parameters: Array<{ name: string; value: string; type?: string }>) {
  const ctx = getExecutionContext();
  const warehouseId = (await ctx.warehouseId) ?? process.env.DATABRICKS_WAREHOUSE_ID;
  if (!warehouseId) throw new Error('DATABRICKS_WAREHOUSE_ID is not set');
  return ctx.client.statementExecution.executeStatement({
    warehouse_id: warehouseId,
    statement,
    parameters,
    wait_timeout: '30s',
    on_wait_timeout: 'CANCEL',
  });
}

createApp({
  plugins: [analytics(), server()],
  onPluginsReady(appkit) {
    appkit.server.extend((app) => {
      // フィルタ条件を保存
      app.post('/api/filters', async (req, res) => {
        const parsed = saveFilterSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: '入力が不正です' });
          return;
        }
        const { name, filters } = parsed.data;
        try {
          const id = randomUUID();
          await execStatement(
            `INSERT INTO ${SAVED_FILTERS_TABLE} (id, name, filters, created_at) VALUES (:id, :name, :filters, CURRENT_TIMESTAMP())`,
            [
              { name: 'id', value: id, type: 'STRING' },
              { name: 'name', value: name, type: 'STRING' },
              { name: 'filters', value: filters, type: 'STRING' },
            ],
          );
          res.status(201).json({ id, name });
        } catch (e) {
          res.status(500).json({ error: e instanceof Error ? e.message : '保存に失敗しました' });
        }
      });

      // 保存済みフィルタを削除
      app.delete('/api/filters/:id', async (req, res) => {
        const id = req.params.id;
        if (!id) {
          res.status(400).json({ error: 'id が必要です' });
          return;
        }
        try {
          await execStatement(`DELETE FROM ${SAVED_FILTERS_TABLE} WHERE id = :id`, [
            { name: 'id', value: id, type: 'STRING' },
          ]);
          res.json({ id });
        } catch (e) {
          res.status(500).json({ error: e instanceof Error ? e.message : '削除に失敗しました' });
        }
      });
    });
  },
}).catch(console.error);
