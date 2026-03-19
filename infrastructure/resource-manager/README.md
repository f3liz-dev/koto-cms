# OCI Resource Manager デプロイ

OCI Resource Managerを使用した完全マネージド型デプロイメント

## 特徴

- ✅ **OCI ネイティブ** - Terraformローカル実行不要
- ✅ **シンプルな秘密情報管理** - 環境変数のみ（Vault不要）
- ✅ **Provisioned Concurrency** - コールドスタート対策（無料枠内）
- ✅ **Denoコンパイル済みバイナリ** - 軽量コンテナ
- ✅ **ワンクリックデプロイ** - OCI Consoleから実行
- ✅ **自動検出** - tenancy_ocid（UI自動入力）、namespace（dataソース取得）

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│  OCI Resource Manager (Terraform State管理)              │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
   ┌────▼────┐              ┌────▼────────┐
   │ Object  │              │  Functions  │
   │ Storage │              │ (2 warm)    │
   │(Frontend)│              │ + Gateway   │
   └─────────┘              └─────────────┘
```

## リポジトリの分離

このプロジェクトは2つのGitHubリポジトリを使用します：

### 1. DevOps用リポジトリ (`github_repo`)

**用途:** OCI DevOpsがミラーリングし、ビルド・デプロイに使用

**含まれるもの:**
- アプリケーションコード (`src/`, `web/`)
- インフラコード (`infrastructure/`)
- ビルド設定 (`package.json`, `Dockerfile.backend`)
- DevOps設定 (`infrastructure/oci-devops/build_spec.yaml`)

**例:** `f3liz-dev/casa.f3liz.docs`

### 2. コンテンツ管理用リポジトリ (`content_repo`)

**用途:** CMSで編集する記事・ドキュメントを管理

**含まれるもの:**
- Markdownファイル (`docs/*.md`)
- 画像・アセット (`docs/images/`)
- 記事メタデータ

**例:** `f3liz-dev/content`

### なぜ分離するのか？

- ✅ **権限管理** - コンテンツ編集者にインフラコードへのアクセスを与えない
- ✅ **デプロイ分離** - コンテンツ更新でアプリ再デプロイが不要
- ✅ **履歴管理** - コンテンツとコードの変更履歴を分離
- ✅ **CI/CD最適化** - コンテンツ変更時はビルド不要

## デプロイ手順

### 1. スタックZIPの作成

```bash
cd infrastructure/resource-manager
./create-stack.sh
```

### 2. OCI Consoleでスタック作成

1. **Resource Manager** → **Stacks** → **Create Stack**
2. **My Configuration** を選択
3. `stack.zip` をアップロード
4. 変数を入力

**自動設定される項目:**
- ✅ `tenancy_ocid` - UI自動入力
- ✅ `namespace` - Terraformのdataソースで自動取得

**手動入力が必要な変数:**
- リージョン、コンパートメント、サブネット（ドロップダウン選択）
- GitHub tokens、session_secret、document_editors（テキスト入力）

### 3. Plan & Apply

1. **Resource Manager** → **Stacks** → **Create Stack**
2. **My Configuration** を選択
3. `stack.zip` をアップロード
4. 次の変数を入力：

| 変数名 | 説明 | 入力方法 |
|--------|------|---------|
| `region` | OCIリージョン | ドロップダウン選択 |
| `compartment_id` | コンパートメントOCID | ドロップダウン選択 |
| `tenancy_ocid` | テナンシーOCID | **UI自動入力** |
| `subnet_id` | サブネットOCID | ドロップダウン選択 |
| `github_repo` | DevOps用GitHubリポジトリ | 手動入力（例: `f3liz-dev/casa.f3liz.docs`） |
| `content_repo` | コンテンツ管理用GitHubリポジトリ | 手動入力（例: `f3liz-dev/content`） |
| `github_bot_token` | GitHub PAT | 手動入力 |
| `github_repo` | GitHubリポジトリ | 手動入力（例: `f3liz-dev/casa.f3liz.docs`） |
| `session_secret` | セッション署名秘密鍵 | 手動入力（32文字以上） |
| `document_editors` | 許可するFediverseハンドル | 手動入力（例: `@user@instance`） |
| `miauth_callback_url` | MiAuthコールバックURL | 手動入力 |
| `github_access_token` | GitHub PAT (ミラーリング用) | 手動入力 |

**注意:** 
- `tenancy_ocid` はUI自動入力
- `namespace` はTerraformのdataソースで自動取得（変数不要）
- OCIRへのプッシュに認証トークンは不要（IAM Dynamic Group使用）

### 3. Plan & Apply

1. **Plan** をクリックして変更内容を確認
2. **Apply** をクリックしてデプロイ実行
3. 完了まで約5-10分

**自動作成されるもの:**
- ✅ Dynamic Group (DevOpsビルドパイプライン用)
- ✅ IAM Policy (OCIR push権限含む)
- ✅ 認証トークン不要の設定

### 4. 出力値の確認

Apply完了後、以下の情報が表示されます：

- `bucket_url` - フロントエンドURL
- `api_gateway_url` - APIゲートウェイURL
- `container_registry_url` - コンテナレジストリURL

## Provisioned Concurrency設定

### 無料枠

- **10インスタンス** まで無料
- 現在の設定: **2インスタンス** (コールドスタート対策)

### カスタマイズ

`stack.tf` の以下の部分を編集：

```hcl
provisioned_concurrency_config {
  strategy = "CONSTANT"
  count    = 2  # 0-10の範囲で調整
}
```

- `count = 0` - Provisioned Concurrency無効（コールドスタートあり）
- `count = 2` - 2インスタンス常時起動（推奨）
- `count = 10` - 10インスタンス常時起動（無料枠上限）

## 環境変数管理

### シンプルな方式（現在の設定）

環境変数として直接設定（OCI Vault不要）

**メリット:**
- 設定が簡単
- 追加コストなし
- Resource Managerで一元管理

**デメリット:**
- Terraform Stateに平文保存
- ローテーションは手動

### セキュアな方式（オプション）

OCI Vaultを使用する場合は、`stack.tf` を以下のように変更：

```hcl
# Vault Secret参照
data "oci_vault_secret" "session_secret" {
  secret_id = var.session_secret_ocid
}

# Function設定
config = {
  SESSION_SECRET = data.oci_vault_secret.session_secret.secret_bundle_content[0].content
}
```

## 更新手順

### インフラ変更

1. `stack.tf` を編集
2. 新しいZIPを作成
3. Resource Manager → Stack → Edit → Upload new ZIP
4. Plan & Apply

### アプリケーション更新

```bash
git push origin main
# OCI DevOpsが自動的にビルド＆デプロイ
```

## コスト見積もり

| サービス | 使用量 | 月額コスト |
|---------|--------|-----------|
| Object Storage | 1 GB | $0.03 |
| Functions (Provisioned) | 2インスタンス | **無料** |
| Functions (実行) | 100K呼び出し | $2.00 |
| API Gateway | 100K リクエスト | $0.35 |
| DevOps | 100分ビルド | $1.00 |
| **合計** | | **$3-5/月** |

## トラブルシューティング

### Plan失敗: "Invalid credentials"

**原因:** OCI認証情報が正しくない  
**解決:** Resource Managerは自動的にテナンシー認証を使用（追加設定不要）

### Apply失敗: "Subnet not found"

**原因:** `subnet_id` が間違っている  
**解決:** VCN → Subnets でOCIDを確認

### Function起動失敗

**原因:** コンテナイメージがOCIRにない  
**解決:** 最初のデプロイ前に手動でイメージをプッシュ

```bash
docker build -f Dockerfile.backend -t <region>.ocir.io/<namespace>/f3liz-cms:latest .
docker push <region>.ocir.io/<namespace>/f3liz-cms:latest
```

### Provisioned Concurrency設定できない

**原因:** 無料枠を超えている  
**解決:** `count` を10以下に設定

## ベストプラクティス

1. **秘密情報のローテーション**
   - 3ヶ月ごとに `session_secret` を更新
   - GitHub tokenは定期的に再生成

2. **モニタリング**
   - Functions → Metrics でパフォーマンス確認
   - Provisioned Concurrencyの使用率をチェック

3. **バックアップ**
   - Resource Manager Stateは自動バックアップ
   - 手動バックアップ: Stack → Download Terraform Configuration

4. **タグ付け**
   - コスト追跡のためにリソースにタグを追加
   - `Environment: production`, `Project: f3liz-cms`

## 参考リンク

- [OCI Resource Manager ドキュメント](https://docs.oracle.com/en-us/iaas/Content/ResourceManager/home.htm)
- [OCI Functions Provisioned Concurrency](https://docs.oracle.com/en-us/iaas/Content/Functions/Tasks/functionsusingprovisionedconcurrency.htm)
- [Deno Compile](https://deno.land/manual/tools/compiler)
