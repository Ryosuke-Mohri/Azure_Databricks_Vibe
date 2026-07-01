# 開発ログ

このプロジェクトでの試行錯誤・意思決定を簡潔に残すメモ。

## 2026-07-01: dataexp-appkit を削除しゼロベース化

- **やったこと**: 顧客データエクスポートアプリ（`dataexp-appkit` / `dataexp-appkit-mock`）を作成・デプロイを試みたが、うまくいかず、**残骸を全て削除してゼロベースからやり直す**ことにした。
- **削除したもの（自分のもののみ）**:
  - Databricks App `dataexp-appkit-mori`（＋付随サービスプリンシパルは自動削除）
  - Workspace の bundle デプロイファイル `/Workspace/Users/.../.bundle/dataexp-appkit-mori/`
  - ローカルの `dataexp-appkit/` `dataexp-appkit-mock/` ディレクトリ
- **意図的に残したもの**:
  - 共有サンプルデータ `training.dsg_vibe` の全テーブル（`customers` 等）
  - `saved_filters` テーブル … 調査の結果**他人所有**だったため削除せず
  - 他人の同種アプリ（`dataexp-appkit-*` 各人版）、別プロジェクト `dsg-foundry`、Databricks Skills、docs
- **次回に向けて**: データ基盤（`training.dsg_vibe`）は残っているので、アプリはゼロから作り直せる。
