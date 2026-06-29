# VS Code + Claude Code + Databricks Agent Skills セットアップ手順 v2

Azure Databricks のサービングエンドポイント（Claude モデル）を、VS Code 拡張機能 **Claude Code** から利用し、**Databricks Agent Skills** をインストールするまでの手順書です。

> **v2 更新内容（v1 からの変更点）**
> - Databricks CLI の最低バージョン要件を追加
> - Git Bash パスの注意事項を追記
> - Node.js のバージョン選択指針を追記
> - **Step 5：Databricks Agent Skills インストール手順を新規追加**
> - 各ステップに動作確認コマンドを追加

---

## 前提条件

以下がすべて満たされていることを確認してください。

- Azure Databricks へ **SSO ログイン** ができる
- **Databricks CLI v1.5.0 以上** をインストール済み（⚠️ 後述の注意参照）
- **Git for Windows** をインストール済み（Bash を使用するため）
- **VS Code** をインストール済み（拡張機能 **Claude Code** をインストール済み）
- **Node.js** インストール済み（任意 ― なくても動作可能）

> 補足: 本手順内のワークスペース URL `https://adb-5493806192611194.14.azuredatabricks.net` は例です。**自分が利用するワークスペースの URL に置き換えてください。**

---

## ⚠️ 重要：Databricks CLI のバージョンについて

**Databricks CLI は v1.5.0 以上が必須です。**

v1.1.0 以下には、Agent Skills を一括インストールする際に一部スキルのパスが欠落するバグがあり、インストールが途中で失敗します（HTTP 400 エラー）。

### バージョン確認

```powershell
databricks --version
```

`Databricks CLI v1.5.0` 以上であることを確認してください。

### バージョンアップ（winget 経由）

```powershell
winget upgrade Databricks.DatabricksCLI
```

---

## ⚠️ 重要：Node.js のバージョンについて

Node.js は**このハンズオンでは必須ではありません**（Nice to have）。インストールする場合は以下の点に注意してください。

- **推奨バージョン：v24.x 系（LTS）**。最新の Current 版（v26.x 等）ではなく、安定版（LTS）を選ぶこと。
  - winget では `OpenJS.NodeJS.LTS` を指定すると LTS の最新が入ります。
- **インストール時に UAC（ユーザーアカウント制御）のダイアログが表示されます。** 管理者権限（インストール用 ID）が必要です。社内 PC の場合、IT 部門への申請が必要な場合があります。

```powershell
# LTS の最新をインストール
winget install OpenJS.NodeJS.LTS
```

---

## 0. プロキシの設定（社内ネットワーク向け）

会社のプロキシ環境では、未設定のままだと **Databricks CLI の認証やトークン取得で先に進めません**。

> ⚠️ **人によって対応が異なります。**
> - すでにプロキシを設定済みの人 … このステップは **スキップ** してください。
> - 未設定の人 … 以下を設定してください（ここで躓くケースが多いです）。

### 設定方法

**環境変数 → ユーザー環境変数** に、以下の 2 つを追加します。

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

- `Valid` が **YES** になっているプロファイル（= 有効にログイン済み）を使います。
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
    { "name": "ANTHROPIC_MODEL",                    "value": "databricks-claude-opus-4-8" },
    { "name": "ANTHROPIC_BASE_URL",                 "value": "https://adb-5493806192611194.14.azuredatabricks.net/serving-endpoints/anthropic" },
    { "name": "ANTHROPIC_AUTH_TOKEN",               "value": "取得したToken Secret" },
    { "name": "ANTHROPIC_DEFAULT_OPUS_MODEL",       "value": "databricks-claude-opus-4-8" },
    { "name": "ANTHROPIC_DEFAULT_SONNET_MODEL",     "value": "databricks-claude-sonnet-4-6" },
    { "name": "ANTHROPIC_DEFAULT_HAIKU_MODEL",      "value": "databricks-claude-haiku-4-5" },
    { "name": "ANTHROPIC_CUSTOM_HEADERS",           "value": "" },
    { "name": "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS", "value": "1" },
    { "name": "CLAUDE_CODE_GIT_BASH_PATH",          "value": "C:\\Program Files\\Git\\bin\\bash.exe" }
  ],
```

#### 各自で置き換える値

| キー | 設定する値 |
|---|---|
| `ANTHROPIC_BASE_URL` | 自分のワークスペース URL ＋ `/serving-endpoints/anthropic`（末尾の `/v1/messages` は付けない） |
| `ANTHROPIC_AUTH_TOKEN` | 手順 3 で取得した **Token Secret**（`dapi...`） |
| `ANTHROPIC_MODEL` / `ANTHROPIC_DEFAULT_*` | 手順 2 で確認したモデル名に合わせる |

#### ⚠️ `CLAUDE_CODE_GIT_BASH_PATH` のパスに注意

Git for Windows のインストール方法によって `bash.exe` の場所が異なります。

| インストール方法 | パス |
|---|---|
| 管理者（全ユーザー）インストール（一般的） | `C:\Program Files\Git\bin\bash.exe` |
| ユーザーインストール（管理者権限なし） | `C:\Users\<ユーザー名>\AppData\Local\Programs\Git\bin\bash.exe` |

自分の環境の正しいパスを確認するには：

```powershell
where.exe bash
```

または PowerShell で：

```powershell
(Get-Command bash).Source
```

> Claude Code が PATH 経由で bash を自動検出できる場合もありますが、**settings.json に明示的に記載しておく方が確実です。** パスが間違っていると Bash 関連エラーが発生します。

#### JSON 記述の注意

- **カンマ `,` を適切に入れる**こと。
  - すでに他の設定がある場合、直前の行の末尾にカンマが必要です。
  - 各要素・各行の区切りにカンマを忘れないでください（最後の要素の後ろには不要）。
- **不要な項目は行ごと削除**して構いません（その際、前後のカンマを調整してください）。

設定できたら **保存（Ctrl + S）** します。

---

## 5. Databricks Agent Skills をインストールする（NEW）

Claude Code が Databricks の各機能（SQL、Unity Catalog、Apps 等）を正しく扱えるよう、**スキル（知識ファイル群）をプロジェクトフォルダにインストール**します。

### 5-1. プロジェクトフォルダを作成する

**フォルダ名・場所は任意ですが、自分が管理できる場所にしてください。**（このフォルダがハンズオン中の作業フォルダになります）

```powershell
mkdir C:\Users\<ユーザー名>\PROJECT\<任意のフォルダ名>
cd C:\Users\<ユーザー名>\PROJECT\<任意のフォルダ名>
```

例:

```powershell
mkdir C:\Users\yamada\PROJECT\databricks-handson
cd C:\Users\yamada\PROJECT\databricks-handson
```

### 5-2. Skills をインストールする

作成したフォルダの中で以下のコマンドを実行します。

```powershell
databricks aitools install --agents claude-code --scope project --experimental
```

正常に完了すると以下のように表示されます：

```
Installing Databricks AI skills for Claude Code...
Using skills version x.x.x
Installed 30 skills.
```

> **`Symlink failed ... copying instead` というメッセージが出ても問題ありません。**
> Windows では管理者権限なしでシンボリックリンクが作れないため、CLI が自動的にコピーに切り替えます。動作に影響はありません。

### 5-3. インストール結果を確認する

```powershell
databricks aitools list --scope project
```

出力の最終行に **`30/30 skills installed (project)`** と表示されれば完了です。

```
...
30/30 skills installed (project)   ← これが表示されれば OK
```

> ⚠️ `0/30` や途中の数字で止まっている場合は、Databricks CLI のバージョンが古い可能性があります。冒頭の「Databricks CLI のバージョンについて」を参照してアップデートしてください。

---

## 6. 動作確認

セットアップが完了したら、以下のコマンドで各コンポーネントの動作を確認してください。

### 6-1. Databricks CLI の確認

```powershell
databricks --version
databricks auth profiles
```

期待する結果：
- `Databricks CLI v1.5.0` 以上が表示される
- 使用するプロファイルの `Valid` が `YES` になっている

### 6-2. Git Bash の確認

```powershell
& "C:\Program Files\Git\bin\bash.exe" -c "echo 'bash OK'; bash --version | head -1"
```

※ パスは自分の環境に合わせて変更してください。

期待する結果：

```
bash OK
GNU bash, version 5.x.x ...
```

### 6-3. Databricks Agent Skills の確認

プロジェクトフォルダに移動してから実行してください：

```powershell
cd C:\Users\<ユーザー名>\PROJECT\<プロジェクトフォルダ名>
databricks aitools list --scope project
```

期待する結果：最終行に `30/30 skills installed (project)` が表示される。

### 6-4. Claude Code（VS Code）の動作確認

1. コマンドパレット（**Ctrl + Shift + P**）を開き、**`Developer: Reload Window`** で VS Code を再起動します。
2. **プロジェクトフォルダ（Step 5 で作成したフォルダ）を VS Code で開きます。**（File → Open Folder）
3. 再起動後、もう一度コマンドパレットを開き、**`Claude Code: Open in New Tab`** で Claude Code を起動します。
4. チャットウィンドウに **「こんにちは」** と入力し、妥当な応答が返ってくれば **OK** です。

> Skills はプロジェクトフォルダを VS Code で開いた状態でのみ有効です。**必ずプロジェクトフォルダを開いた状態で Claude Code を起動してください。**

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `databricks --version` が古い（v1.1.x 等） | `winget upgrade Databricks.DatabricksCLI` でアップデート |
| Skills インストールが `HTTP 400` で失敗する | Databricks CLI が古い（v1.1.x のバグ）。上記でアップデート後に再実行 |
| `X/30 skills installed` で止まっている | CLI をアップデートして再実行。または `--skills <スキル名>` で個別インストール |
| 応答がない / 認証エラー | `ANTHROPIC_AUTH_TOKEN` のトークンが正しいか、有効期限内かを確認 |
| エンドポイントエラー（404 等） | `ANTHROPIC_BASE_URL` の末尾が `/serving-endpoints/anthropic` になっているか確認（`/v1/messages` を付けない） |
| モデルが見つからない | 手順 2 の一覧に存在するモデル名を `settings.json` に設定しているか確認 |
| Bash 関連エラー | `CLAUDE_CODE_GIT_BASH_PATH` が実際の `bash.exe` のパスと一致しているか確認（`where.exe bash` で確認可） |
| 設定が反映されない | `settings.json` の JSON 構文（カンマ・括弧）が正しいか、保存後に `Developer: Reload Window` したかを確認 |
| Skills が Claude Code に効いていない | VS Code でプロジェクトフォルダを開いているか確認（Skills はプロジェクトスコープで有効） |
| Node.js インストールが UAC でブロックされる | 管理者権限（インストール用 ID）が必要。IT 部門に申請するか、Node.js なしで進める（任意のため） |
