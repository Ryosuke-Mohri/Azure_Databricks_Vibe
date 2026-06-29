# VS Code + Claude Code を Azure Databricks のモデルで使う セットアップ手順

Azure Databricks のサービングエンドポイント（Claude モデル）を、VS Code 拡張機能 **Claude Code** から利用するための手順書です。

---

## 前提条件

以下がすべて満たされていることを確認してください。

- Azure Databricks へ **SSO ログイン**ができる
- **Databricks CLI** をインストール済み
- **Git for Windows** をインストール済み（Bash を使用するため）
- **VS Code** をインストール済み（拡張機能 **Claude Code** をインストール済み）

> 補足: 本手順内のワークスペース URL `https://adb-5493806192611194.14.azuredatabricks.net` は例です。**自分が利用するワークスペースの URL に置き換えてください。**

---

## 0. プロキシの設定（社内ネットワーク向け）

会社のプロキシ環境では、未設定のままだと **Databricks CLI の認証やトークン取得でここから先に進めません**。

> ⚠️ **人によって対応が異なります。**
> - すでにプロキシを設定済みの人 … このステップは **スキップ** してください。
> - 未設定の人 … 以下を設定してください（ここで躓くケースが多いです）。

### 設定方法

**環境変数 ➡ ユーザー環境変数** に、以下の 2 つを追加します。

| 変数名 | 値 |
|---|---|
| `HTTP_PROXY` | `http://c000a10-vip.cosmo-oil.co.jp:12080` |
| `HTTPS_PROXY` | `http://c000a10-vip.cosmo-oil.co.jp:12080` |

設定手順:

1. Windows スタートメニューで「環境変数」を検索し、「**環境変数を編集**」（ユーザー環境変数）を開く
2. 「ユーザー環境変数」欄で「**新規**」をクリック
3. 上記の変数名・値をそれぞれ追加する
4. **OK で保存後、開いているコマンドプロンプト / VS Code はいったん閉じて開き直す**（環境変数を反映させるため）

---

## 1. Databricks CLI で認証する

### 1-1. コマンドプロンプトを開く

Windows の「コマンドプロンプト」（または PowerShell）を開きます。

### 1-2. ログイン済みワークスペースのプロファイルを確認する

```powershell
databricks auth profiles
```

出力例:

```
Name                  Host                                                 Valid
DEFAULT               https://adb-5493806192611194.14.azuredatabricks.net  YES
workspace2            https://adb-4380170109702674.14.azuredatabricks.net  NO
```

- `Valid` が **YES** になっているプロファイル（=有効にログイン済み）を使います。
- 上記例では `DEFAULT` が有効です。

### 1-3. 自分のプロファイルでログインする

`Valid` が `NO` の場合、または初めてログインする場合は、自分のワークスペース URL でログインします。

```powershell
databricks auth login --host https://adb-5493806192611194.14.azuredatabricks.net
```

> ブラウザが開くので、SSO でログインしてください。

---

## 2. サービングエンドポイント一覧を確認する

利用したいワークスペースのサービングエンドポイント（モデル）一覧を表示します。

```powershell
powershell -Command "(databricks serving-endpoints list -o json | ConvertFrom-Json).name"
```

出力例（抜粋）:

```
databricks-claude-opus-4-8
databricks-claude-sonnet-4-6
databricks-claude-haiku-4-5
...
```

> ここに表示されたモデル名を、後述の `settings.json` の各モデル設定に使用します。
> Opus / Sonnet / Haiku のそれぞれで利用可能な最新版を選んでください。

---

## 3. アクセストークン（Token Secret）を取得する

Claude Code から認証するためのトークンを発行します。

```powershell
databricks tokens create --comment "ryosuke_mori_20260622" --lifetime-seconds 31536000
```

- **`ryosuke_mori_20260622` は作成者識別用のコメントです。各自の名前＋日付などに置き換えてください。**
- `--lifetime-seconds 31536000`（= 1 年）は **固定で OK** です。

実行すると、以下のような JSON が返ります。

```json
{
  "token_value": "dapiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "token_info": { ... }
}
```

- `token_value`（`dapi` から始まる文字列）が **Token Secret** です。
- **この値は再表示できません。** 後の手順で使うので、安全な場所に控えておいてください。

> ⚠️ セキュリティ注意: このトークンはあなたの権限でワークスペースにアクセスできます。Git にコミットしたり、他人と共有したりしないでください。

---

## 4. VS Code の設定ファイルを編集する

### 4-1. 設定ファイル（JSON）を開く

1. VS Code を開く
2. コマンドパレット（**Ctrl + Shift + P**）を開く
3. **`Preferences: Open User Settings (JSON)`** を選択する

`settings.json` が開きます。

### 4-2. 以下の設定を挿入して保存する

`settings.json` の一番外側の `{ }` の中に、以下を貼り付けます。

```json
  "claudeCode.preferredLocation": "panel",
  "claudeCode.environmentVariables": [
    { "name": "ANTHROPIC_MODEL", "value": "databricks-claude-opus-4-8" },
    { "name": "ANTHROPIC_BASE_URL", "value": "https://adb-5493806192611194.14.azuredatabricks.net/serving-endpoints/anthropic" },
    { "name": "ANTHROPIC_AUTH_TOKEN", "value": "取得したToken Secret" },
    { "name": "ANTHROPIC_DEFAULT_OPUS_MODEL", "value": "databricks-claude-opus-4-8" },
    { "name": "ANTHROPIC_DEFAULT_SONNET_MODEL", "value": "databricks-claude-sonnet-4-6" },
    { "name": "ANTHROPIC_DEFAULT_HAIKU_MODEL", "value": "databricks-claude-haiku-4-5" },
    { "name": "ANTHROPIC_CUSTOM_HEADERS", "value": "" },
    { "name": "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS", "value": "1" },
    { "name": "CLAUDE_CODE_GIT_BASH_PATH", "value": "C:\\Program Files\\Git\\bin\\bash.exe" }
  ],
```

#### 各自で置き換える値

| キー | 設定する値 |
|---|---|
| `ANTHROPIC_BASE_URL` | 自分のワークスペース URL ＋ `/serving-endpoints/anthropic`（末尾の `/v1/messages` は付けない） |
| `ANTHROPIC_AUTH_TOKEN` | 手順 3 で取得した **Token Secret**（`dapi...`） |
| `ANTHROPIC_MODEL` / `ANTHROPIC_DEFAULT_*` | 手順 2 で確認したモデル名に合わせる |

#### JSON 記述の注意

- **カンマ `,` を適切に入れる**こと。
  - すでに他の設定がある場合、直前の行の末尾にカンマが必要です。
  - 各要素・各行の区切りにカンマを忘れないでください（最後の要素の後ろには不要）。
- **不要な項目は行ごと削除**して構いません（その際、前後のカンマを調整してください）。
- `CLAUDE_CODE_GIT_BASH_PATH` は Git for Windows のインストール先に合わせてください（通常は上記のパスです）。

設定できたら **保存（Ctrl + S）** します。

---

## 5. 動作確認

1. コマンドパレット（**Ctrl + Shift + P**）を開き、**`Developer: Reload Window`** で VS Code を再起動します。
2. 再起動後、もう一度コマンドパレットを開き、**`Claude Code: Open in New Tab`** で Claude Code を起動します。
3. チャットウィンドウに **「こんにちは」** と入力し、妥当な応答が返ってくれば **OK** です。

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| 応答がない / 認証エラー | `ANTHROPIC_AUTH_TOKEN` のトークンが正しいか、有効期限内かを確認 |
| エンドポイントエラー (404 等) | `ANTHROPIC_BASE_URL` の末尾が `/serving-endpoints/anthropic` になっているか確認（`/v1/messages` を付けない） |
| モデルが見つからない | 手順 2 の一覧に存在するモデル名を `settings.json` に設定しているか確認 |
| Bash 関連エラー | `CLAUDE_CODE_GIT_BASH_PATH` が実際の `bash.exe` のパスと一致しているか確認 |
| 設定が反映されない | `settings.json` の JSON 構文（カンマ・括弧）が正しいか、保存後に Reload Window したかを確認 |
