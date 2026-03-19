# Resource Manager Schema 改善点

## 実装済みの最適化 ✅

### 1. 自動設定の実装

**tenancy_ocid（UI自動入力）**
```yaml
# Before (手動入力)
tenancy_ocid:
  type: string

# After (UI自動入力)
tenancy_ocid:
  type: oci:identity:tenancy:id
```

**namespace（dataソース自動取得）**
```hcl
# schema.yamlから削除（変数不要）

# stack.tfに追加
data "oci_objectstorage_namespace" "ns" {
  compartment_id = var.compartment_id
}

# 使用箇所
namespace = data.oci_objectstorage_namespace.ns.namespace
```

### 2. セキュリティ対策

- ✅ `type: password` で機密情報を隠蔽
- ✅ `pattern` でバリデーション
- ✅ `minLength: 32` で session_secret を保護
- ✅ `sensitive: true` で Terraform 変数を保護

### 3. UX改善

- ✅ 日本語の title/description
- ✅ variableGroups で論理的に分類
- ✅ dependsOn でドロップダウンを絞り込み

## 利用可能なOCI型

Resource Managerで使える便利な型：

```yaml
# Identity
oci:identity:tenancy:id          # テナンシーOCID（自動）
oci:identity:compartment:id      # コンパートメント（ドロップダウン）
oci:identity:region:name         # リージョン（ドロップダウン）
oci:identity:availabilitydomain:name  # AD（ドロップダウン）

# Networking
oci:core:vcn:id                  # VCN（ドロップダウン）
oci:core:subnet:id               # サブネット（ドロップダウン）

# Object Storage
oci:objectstorage:namespace:name # ネームスペース（自動）
oci:objectstorage:bucket:name    # バケット（ドロップダウン）

# Compute
oci:core:image:id                # イメージ（ドロップダウン）
oci:core:instanceshape:name      # シェイプ（ドロップダウン）
```

## ユーザー体験の向上

### Before（手動入力）
```
テナンシーOCID: [                                    ]
  ← ユーザーがOCIDをコピペする必要がある

ネームスペース: [                                    ]
  ← ユーザーがネームスペースを調べる必要がある
```

### After（自動入力）
```
テナンシーOCID: ocid1.tenancy.oc1..aaaaaa... ✓ 自動入力
  ← Resource Managerが自動的に入力

ネームスペース: axabcdefghij ✓ 自動入力
  ← テナンシーから自動取得
```

## 参考リンク

- [Resource Manager Schema Reference](https://docs.oracle.com/en-us/iaas/Content/ResourceManager/Concepts/terraformconfigresourcemanager_topic-schema.htm)
- [Variable Types](https://docs.oracle.com/en-us/iaas/Content/ResourceManager/Concepts/terraformconfigresourcemanager_topic-schema.htm#variable-types)
