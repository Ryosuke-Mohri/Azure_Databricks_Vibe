# Azure Databricks Vibe

VSCode + Claude Code を使った Databricks Vibe Coding 開発環境。

Databricks CLI Skills と Claude Code を連携させ、Notebooks・Apps・Pipelines を自然言語主導で開発します。

## 構成

```
.
├── .claude/          # Claude Code スキル・設定（Databricks Skills）
├── .databricks/      # Databricks AI Tools スキル（aitools 連携用）
├── notebooks/        # Databricks Notebooks
├── apps/             # Databricks Apps（TypeScript/Python）
├── bundles/          # Databricks Asset Bundles (DABs)
└── CLAUDE.md         # Claude Code プロジェクト設定
```

## 使い方

### 前提条件

- [Databricks CLI](https://docs.databricks.com/dev-tools/cli/databricks-cli.html) `>= v0.292.0`
- [Claude Code](https://claude.ai/code) (VSCode 拡張または CLI)

### 認証設定

```bash
databricks auth login --host <WORKSPACE_URL> --profile <PROFILE_NAME>
```

### Vibe Coding の開始

Claude Code に日本語で指示するだけで、Databricks の各種リソースを開発できます。

```
databricks auth profiles で利用可能なプロファイルを確認して、
Unity Catalog の catalog.schema を探索してください。
```

## Skills

| スキル | 用途 |
|--------|------|
| `databricks-core` | CLI・認証・データ探索 |
| `databricks-apps` | Databricks Apps 開発（AppKit） |
| `databricks-apps-python` | Python フレームワーク Apps |
| `databricks-dabs` | DABs でのリソース管理・デプロイ |
| `databricks-aibi-dashboards` | AI/BI ダッシュボード |
| `databricks-ai-functions` | SQL AI 関数 |
| `databricks-unity-catalog` | Unity Catalog 管理 |
| `databricks-agent-bricks` | Knowledge Assistant / Supervisor Agent |
| `databricks-dbsql` | Databricks SQL |
| `databricks-pipelines` | Lakeflow パイプライン |
| `databricks-model-serving` | モデルサービング |
