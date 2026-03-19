#!/bin/bash
set -euo pipefail

# OCI Resource Manager Stack作成スクリプト

echo "=== F3liz CMS Stack作成 ==="

# ZIPファイル作成
echo "1. Stackファイルをパッケージング..."
cd "$(dirname "$0")"

# 既存のstack.zipを削除
rm -f stack.zip

# 最適化されたschema.yamlを含むZIPを作成
zip -r stack.zip stack.tf schema.yaml
echo "✓ stack.zip 作成完了"

echo ""
echo "最適化された機能:"
echo "  ✅ tenancy_ocid - UI自動入力"
echo "  ✅ namespace - dataソース自動取得"
echo "  ✅ 日本語UI対応"
echo "  ✅ バリデーション付き"
echo ""
echo "2. 次のステップ:"
echo "   1. OCI Console → Resource Manager → Stacks"
echo "   2. 'Create Stack' をクリック"
echo "   3. 'My Configuration' を選択"
echo "   4. stack.zip をアップロード"
echo "   5. 変数を入力（tenancy_ocidとnamespaceは自動入力されます）"
echo "   6. Plan & Apply"
echo ""
echo "または、OCI CLIで作成:"
echo ""
echo "oci resource-manager stack create \\"
echo "  --compartment-id <compartment-ocid> \\"
echo "  --config-source stack.zip \\"
echo "  --display-name 'F3liz CMS Stack' \\"
echo "  --description 'Serverless CMS with Fediverse auth'"
echo ""
