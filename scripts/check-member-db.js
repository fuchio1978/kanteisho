'use strict';

const {checkSupabaseConnection} = require('../supabase-server');

const MESSAGES = {
  connected: 'Supabaseへ接続でき、会員テーブルを確認できました。',
  not_configured: 'Supabase接続情報はまだ設定されていません。',
  invalid_configuration: 'Supabase接続情報に不足または設定間違いがあります。',
  credentials_rejected: 'Supabaseが接続用の秘密鍵を受け付けませんでした。',
  schema_pending: 'Supabaseには接続できましたが、会員テーブルはまだ作成されていません。',
  timeout: 'Supabaseへの接続確認が時間切れになりました。',
  unreachable: 'Supabaseへ接続できませんでした。',
  unavailable: 'Supabaseから予期しない応答が返されました。',
  fetch_unavailable: '接続確認機能を利用できないNode.js環境です。',
};

checkSupabaseConnection().then(result => {
  console.log(MESSAGES[result.status] || `接続状態: ${result.status}`);
  if (result.issues?.length) for (const issue of result.issues) console.log(`- ${issue}`);
  process.exitCode = result.ok ? 0 : 1;
});
