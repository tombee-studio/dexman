# Dexman Web

React／Vite／Phaserのブラウザ向けアプリ。Sitesの認証・ランタイム・Workerは使いません。

依存取得とビルドは親のdexmanディレクトリから `npm ci --include=dev` → `npm run build`。生成したdistを兄弟フォルダーserverのExpressが配信します。Root DirectoryをdexmanにするRender設定の詳細は、リポジトリルートのRENDER_DEPLOY.mdを参照してください。

既定の対戦接続先は、本番では画面と同じURL、Viteの開発サーバーでは http://127.0.0.1:2567 。環境変数VITE_GAME_SERVERで明示的に変更できます。

旧Sitesスターターの補助ファイルは残していますが、Viteのエントリーはindex.htmlとmain.tsxです。ビルド対象は実際に利用する画面・ゲーム型・設定に限定しています。