# Azure Databricks Vibe — Claude Code 設定

このプロジェクトは Databricks CLI Skills と VSCode + Claude Code を連携させた Vibe Coding 開発環境です。

## プロジェクト概要

- **目的**: Databricks の Notebooks・Apps・Pipelines を自然言語主導（Vibe Coding）で開発
- **主要ツール**: Databricks CLI (`>= v0.292.0`)、Claude Code Skills、DABs

## Skills の使い方

Databricks の作業を始める際は、常に `databricks-core` スキルから開始してください。

| タスク | 使用スキル |
|--------|-----------|
| CLI・認証・データ探索 | `databricks-core` |
| Apps 開発（TypeScript AppKit） | `databricks-apps` |
| Apps 開発（Python）| `databricks-apps-python` |
| Jobs / Pipelines デプロイ | `databricks-dabs` |
| AI/BI ダッシュボード | `databricks-aibi-dashboards` |
| SQL AI 関数 | `databricks-ai-functions` |
| Unity Catalog | `databricks-unity-catalog` |
| Knowledge Assistant / MAS | `databricks-agent-bricks` |

## Databricks CLI 重要ルール

- `--profile` フラグは **常に指定**すること（デフォルトプロファイルを仮定しない）
- 各 Bash コマンドは独立したシェルセッションで実行される
- プロファイルはユーザーが選択する（自動選択禁止）

```bash
# 正しい例
databricks apps list --profile my-workspace

# 誤った例（セッションをまたいで export は効かない）
export DATABRICKS_CONFIG_PROFILE=my-workspace
databricks apps list
```

## ディレクトリ構成

```
.
├── .claude/          # Claude Code スキル定義
├── .databricks/      # Databricks AI Tools スキル
├── notebooks/        # Databricks Notebooks (.ipynb / .py)
├── apps/             # Databricks Apps プロジェクト
├── bundles/          # Databricks Asset Bundles (databricks.yml)
├── .gitignore
├── CLAUDE.md         # このファイル
└── README.md
```

## コーディング規約

- Python: PEP 8 準拠、型ヒント推奨
- コメントは日本語可
- Notebook ファイルは `notebooks/` 配下に配置
- Apps は `apps/<app-name>/` 配下に配置
- DABs bundle は `bundles/<bundle-name>/` 配下に配置
