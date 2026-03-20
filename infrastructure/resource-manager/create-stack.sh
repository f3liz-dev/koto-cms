#!/bin/bash
set -euo pipefail

# OCI Resource Manager Stack作成スクリプト

echo "=== Koto Stack作成 ==="

# ZIPファイル作成
echo "1. Stackファイルをパッケージング..."
cd "$(dirname "$0")"

# 既存のstack.zipを削除
rm -f stack.zip

# Vault統合を含むZIPを作成
zip -r stack.zip stack.tf vault.tf schema.yaml
echo "✓ stack.zip 作成完了"

echo ""
echo "最適化された機能:"
echo "  ✅ tenancy_ocid - UI自動入力"
echo "  ✅ namespace - dataソース自動取得"
echo "  ✅ OCI Vault統合 - セキュアなシークレット管理"
echo "  ✅ 日本語UI対応"
echo "  ✅ バリデーション付き"
echo ""
echo "⚠️  事前準備:"
echo "   - OCI Vaultを作成してください"
echo "   - Vault内にマスター暗号化キーを作成してください"
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
echo "  --display-name 'Koto Stack' \\"
echo "  --description 'Serverless CMS with Fediverse auth'"
echo ""
