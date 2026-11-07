# Dexman

Glitch（バグ生成）とPatch（バグ除去）に分かれる、PC向け2対2オンラインゲーム。

## 現在の実装

ロビー接続テスト版です。ルーム作成・コード／招待リンクでの参加、名前入力、4人の準備完了、自動チーム分け、3秒カウントダウン、開始前切断時のキャンセル、退出、接続ログを実装しました。移動・キューブ・スキルのゲーム本体、観戦・再戦はこれから実装します。

- 対戦サーバー： https://dexman.onrender.com
- フロント： `dexman/web`（Sites標準のReact／Vinext）
- サーバー： `dexman/server`（Node.js 22／Colyseus）
- 仕様： [GAME_SPEC.md](GAME_SPEC.md)
- 技術構成： [TECH_DESIGN.md](TECH_DESIGN.md)
- Render設定： [RENDER_DEPLOY.md](RENDER_DEPLOY.md)

## 検証済み

- ロビールールテスト3件が成功。
- 公開Renderサーバーへ4クライアントで接続し、全員同じ2対2チームになること、切断で開始を取り消すこと、再参加後の開始を確認。
- フロントのTypeScriptチェックとSites用ビルドが成功。
- 実ブラウザでの画面操作・複数PC間の確認は未実施。

## ローカル開発

Node.js 22.13以上（22系）を使用します。

サーバー： `cd dexman/server` → `npm ci` → `npm start`。
テスト：同じディレクトリで `npm test`。別ターミナルから `npm run smoke` でローカルサーバーへ4クライアントを接続します。

画面： `cd dexman/web` → `npm run install:ci` → `npm run dev`。画面は現在、公開Renderサーバーへ接続します。

フロント型チェック： `npx tsc --noEmit`。
フロントビルド： `npm run build`。

## 無料枠と公開範囲

Render Freeの無通信時スリープに備え、画面は最長約95秒サーバーの起動を待ちます。再起動するとメモリ上のルームは失われます。通信量・ビルド枠に別途上限があるため、0円運用はRenderの課金設定と利用量を確認してください。

Sitesは最初は所有者のみが閲覧できる設定で公開します。4人で遊ぶには、Sitesの共有設定で参加者がアクセスできる範囲にする必要があります。