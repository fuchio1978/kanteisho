# PayPal切り替え準備メモ

最終更新：2026年10月12日

## 現在の方針

- 最初の実売テストは「命式サイト継続プラン｜受講生・卒業生」月額2,200円（税込）の1商品だけで行う。
- PayPal側のプランは下書きのまま維持し、サイト側・Supabase側の準備が完了してから有効化する。
- 初回テストはPayPalの申込URLとサイト管理画面による手動反映で行う。
- PayPal API・Webhookによる自動反映は、購入・更新・解約の手動運用を1件通してから別段階で有効化する。
- カード番号等の決済情報はサイトおよびSupabaseへ保存しない。

## PayPalの商品対応

| 項目 | 値 |
|---|---|
| 商品名 | 命式サイト継続プラン｜受講生・卒業生 |
| サイト内プランID | `student_graduate` |
| PayPal商品ID | `KANTEISHO-STUDENT-GRADUATE` |
| PayPalプランID | `P-39272220BU229050SNLEP5DQ` |
| 価格 | 月額2,200円（税込） |
| 現在の状態 | 下書き・販売導線OFF |

## サイト側で準備したもの

1. PayPalプランID、購入URL、販売ON/OFFを別々に管理する設定。
2. 申込案内ページ `/subscribe/student-graduate`。
3. 販売ON/OFFが `false` の間は、申込案内ページにPayPal購入リンクを出さない安全装置。
4. 管理画面で決済サービスとPayPal契約IDを記録する入力欄。
5. CSVへ決済サービスと決済参照IDを出力する処理。
6. 既存STORES記録を残しながらPayPal契約を保存できるSupabase移行SQL。
7. 将来のWebhook自動連携で重複通知を防ぐためのサーバー専用テーブル。
8. LP、利用規約、プライバシーポリシー、解約・返金ポリシー、特商法表記のPayPal向け文面。

## 2026年10月12日までに完了した作業

- PayPal切り替えコードの全221件のテストに成功。
- Supabase本番プロジェクト `kanteisho-members` へ `202610090001_payment_provider_neutral.sql` を適用。
- SQL Editorで `Success. No rows returned.` を確認。
- 既存STORES記録は保持し、PayPal用の共通列とWebhook重複防止テーブルだけを追加。

## 実売テスト前に残っている作業

必ず次の順番で行う。

1. コードをコミット・PUSHし、Renderへ反映する。
2. 本番サイトで管理画面・規約・申込案内ページを表示確認する。
3. PayPalの月額2,200円プランを有効化する。
4. PayPalが発行した申込URLをRenderの `PAYPAL_STUDENT_GRADUATE_PURCHASE_URL` に設定する。
5. URL、金額、自動更新、解約方法を確認した後だけ `PAYPAL_STUDENT_GRADUATE_SALES_ENABLED=true` にする。
6. 購入者が無料会員登録を完了してから、同じメールアドレスでPayPal申込を行う。
7. PayPalで初回決済完了と契約ID、次回請求日を確認する。
8. サイト管理画面の「登録済み会員の購入を反映」へ、PayPal契約IDと契約期間を入力する。
9. 購入者が再ログインし、受講生・卒業生プランの権限を確認する。
10. 解約テスト後、管理画面で「解約済み」に変更し、支払済み期間の終了日まで利用できることを確認する。

## 今回まだ行わないこと

- PayPalプランの有効化
- PayPal購入URLの公開
- Renderの本番環境変数変更
- コミット、PUSH、デプロイ
- 実決済、解約、返金
- PayPal APIクライアントID・秘密鍵の登録
- Webhookエンドポイントの有効化

## 切り戻し

- `PAYPAL_STUDENT_GRADUATE_SALES_ENABLED=false` にすれば購入導線は表示されない。
- 既存のSTORESカラムと記録は削除しないため、過去データを参照できる。
- 新しいSupabase列は追加のみで、既存契約のプラン・期間・状態は変更しない。
