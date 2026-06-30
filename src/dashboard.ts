// SNSの右腕 会員ダッシュボード（共通シェル v2・クリーン白/青）。
// 会員目線・平易な日本語。合言葉(API_TOKEN)はブラウザのlocalStorageに保存。
// ダークモードは将来：色は :root のCSS変数に集約してあるので後から差し込める。
//
// 注意：内側JSはバッククォートと ${ } を使わない。JS文字列内の改行は \\n。

export const DASHBOARD_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SNSの右腕 {{ENV_LABEL}}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.31.0/dist/tabler-icons.min.css">
<style>
  :root{
    --bg:#ffffff; --surface:#f6f8fb; --card:#ffffff; --border:#e6eaef; --border-strong:#d6dde4;
    --text:#1b1f24; --muted:#697079; --faint:#99a1ab;
    --accent:#2f86d8; --accent-strong:#185fa5; --accent-bg:#e9f2fc;
    --ok:#1d9e75; --danger:#c0392b;
    --radius:10px; --radius-sm:8px;
  }
  *{ box-sizing:border-box; }
  body{ margin:0; font-family:-apple-system,system-ui,sans-serif; color:var(--text); background:var(--bg); line-height:1.7; }
  a{ color:inherit; text-decoration:none; }
  .note a{ color:var(--accent); text-decoration:underline; }
  button{ font-size:14px; font-family:inherit; padding:9px 15px; border-radius:var(--radius-sm); border:1px solid var(--border-strong); background:var(--card); color:var(--text); cursor:pointer; }
  button:hover{ background:var(--surface); }
  button.primary{ background:var(--accent); border-color:var(--accent); color:#fff; }
  button.primary:hover{ background:var(--accent-strong); }
  button.accent{ background:var(--card); border-color:var(--accent); color:var(--accent-strong); }
  button.soft{ border-color:var(--border); color:var(--muted); }
  input,textarea,select{ font-size:15px; font-family:inherit; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-strong); width:100%; background:var(--card); color:inherit; }
  textarea{ min-height:120px; }
  label{ font-size:13px; color:var(--muted); display:block; margin:12px 0 4px; }
  .shell{ display:flex; min-height:100vh; }
  .side{ width:222px; flex:0 0 222px; border-right:1px solid var(--border); background:var(--surface); padding:16px 12px; }
  .brand{ display:flex; align-items:center; gap:8px; padding:4px 8px 14px; font-weight:500; }
  .brand i{ color:var(--accent); font-size:20px; }
  .grp{ font-size:12px; color:var(--faint); padding:12px 10px 4px; }
  .nav{ display:flex; align-items:center; gap:11px; padding:9px 10px; border-radius:var(--radius-sm); color:var(--muted); font-size:14px; cursor:pointer; }
  .nav i{ font-size:18px; }
  .nav:hover{ background:var(--card); }
  .nav.on{ background:var(--accent-bg); color:var(--accent-strong); font-weight:500; }
  .main{ flex:1; min-width:0; }
  .top{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 24px; border-bottom:1px solid var(--border); }
  .hello{ font-size:15px; }
  .body{ padding:22px 24px; max-width:760px; }
  h2{ font-size:18px; font-weight:500; margin:0 0 4px; }
  .lead{ color:var(--muted); font-size:13px; margin:0 0 14px; }
  .card{ border:1px solid var(--border); border-radius:var(--radius); background:var(--card); padding:16px; margin:12px 0; }
  .draft{ border-left:3px solid var(--accent); border-radius:0 var(--radius) var(--radius) 0; }
  .reply{ color:var(--muted); font-size:14px; border-top:1px dashed var(--border-strong); margin-top:10px; padding-top:8px; }
  /* 2ポスト連結（スレッド）の階層表示 */
  .thread{ display:flex; flex-direction:column; }
  .tw{ border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--surface); padding:9px 12px; }
  .tw-h{ font-size:11px; font-weight:700; color:var(--accent-strong); margin-bottom:4px; display:flex; align-items:center; gap:5px; }
  .tw-conn{ width:2px; height:14px; background:var(--border-strong); margin:0 0 0 18px; }
  /* API料金の目安テーブル */
  table.usage{ width:100%; border-collapse:collapse; font-size:14px; }
  table.usage td{ padding:8px 4px; border-bottom:1px solid var(--border); }
  table.usage td.c{ text-align:right; white-space:nowrap; }
  table.usage tr.sum td{ font-weight:700; border-bottom:none; color:var(--accent-strong); font-size:15px; }
  /* ランキングのタブ */
  .rtab{ padding:6px 12px; border:1px solid var(--border-strong); border-radius:999px; background:var(--card); font-size:13px; cursor:pointer; color:var(--muted); }
  .rtab.on{ background:var(--accent-bg); border-color:var(--accent); color:var(--accent-strong); font-weight:600; }
  .rrow{ border-bottom:1px solid var(--border); padding:8px 0; }
  .rankwrap{ overflow-x:auto; }
  table.ranktbl{ width:100%; border-collapse:collapse; font-size:13px; white-space:nowrap; }
  table.ranktbl th{ text-align:right; padding:6px 7px; border-bottom:2px solid var(--border-strong); cursor:pointer; color:var(--muted); font-weight:600; user-select:none; }
  table.ranktbl th.on{ color:var(--accent-strong); }
  table.ranktbl td{ text-align:right; padding:6px 7px; border-bottom:1px solid var(--border); }
  table.ranktbl th:first-child, table.ranktbl td:first-child{ text-align:left; white-space:normal; max-width:220px; }
  /* Xで見るボタン（ピル型） */
  a.xbtn{ display:inline-flex; align-items:center; gap:4px; padding:3px 10px; margin-top:4px; border:1px solid var(--border-strong); border-radius:999px; font-size:12px; font-weight:600; color:var(--text); text-decoration:none; background:var(--card); white-space:nowrap; line-height:1.4; }
  a.xbtn:hover{ border-color:var(--accent); color:var(--accent-strong); background:var(--accent-bg); }
  /* 学習サイクルの指針カード */
  .hintcard{ border:1px solid var(--border-strong); border-radius:var(--radius); padding:14px; margin-bottom:10px; background:var(--surface); }
  .hintcard.on{ border-color:var(--accent); border-width:2px; background:var(--accent-bg); }
  .hintcard .hc-text{ font-size:14px; line-height:1.55; }
  .row{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .tile{ background:var(--surface); border-radius:var(--radius-sm); padding:14px 16px; }
  .tile .n{ font-size:24px; font-weight:500; }
  .tile .k{ font-size:12px; color:var(--muted); }
  .pill{ font-size:12px; color:var(--muted); background:var(--surface); padding:4px 10px; border-radius:var(--radius-sm); }
  .msg{ font-size:14px; min-height:20px; margin:6px 0 10px; }
  .msg.ok{ color:var(--ok); } .msg.ng{ color:var(--danger); }
  .note{ color:var(--faint); font-size:12px; }
  .hidden{ display:none; }
  pre{ white-space:pre-wrap; word-break:break-word; margin:0; font-size:15px; font-family:inherit; }
  .envbar{ background:#f6c453; color:#4a3206; text-align:center; padding:7px 12px; font-size:13px; font-weight:500; }
  .login{ max-width:380px; margin:8vh auto; padding:24px; }
  .twrap{ max-width:560px; margin:5vh auto; padding:0 16px; }
  .tsteps{ display:flex; align-items:center; gap:5px; margin:14px 0 20px; }
  .tstep{ flex:1; text-align:center; padding:7px 4px; border-radius:var(--radius-sm); background:var(--surface); font-size:12px; color:var(--muted); }
  .tstep.on{ background:var(--accent-bg); color:var(--accent-strong); font-weight:500; }
  .tstep.done{ color:var(--ok); }
  .tarrow{ flex:none; color:var(--muted); font-size:13px; line-height:1; }
  .chips{ display:flex; flex-wrap:wrap; gap:7px; margin:5px 0 2px; }
  .chip{ display:inline-flex; align-items:center; padding:6px 12px; border:1px solid var(--border-strong); border-radius:999px; font-size:13px; cursor:pointer; background:var(--card); user-select:none; }
  .chip:has(input:checked){ background:var(--accent-bg); border-color:var(--accent); color:var(--accent-strong); font-weight:500; }
  .chip input{ position:absolute; opacity:0; width:0; height:0; }
  .pbar{ height:8px; background:var(--surface); border-radius:999px; overflow:hidden; margin:8px 0 16px; }
  .pfill{ height:100%; background:var(--accent); border-radius:999px; transition:width .35s; }
  .stars{ display:inline-flex; align-items:center; gap:1px; }
  .star{ color:#d4d4d4; cursor:pointer; font-size:20px; line-height:1; padding:0 1px; }
  .star.on{ color:#f5a623; }
  .spin{ width:30px; height:30px; border:3px solid var(--surface); border-top-color:var(--accent); border-radius:50%; animation:spin .8s linear infinite; margin:6px auto; }
  @keyframes spin{ to{ transform:rotate(360deg); } }
  pre.clamp{ max-height:6.4em; overflow:hidden; }
  pre.clamp.open{ max-height:none; }
  .switch{ position:relative; display:inline-block; width:46px; height:26px; flex:none; }
  .switch input{ display:none; }
  .slider{ position:absolute; inset:0; background:var(--border-strong); border-radius:999px; transition:.2s; cursor:pointer; }
  .slider:before{ content:""; position:absolute; width:20px; height:20px; left:3px; top:3px; background:#fff; border-radius:50%; transition:.2s; }
  .switch input:checked + .slider{ background:var(--accent); }
  .switch input:checked + .slider:before{ transform:translateX(20px); }
  .netaItem{ display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 10px; border:1px solid var(--border); border-radius:var(--radius-sm); margin-bottom:6px; font-size:13px; }
  .badge{ display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px; padding:0 5px; margin-left:6px; border-radius:999px; background:#e0245e; color:#fff; font-size:11px; font-weight:600; line-height:1; }
  /* 常設AIチャット（右カラム・折りたたみ） */
  .chatfab{ position:fixed; right:20px; bottom:20px; width:54px; height:54px; padding:0; border-radius:50%; background:var(--accent); border-color:var(--accent); color:#fff; box-shadow:0 4px 16px rgba(0,0,0,.20); font-size:24px; display:flex; align-items:center; justify-content:center; z-index:50; }
  .chatfab:hover{ background:var(--accent-strong); }
  .chatfab.hide{ display:none; }
  .chatdock{ position:fixed; top:0; right:0; width:384px; max-width:94vw; height:100vh; height:100dvh; background:var(--card); border-left:1px solid var(--border); box-shadow:-8px 0 28px rgba(0,0,0,.12); display:flex; flex-direction:column; transform:translateX(100%); transition:transform .25s ease; z-index:60; }
  .chatdock.open{ transform:translateX(0); }
  .chat-head{ display:flex; align-items:center; justify-content:space-between; gap:8px; padding:13px 16px; border-bottom:1px solid var(--border); flex:none; }
  .chat-head b{ display:flex; align-items:center; gap:7px; font-weight:600; font-size:15px; }
  .chat-head b i{ color:var(--accent); font-size:19px; }
  .chat-head button{ padding:5px 9px; }
  .chat-log{ flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; }
  .chat-msg{ max-width:90%; padding:10px 13px; border-radius:14px; font-size:14px; line-height:1.8; white-space:pre-wrap; word-break:break-word; }
  .chat-msg.u{ align-self:flex-end; background:var(--accent); color:#fff; border-bottom-right-radius:4px; }
  .chat-msg.a{ align-self:flex-start; background:var(--surface); color:var(--text); border-bottom-left-radius:4px; }
  .chat-msg.a.think{ color:var(--muted); }
  .chat-msg.a a{ color:var(--accent); text-decoration:underline; }
  .chat-hint{ align-self:center; text-align:center; color:var(--faint); font-size:12px; line-height:1.7; padding:8px 6px; }
  .chat-in{ display:flex; gap:8px; padding:12px 14px 4px; border-top:1px solid var(--border); align-items:flex-end; flex:none; }
  .chat-in textarea{ min-height:0; height:42px; max-height:120px; resize:none; line-height:1.5; }
  .chat-in button{ flex:none; padding:10px 13px; }
  .chat-foot{ padding:2px 14px 10px; flex:none; }
  @media (max-width:760px){
    .shell{ flex-direction:column; }
    .side{ width:auto; flex:none; border-right:none; border-bottom:1px solid var(--border); display:flex; gap:4px; overflow-x:auto; padding:8px; }
    .brand,.grp{ display:none; }
    .nav{ flex-direction:column; gap:3px; font-size:11px; padding:6px 9px; white-space:nowrap; }
    .nav i{ font-size:20px; }
    .top{ padding:12px 16px; }
    .body{ padding:16px; }
    .chatfab{ right:14px; bottom:14px; }
    .chatdock{ width:100vw; max-width:100vw; }
  }
</style>
</head>
<body>
{{ENV_BANNER}}
<div id="login" class="login card">
  <div class="brand" style="padding-left:0"><i class="ti ti-plant-2"></i> SNSの右腕</div>
  <p class="lead">あなたの合言葉でログインしてください。合言葉はこの端末だけに保存され、外には出ません。</p>
  <input id="tok" type="password" placeholder="あなたの合言葉" onkeydown="if(event.key==='Enter')saveToken()">
  <div class="row" style="margin-top:12px"><button class="primary" onclick="saveToken()">はじめる</button></div>
  <p id="loginErr" style="color:var(--danger);font-size:13px;margin:8px 0 0"></p>
</div>

<div id="tutorial" class="hidden">
  <div class="twrap">
    <div class="brand" style="padding-left:0"><i class="ti ti-plant-2"></i> SNSの右腕</div>
    <div id="tsteps" class="tsteps"></div>
    <div id="tbody"></div>
    <div id="tmsg" class="msg"></div>
  </div>
</div>

<div id="app" class="shell hidden">
  <nav class="side">
    <div class="brand"><i class="ti ti-plant-2"></i> SNSの右腕</div>
    <div class="nav" data-s="home" onclick="nav('home')"><i class="ti ti-layout-dashboard"></i> ダッシュボード</div>
    <div class="grp"><i class="ti ti-brand-x"></i> X自動化</div>
    <div class="nav" data-s="review" onclick="nav('review')"><i class="ti ti-pencil"></i> 承認＆添削<span class="badge" id="badge-review" style="display:none"></span></div>
    <div class="nav" data-s="scheduled" onclick="nav('scheduled')"><i class="ti ti-calendar"></i> 予約済み＆投稿済み</div>
    <div class="nav" data-s="learn" onclick="nav('learn')"><i class="ti ti-database"></i> 学習データ＆サイクル</div>
    <div class="nav" data-s="analysis" onclick="nav('analysis')"><i class="ti ti-chart-line"></i> 分析＆改善</div>
    <div class="nav" data-s="newtype" onclick="nav('newtype')"><i class="ti ti-wand"></i> 型の開発</div>
    <div class="nav" data-s="typesearch" onclick="nav('typesearch')"><i class="ti ti-search"></i> 型の検索</div>
    <div class="nav" data-s="typemanage" onclick="nav('typemanage')"><i class="ti ti-adjustments"></i> 型の管理</div>
    <div class="nav" data-s="cards" onclick="nav('cards')"><i class="ti ti-photo"></i> 画像カードの型</div>
    <div class="nav" style="opacity:.45;cursor:default" title="今後対応予定（Threads・Instagram など）"><i class="ti ti-circle-plus"></i> 他のSNS（近日）</div>
    <div class="grp">計測</div>
    <div class="nav" data-s="cv" onclick="nav('cv')"><i class="ti ti-target-arrow"></i> クリック＆CV解析</div>
    <div class="grp">管理</div>
    <div class="nav" data-s="invite" id="nav-invite" onclick="nav('invite')" style="display:none"><i class="ti ti-gift"></i> 仲間を招待</div>
    <div class="nav" data-s="usage" onclick="nav('usage')"><i class="ti ti-receipt"></i> API料金の目安</div>
    <div class="nav" data-s="settings" onclick="nav('settings')"><i class="ti ti-settings"></i> アカウント設定</div>
    <div class="nav" data-s="help" onclick="nav('help')"><i class="ti ti-help"></i> ヘルプ</div>
    <div class="grp" id="grp-dev" style="display:none">開発（devのみ）</div>
    <div class="nav" data-s="uikit" id="nav-uikit" onclick="nav('uikit')" style="display:none"><i class="ti ti-palette"></i> UIサンプル</div>
  </nav>

  <div class="main">
    <div class="top">
      <div id="hello" class="hello">つないでいます…</div>
      <button class="soft" onclick="logout()">ログアウト</button>
    </div>
    <div class="body">
      <div id="updBanner" style="display:none;background:#fef3c7;border:1px solid #f6c453;color:#4a3206;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:14px"></div>
      <div id="msg" class="msg"></div>

      <section id="s-home" class="screen">
        <h2>ダッシュボード</h2>
        <p class="lead">今やること・手応え・AIの学習が、ひと目で分かります。</p>
        <div id="homeBody"><div class="note">読み込み中…</div></div>
      </section>

      <section id="s-review" class="screen hidden">
        <h2>承認＆添削</h2>
        <p class="lead">下書きを★で評価（★5＝採用して投稿／★4以下＝不採用）。直したいものは添削して投稿。どちらもAIの学習になります。</p>
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <div>
              <label style="margin:0">承認のしかた</label>
              <div class="note" id="modeNote">最初は「手動承認モード」がおすすめ（AIが文体を覚える期間）</div>
            </div>
            <div class="row" style="align-items:center;gap:10px">
              <span class="note" id="modeStateLabel" style="font-size:14px;color:var(--text)">自動承認モードに切り替える</span>
              <label class="switch"><input type="checkbox" id="modeToggle" onchange="setMode()"><span class="slider"></span></label>
            </div>
          </div>
        </div>
        <div class="card note" id="autoNote" style="display:none">⚙️ <b>自動承認モードです。</b>AIが学習を基に自動でポストを作り、予定の時刻に投稿します。学習サイクルを回すほど、実際の反応を学習し、ポストの精度が上がっていきます。予約中のポストは「予約済み＆投稿済み」から確認できます。学習データ・学習サイクルの設定は「学習データ＆サイクル」から行えます。この画面でやることは特にありません。手動承認モードに戻すと、ここで1本ずつ承認・添削できます。</div>
        <div id="reviewActions">
          <div class="row" style="align-items:center;gap:8px;margin:6px 0"><label style="margin:0">ポストの型</label>
            <select id="postType" onchange="onPostTypeChange()">
              <option value="">おまかせ（AIが選ぶ）</option>
              <option data-key="1" value="数字・実績から##single_short">数字・実績から</option>
              <option data-key="1" value="体験・告白から##single_short">体験・告白から</option>
              <option data-key="1" value="逆張り・言い切り##single_short">逆張り・言い切り</option>
              <option data-key="1" value="1行目のフック強め##single_short">1行目のフック強め</option>
              <option data-key="1" value="たとえ話##single_short">たとえ話</option>
              <option data-key="1" value="作品・引用から##single_short">作品・引用から</option>
              <option data-key="1" value="問いかけ##single_short">問いかけ</option>
              <option data-key="1" value="箇条書き##single_short">箇条書き</option>
              <option data-key="1" value="🧵 問い→逆転の答え##thread_short">🧵 問い→逆転の答え</option>
              <option data-key="1" value="🧵 体験→気づき##thread_short">🧵 体験→気づき</option>
              <option data-key="1" value="🧵 結論→理由##thread_short">🧵 結論→理由</option>
              <option data-key="1" value="🧵 常識→本音##thread_short">🧵 常識→本音</option>
              <option data-key="1" value="🧵 事例→法則##thread_short">🧵 事例→法則</option>
              <option data-key="1" value="🧵 数字→裏側##thread_short">🧵 数字→裏側</option>
              <option id="optUrl" hidden disabled value="url">🔗 URL誘導（リンクで飛ばす）</option>
            </select>
          </div>
          <div class="note" style="margin:2px 0 4px">🧵「→」が付く型は<b>2ポスト連結</b>（1本目→2本目のスレッド）です。🔗 URL誘導は<b>クリック＆CV解析で解放</b>した人だけ出ます。</div>
          <div class="row" id="urlStyleRow" style="align-items:center;gap:8px;margin:6px 0;display:none">
            <span class="note">誘導の型：</span>
            <select id="urlStyle" style="flex:1;min-width:200px">
              <option value="">おまかせ（AIが選ぶ）</option>
              <option value="結論→続きはリンク">結論→続きはリンク</option>
              <option value="体験談→リンク">体験談→リンク</option>
              <option value="問題提起→リンク">問題提起→リンク</option>
              <option value="数字・実績→リンク">数字・実績→リンク</option>
              <option value="一部公開→リンク">一部公開→リンク</option>
              <option value="告知・締切→リンク">告知・締切→リンク</option>
            </select>
          </div>
          <div class="row" id="urlTargetRow" style="align-items:center;gap:8px;margin:6px 0;display:none">
            <span class="note">飛ばし先：</span>
            <select id="urlTarget" style="flex:1;min-width:200px"></select>
          </div>
          <div class="row" id="urlNoLink" style="align-items:center;gap:8px;margin:6px 0;display:none">
            <span class="note" style="color:var(--danger)">飛ばし先URLが未登録です。</span>
            <button class="accent" onclick="nav('settings')">アカウント設定で登録</button>
          </div>
          <div class="row" id="longMixRow" style="align-items:center;gap:8px;margin:6px 0;display:none">
            <label class="switch"><input type="checkbox" id="longMix" checked><span class="slider"></span></label>
            <span class="note">生成するポストに長文ポストも入れる（Premium・5本のうち1〜2本）</span>
          </div>
          <div class="note" id="threadLenNote" style="display:none;margin:2px 0 4px">🧵 連結タイプでは<b>1本目は140字以内</b>（短い引き）に固定されます。</div>
          <div class="row" style="margin:0 0 4px">
            <button class="primary" onclick="generate()"><i class="ti ti-plus"></i> この型でAIに5件ポストを作らせる</button>
          </div>
          <div class="note" style="margin:0 0 4px;opacity:.85">💳 生成すると、あなたのClaude APIに料金が発生します（ポスト1本あたり約3〜5円）。</div>
          <div class="note" style="margin:2px 0 4px">💡 あなたの<b>文体（過去ポスト＋添削）</b>・<b>発信の方向性</b>・<b>ネタ元データ</b>・これまでの<b>添削や★評価</b>・<b>反応データ</b>を、すべて踏まえて生成します。</div>
        </div>
        <div id="drafts"></div>
      </section>

      <section id="s-scheduled" class="screen hidden">
        <h2>予約済み＆投稿済み</h2>
        <p class="lead">これから自動で出る予定の投稿と、出し終えた投稿の一覧です。時刻の調整・削除もできます。</p>

        <div class="row" style="gap:8px;margin:4px 0 14px">
          <span class="rtab on" id="sctab-queued" onclick="schedTab('queued')">予約中 <span id="qCount"></span></span>
          <span class="rtab" id="sctab-posted" onclick="schedTab('posted')">投稿済み <span id="pCount"></span></span>
        </div>

        <div id="scpane-queued">
          <div id="cycleInfo" class="card" style="background:var(--accent-bg);border-color:#b5d4f4;padding:10px 14px;display:none"></div>
          <div class="card">
            <div style="font-weight:500;margin-bottom:6px">基本の配信タイミング</div>
            <div class="note" style="margin-bottom:8px">1日に出す<b id="freqLabel"></b>の、それぞれの時刻を決めます（JST）。本数は「学習データ＆サイクル」で変更できます。<br>⏱ 実際の投稿は<b>前後10分ほどゆらぎます</b>（毎回きっかり同じ時刻だと機械的なので、自然なゆらぎを入れています）。<br>🤖 メトリクス取得・学習・生成は、<b>その日いちばん早い投稿の約30分前</b>に自動で回ります（何時に設定しても、投稿までに用意が間に合います）。</div>
            <div id="slotInputs"></div>
            <div class="row" style="margin-top:10px"><button class="primary" onclick="saveSlots(false)">保存</button><button class="soft" onclick="saveSlots(true)">保存して予約を組み直す</button><button class="soft" onclick="resetSlots()" title="本数に合わせたおすすめの時間に戻します">おすすめに戻す</button></div>
          </div>
          <div class="row" style="justify-content:space-between;align-items:center;margin:14px 0 4px;gap:8px;flex-wrap:wrap">
            <h3 style="font-size:15px;font-weight:500;margin:0">予約済み（投稿待ち）</h3>
            <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
              <button class="soft" id="cancelBtn" onclick="cancelQueued()" title="今ある予約（投稿待ち）をすべて削除します。投稿済み・添削待ちは消えません">🗑 予約を全てキャンセルする</button>
              <span class="row" style="gap:4px;align-items:center">
                <button class="primary" id="genBtn" onclick="genDays()" title="今の学習で1日分のポストを生成して予約に追加します（在庫上限まで）。一度に作れるのは1日分です">✨ 1日分を追加</button>
              </span>
            </div>
            <div class="note" style="margin:4px 0 0;opacity:.85">💳 生成すると、あなたのClaude APIに料金が発生します（ポスト1本あたり約3〜5円。画像付きはカード要約ぶんが少し加算）。</div>
          </div>
          <div id="queued"></div>
          <div id="failedWrap" style="display:none">
            <h3 style="font-size:15px;font-weight:500;margin:18px 0 4px;color:#c0392b">⚠️ 投稿エラー（X側で弾かれたもの）</h3>
            <div id="failed"></div>
          </div>
        </div>

        <div id="scpane-posted" class="hidden">
          <p class="note" style="margin:0 0 10px">投稿した順に並びます（新しい順）。反応の数字は毎日自動で集計され、ここに反映されます。</p>
          <div id="posted"></div>
          <details style="margin-top:18px">
            <summary class="note" style="cursor:pointer;font-size:15px">不採用（★4以下で評価したもの・学習に使われます）</summary>
            <div id="notAdopted" style="margin-top:8px"></div>
          </details>
        </div>
      </section>

      <section id="s-learn" class="screen hidden">
        <h2>学習データ＆サイクル</h2>
        <p class="lead">SNSの右腕は、学習サイクルと学習データに基づき、より良いポストを生成します。</p>

        <div class="card">
          <label style="margin:0;font-size:15px;color:var(--text)">学習サイクル</label>
          <div class="note" style="margin:4px 0 8px">数日に一度、出した投稿の反応をまとめて学び、新しい下書きを補充します。その1まとまりが「1サイクル」です。</div>
          <div class="row" style="align-items:center;gap:8px;margin-bottom:6px"><label style="margin:0;width:120px">1日のポスト数</label><select id="cycFreq" onchange="updCycleCalc()"></select></div>
          <div class="row" style="align-items:center;gap:8px;margin-bottom:6px"><label style="margin:0;width:120px">サイクル日数</label><select id="cycDays" onchange="updCycleCalc()"></select></div>
          <div class="note" id="cycleCalc" style="margin:8px 0;font-size:14px"></div>
          <div class="note" style="line-height:1.9">この1サイクルで、AIは次のことをします：<br>① 出した投稿の<b>反応（反応率・表示回数・いいね・リポスト）</b>を集計<br>② よく伸びた<b>型・時間帯・テーマ</b>を学ぶ<br>③ 学びを反映して<b>次の下書きを補充</b><br>※ 投稿数が多いほど学習が安定します（<b>1サイクル10ポスト以上を推奨</b>）。</div>
          <div class="row" style="margin-top:10px"><button class="primary" onclick="saveCycle()">保存</button></div>
        </div>

        <div class="card">
          <label style="margin:0;font-size:15px;color:var(--text)">① 過去のポストを学習させる</label>
          <div class="note" id="voiceState" style="margin:4px 0 10px">確認中…</div>
          <div class="note" style="margin-bottom:8px">連携時に直近100件は学習済みで、<b>これだけでも必要十分</b>です。もっと過去まで遡りたいときに件数を増やしてください。<br>※ <b>取り直して学習し直す</b>仕組みです（新しい順にしか取れないため、選んだ件数を上から読み直します。スキップではありません）。</div>
          <div class="row" style="align-items:center;gap:8px;flex-wrap:wrap">
            <label style="margin:0">直近</label>
            <select id="learnCount" onchange="updLearnCost()">
              <option value="200" selected>200件</option>
              <option value="300">300件</option>
              <option value="500">500件</option>
            </select>
            <span class="note">を学習</span>
            <button class="primary" onclick="learnMore()">学習し直す</button>
          </div>
          <div class="note" id="learnCost" style="margin-top:6px"></div>
          <span id="learnState" class="note"></span>
        </div>

        <div class="card">
          <label style="margin:0;font-size:15px;color:var(--text)">② ポストのネタ元データをアップロードする</label>
          <div class="note" style="margin:4px 0 10px">あなたが過去に書いた記事・セールスレター・メルマガ・YouTube台本・書き起こしなどを <b>txt / md ファイル</b> 形式でアップロードすると、AIがその内容の素材にしてポストを自動生成します。1ファイル最大500KB・最大50件までアップロード可能。</div>
          <input id="netaFile" type="file" accept=".txt,.md,text/plain,text/markdown" multiple onchange="uploadNeta()">
          <div id="netaState" class="note" style="margin-top:6px"></div>
          <div id="netaList" style="margin-top:8px"></div>
        </div>

        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:center">
            <div>
              <label style="margin:0;font-size:15px;color:var(--text)">③ 学習データを自動拡張する</label>
              <div class="note" id="expandNote" style="margin-top:4px"></div>
            </div>
            <label class="switch"><input type="checkbox" id="autoExpand" onchange="saveExpand()"><span class="slider"></span></label>
          </div>
        </div>
      </section>

      <section id="s-analysis" class="screen hidden">
        <h2>分析＆改善</h2>
        <p class="lead">投稿への反応（<b>反応率・表示回数・いいね・リポスト</b>）から、どの型・どの時間が効いたかを見て改善します。</p>
        <div class="card" style="background:var(--accent-bg);border-color:#b5d4f4;padding:10px 14px">
          <div class="note" style="color:var(--text);line-height:1.8">📈 <b>データは連携した今から少しずつ溜まっていきます。</b>反応（インプ・いいね等）は<b>これから投稿するぶん</b>を毎日自動で集計します。投稿が増えるほど、型・時間帯の精度が上がります。<br>※ Xの仕様で<b>過去の投稿には遡れません</b>（連携前の反応は取得できません）。今日がスタート地点です。</div>
        </div>
        <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <button class="soft" onclick="collectNow()"><i class="ti ti-refresh"></i> いまメトリクスを取得</button>
          <span class="note" style="color:var(--text)">💳 Xの読み取りAPIを使うため<b>取得のたびに料金が発生</b>します（通常は1日1回・自動。手動取得はその分だけ加算されます）</span>
        </div>
        <div class="row" id="periodTabs" style="gap:6px;margin-bottom:10px;align-items:center">
          <span class="note" style="margin-right:2px">集計期間：</span>
          <span class="rtab on" data-d="0" onclick="setPeriod(0)">全期間</span>
          <span class="rtab" data-d="90" onclick="setPeriod(90)">90日</span>
          <span class="rtab" data-d="30" onclick="setPeriod(30)">30日</span>
          <span class="rtab" data-d="14" onclick="setPeriod(14)">14日</span>
          <span class="rtab" data-d="7" onclick="setPeriod(7)">7日</span>
        </div>
        <div id="analysisBody"><div class="spin"></div></div>
      </section>

      <section id="s-cv" class="screen hidden">
        <h2>クリック＆CV解析</h2>
        <p class="lead"><b>誘導先URLを登録</b>すると<b>計測リンク</b>ができます。それをXのポスト（自動でも手動でも）に貼ると、<b>クリック</b>と、その先の<b>コンバージョン（登録・購入など）</b>を結びつけて成果が見えます。</p>

        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:flex-start;gap:8px">
            <div>
              <label style="margin:0;font-size:15px;color:var(--text)">誘導先URLの登録</label>
              <div class="note" style="margin-top:4px">LP・記事などの飛ばし先URLを登録（複数可・最大20件）。ここから計測リンクができます。<br>追加・編集の<b>4項目はすべて必須</b>です（飛び先の中身はAIが読めないので、<b>「リンク先の説明」</b>に沿って誘導ポストを作ります）。</div>
            </div>
          </div>
          <div id="linkList" style="margin-top:10px"></div>
          <div class="row" style="margin-top:8px"><button class="accent" id="linkAddBtn" onclick="openLinkForm(-1)">＋ URLを追加</button></div>
          <div id="linkForm" style="display:none;margin-top:10px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:12px">
            <div style="font-weight:600;margin-bottom:8px" id="linkFormTitle">URLを追加</div>
            <input id="linkLabel" placeholder="ラベル（管理名称・例：6月LP）">
            <input id="linkTitle" placeholder="リンクタイトル（例：AI活用 個別相談 受付ページ）" style="margin-top:6px">
            <input id="linkUrl" type="url" placeholder="URL（https://…）" style="margin-top:6px">
            <input id="linkUnit" type="number" min="0" step="1" placeholder="単価（円・任意）：1件のCVで上がる売上。例：50000" style="margin-top:6px">
            <div class="note" style="margin-top:2px">単価を入れておくと、CV（成果）が出るたびに「売上＝単価×CV数」が自動で計算されます。無料登録など売上が無い誘導先は空のままでOK。</div>
            <div class="row" style="margin-top:6px;align-items:center;gap:8px"><button class="soft" id="descBtn" onclick="describeLink()">🪄 リンク先をAIに要約させる</button><span class="note" id="descBtnNote"></span></div>
            <textarea id="linkDesc" maxlength="500" oninput="cnt('linkDesc')" placeholder="リンク先の説明（AIがこの説明に合わせて誘導ポストを作ります。例：経営者向けの個別相談募集ページ。AI活用で時間を作るのが主旨。締切◯日）／上のボタンでAIに要約させて、確認・修正してもOK" style="margin-top:6px;min-height:64px"></textarea>
            <div class="note" style="margin-top:2px"><span id="linkDescc">0</span> / 500 文字</div>
            <div class="row" style="margin-top:8px"><button class="primary" onclick="saveLinkForm()">保存</button><button class="soft" onclick="closeLinkForm()">やめる</button></div>
          </div>
          <div class="row" style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px;justify-content:space-between;align-items:center">
            <div><label style="margin:0;font-size:14px;color:var(--text)">自動でURL誘導ポストも作る</label><div class="note" style="margin-top:2px">ONにすると、自動生成に「🔗 URL誘導」ポストが混ざります（登録URLへ誘導）。⚠️ リンク付きは伸びにくく、1回で2ツイート分の料金。</div></div>
            <label class="switch"><input type="checkbox" id="urlSwitch" onchange="saveUrlPosts()"><span class="slider"></span></label>
          </div>
        </div>

        <div id="cvBody"><div class="spin"></div></div>
      </section>

      <section id="s-newtype" class="screen hidden">
        <h2>型の開発</h2>
        <p class="lead">まず<b>型の構造</b>（短文/長文・単発/連結・画像の有無）を選び、つづけて「こんな型がほしい」というイメージ、または参考にしたいポストを入れると、AIが<b>型のプロンプト</b>を作ります。サンプルで試し、添削・追加指示で整えて、気に入ったら採用。プロンプトはAIが作るので、書き方は気にしなくてOK。<br>みんなの実績で効くと分かった型から探したいときは <a style="cursor:pointer;text-decoration:underline" onclick="nav('typesearch')">型の検索</a> へ。</p>
        <div id="ntBody"></div>
      </section>

      <section id="s-typesearch" class="screen hidden">
        <h2>型の検索</h2>
        <p class="lead">会員みんなの実績から<b>「効く」と分かった型</b>（集合知）を探せます。キーワードで絞り込み、気に入った型は「使ってみる」で取り込み → <b>型の開発</b>であなた仕様に育ててから採用します。</p>
        <div class="card">
          <div class="row" style="gap:8px;flex-wrap:nowrap;align-items:center">
            <input id="tsQ" type="search" placeholder="キーワードで検索（型名・内容）" oninput="tsSearch()" style="flex:1">
            <select id="tsSort" onchange="renderTypeSearch()" style="width:auto">
              <option value="score">スコアが高い順</option>
              <option value="posts">ポストが多い順</option>
              <option value="members">使っている人が多い順</option>
            </select>
          </div>
          <div class="row" style="gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap">
            <span class="note">ラベルで絞り込み：</span>
            <select id="tsPat" onchange="renderTypeSearch()" style="width:auto">
              <option value="">すべてのパターン</option>
              <option value="single_short">単発・短文</option>
              <option id="tsPatLong1" value="single_long">単発・長文</option>
              <option value="thread_short">連結・短文</option>
              <option id="tsPatLong2" value="thread_long">連結・短＋長</option>
              <option value="url">🔗 URLに繋げる</option>
              <option class="tsPatImg" value="img_ss_one" hidden disabled>🖼 短文・単発＋画像（一文）</option>
              <option class="tsPatImg tsPatImgLong" value="img_sl_one" hidden disabled>🖼 長文・単発＋画像（一文）</option>
              <option class="tsPatImg" value="img_ts_one" hidden disabled>🖼 短文＋短文・連結＋画像（一文）</option>
              <option class="tsPatImg tsPatImgLong" value="img_tl_one" hidden disabled>🖼 短文＋長文・連結＋画像（一文）</option>
              <option class="tsPatImg" value="img_ss_list" hidden disabled>🖼 短文・単発＋画像（箇条書き）</option>
              <option class="tsPatImg tsPatImgLong" value="img_sl_list" hidden disabled>🖼 長文・単発＋画像（箇条書き）</option>
              <option class="tsPatImg" value="img_ts_list" hidden disabled>🖼 短文＋短文・連結＋画像（箇条書き）</option>
              <option class="tsPatImg tsPatImgLong" value="img_tl_list" hidden disabled>🖼 短文＋長文・連結＋画像（箇条書き）</option>
            </select>
          </div>
          <div class="note" style="margin-top:6px">🖼 画像付きの型は <a style="cursor:pointer;text-decoration:underline" onclick="nav('cards')">画像カードの型</a> をONにすると一覧に並びます。</div>
          <div class="row" style="gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap">
            <span class="note">スコア測定期間：</span>
            <select id="tsPeriod" onchange="renderTypeSearch()" style="width:auto">
              <option value="14">14日間</option>
              <option value="30" selected>30日間</option>
              <option value="90">90日間</option>
            </select>
            <span class="note" id="tsPeriodNote">期間が短いほど“今のトレンド”、長いほど“安定して効く型”</span>
          </div>
          <div class="note" id="tsCount" style="margin-top:8px"></div>
        </div>
        <div id="tsBody"><div class="spin"></div></div>
      </section>

      <section id="s-typemanage" class="screen hidden">
        <h2>型の管理</h2>
        <p class="lead">いま持っている型（自作・取込・カタログ）を一覧で運用します。各型を<b>採用 ON/OFF</b>で選び、<b>多め／普通／控えめ</b>で頻度を調整できます。<b>採用は常に10種類以上</b>を保ちます（それ以上は減らせません＝AIが“あなたに効く型”を見つける幅を確保）。自作・取込の型は編集・削除も可能。</p>
        <div id="tmBody"><div class="spin"></div></div>
      </section>

      <section id="s-cards" class="screen hidden">
        <h2>画像カードの型</h2>
        <p class="lead">投稿に付ける<b>画像カードの見た目（型）</b>を作ります。<b>あなた専用のテーマ</b>（配色・フォント・サイズ・ハンドル・ロゴ・背景）を設定でき、他の人とかぶりません。どの投稿にカードを付けるかは「型の開発」で型ごとに「画像の型（一文／箇条書き）」を選んで決めます。</p>
        <div id="cardsBody"><div class="spin"></div></div>
      </section>

      <section id="s-usage" class="screen hidden">
        <h2>API料金の目安</h2>
        <p class="lead">X と Claude（AI）の利用量から概算した<b>目安</b>です。実際の請求額ではありません（単価・為替は概算）。正確な金額は各サービスの請求画面でご確認ください。</p>
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
          <button class="soft" onclick="usageNav(-1)">◀ 前の月</button>
          <b id="usageMonthLabel" style="font-size:15px"></b>
          <button class="soft" id="usageNextBtn" onclick="usageNav(1)">次の月 ▶</button>
        </div>
        <div id="usageForecast"></div>
        <div id="usageBody"><div class="spin"></div></div>
        <div class="card">
          <h3 style="margin-top:0">計算の前提</h3>
          <div class="note" id="usageAssume"></div>
        </div>
      </section>

      <section id="s-settings" class="screen hidden">
        <h2>アカウント設定</h2>
        <p class="lead">アカウント全体に関わる設定です。（機能ごとの設定は各画面にあります）</p>

        <div class="card">
          <label style="margin:0;font-size:15px;color:var(--text)"><i class="ti ti-id-badge-2"></i> あなたの会員ID</label>
          <div class="row" style="align-items:center;gap:8px;margin-top:4px">
            <code id="memberIdView" onclick="copyMemberId()" title="クリックでコピー" style="cursor:pointer;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:13px">—</code>
            <span class="note" id="memberIdCopied" style="color:var(--ok)"></span>
          </div>
          <div class="note" style="margin-top:4px;font-size:12px">本部連携やサポート時の識別子です（変わりません）。クリックでコピーできます。</div>
        </div>

        <div class="card">
          <label style="margin:0;font-size:15px;color:var(--text)"><i class="ti ti-mail"></i> メールアドレス</label>
          <div class="note" style="margin:4px 0 6px;font-size:12px">大事なお知らせ・連絡に使います（本部からのお知らせメールの宛先）。</div>
          <div class="row" style="gap:6px;flex-wrap:nowrap;align-items:center">
            <input id="emailInput" type="email" placeholder="you@example.com" style="flex:1">
            <button class="primary" onclick="saveEmail()">保存</button>
          </div>
          <div class="note" id="emailMsg" style="margin-top:6px"></div>
        </div>

        <div class="card">
          <label style="margin:0;font-size:15px;color:var(--text)"><i class="ti ti-link"></i> Xとの連携</label>
          <div class="note" id="connState" style="margin:4px 0 6px">連携を確認中…</div>
          <!-- 投稿(書き込み)権限の確認。済んだら確認済み表示にして畳む -->
          <div id="writePane">
            <div class="row" style="align-items:center;gap:8px;margin-bottom:6px">
              <button class="soft" id="testPostBtn" onclick="testPost()">📮 テスト投稿（すぐ消す）</button>
              <span class="note" id="testPostNote"></span>
            </div>
            <div class="note" style="margin:-2px 0 10px;font-size:12px">「連携中」の確認は<b>読み取り</b>と<b>Claude鍵</b>まで。<b>投稿（書き込み）権限</b>はこのボタンで確認できます（テスト投稿を出してすぐ自動削除。タイムラインには残りません）。一度確認すれば次回からは出ません。</div>
          </div>
          <div id="writeDone" class="note" style="display:none;margin:2px 0 10px"></div>
          <details id="keyResetDetails" style="margin-bottom:8px">
            <summary style="cursor:pointer;font-weight:600">🔑 APIキーの再設定（通常は不要）</summary>
            <div class="note" style="margin:6px 0 10px;font-size:12px">鍵は一度連携すれば基本そのままでOK。鍵を入れ替えるときだけ開いてください。</div>
          <details style="margin-bottom:8px">
            <summary class="note" style="cursor:pointer">XのAPIキーの取得方法</summary>
            <div class="note" style="line-height:1.9;margin-top:6px">
              <b>1. 開発者登録</b>：<a href="https://developer.x.com" target="_blank" rel="noopener">developer.x.com</a> に自分のXアカウントでログイン（登録は無料）<br>
              <b>2. 支払い方法を登録</b>：2026年2月以降、API利用には<b>カード登録（従量課金）が必要</b>（新規の無料枠なし）。投稿1件 約$0.015・読み取り1件 約$0.005ほど<br>
              <b>3. アプリを作って権限をRead and Writeに</b>：「User authentication settings」で App permissions を <b>Read and Write</b> に（投稿に必須）。Callback URLは <a href="https://example.com" target="_blank" rel="noopener">https://example.com</a> 等でOK<br>
              <b>4. 4つの鍵を発行</b>：「Keys and tokens」で API Key（コンシューマーキー）/ API Key Secret（コンシューマーシークレット）/ Access Token / Access Token Secret を発行<br>
              ⚠️ Access Token は権限をRead and Writeに<b>した後</b>に発行（先だと読み取り専用→Regenerateで作り直し）。Secretは1度だけ表示なので、その場でコピー
            </div>
          </details>
          <details style="margin-bottom:10px">
            <summary class="note" style="cursor:pointer">ClaudeのAPIキーの取得方法</summary>
            <div class="note" style="line-height:1.9;margin-top:6px">
              <b>1. Consoleに登録</b>：<a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a> に登録/ログイン（Claude.aiの会話画面とは別物）<br>
              <b>2. 支払い方法を登録</b>：Billing で少額のクレジット/カードを登録（API利用に必要）<br>
              <b>3. 鍵を作る</b>：「API Keys」→「Create Key」<br>
              <b>4. コピー</b>：sk-ant-… で始まる鍵をコピー（1度だけ表示）<br>
              ※ 入力した鍵は暗号化して保存され、画面に再表示はされません。
            </div>
          </details>
          <details style="margin-bottom:10px">
            <summary class="note" style="cursor:pointer">💰 費用について（利用料は無料です）</summary>
            <div class="note" style="line-height:1.9;margin-top:6px">
              <b>SNSの右腕の利用料は無料です（月額0円）。</b><br>
              かかるのは、あなた自身が登録した X と Claude のAPIの<b>実費だけ</b>。各社へ直接・<b>使った分だけ</b>の支払いで、運営が受け取るお金はありません。動かしていない間は一切かかりません。<br><br>
              <b>単価の目安</b>（1ドル≒155円換算）<br>
              ・X：投稿 1件 約2円（リンク付きは約30円）／成果の集計 1件 約0.8円<br>
              ・Claude：文章の生成 <b>ポスト1本あたり 約3〜5円</b>（数本まとめて生成）<br><br>
              <b>1アカウントの月あたりの目安</b>（投稿3本/日・手動承認の場合）<br>
              ・X（投稿＋集計）：月 約500〜1,200円<br>
              ・Claude（文章の生成）：月 約300〜700円（学習は無料・計算だけ）<br>
              ・<b>合計：月 およそ800〜2,000円</b>（投稿や分析の頻度を下げればもっと安く）<br><br>
              <b>初回だけ</b>：連携時に過去の投稿（最大100件）を読んで文体を学習 → <b>一度だけ 約80円まで</b>。投稿が100件より少ない人は<b>もっと安く</b>（実際に読んだ件数ぶんだけ）。次回以降はかかりません。
            </div>
          </details>
          <div style="border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
            <div style="font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:6px"><i class="ti ti-brand-x"></i> X API（4つの鍵・投稿と分析に使用）</div>
            <label>API Key（コンシューマーキー）</label>
            <input id="xk1" placeholder="API Key（Consumer Key）">
            <label>API Key Secret（コンシューマーシークレット）</label>
            <input id="xk2" type="password" placeholder="API Key Secret（Consumer Secret）">
            <label>Access Token（アクセストークン）</label>
            <input id="xk3" placeholder="Access Token">
            <label>Access Token Secret（アクセストークンシークレット）</label>
            <input id="xk4" type="password" placeholder="Access Token Secret">
            <div id="xXerr" class="note" style="color:var(--danger);margin-top:8px"></div>
          </div>
          <div style="border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
            <div style="font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:6px"><i class="ti ti-sparkles"></i> Claude API（1つの鍵・AIの文章生成に使用）</div>
            <label>Claude APIキー</label>
            <input id="ck" type="password" placeholder="sk-ant-… （console.anthropic.com で取得）">
            <div id="xCerr" class="note" style="color:var(--danger);margin-top:8px"></div>
          </div>
          <div class="row" style="margin-top:6px"><button class="primary" onclick="connectX()">連携する</button></div>
          </details>
        </div>

        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:center">
            <div>
              <label style="margin:0;font-size:15px;color:var(--text)">Xの有料プラン（Premium）</label>
              <div class="note" id="premNote" style="margin-top:4px">連携時に自動判定。違っていればここで切り替えてください。</div>
            </div>
            <label class="switch"><input type="checkbox" id="premSwitch" onchange="savePremium()"><span class="slider"></span></label>
          </div>
          <div class="note" style="margin-top:8px">ONにすると<b>長文ポスト（最大1000文字）</b>も書けるようになり、生成にも長文が混ざります。</div>
        </div>

        <div class="card">
          <label style="margin:0;font-size:15px;color:var(--text)">発信の方向性</label>
          <div class="note" style="margin:4px 0 8px">最初に選んだ「何を・誰に・どんなスタンスで」です。生成の内容の指針になります。</div>
          <div id="dirView"></div>
        </div>
      </section>

      <section id="s-help" class="screen hidden">
        <h2>ヘルプ</h2>
        <p class="lead">困ったとき・仕組みを知りたいときに。下の「AIに聞く」で質問するか、見出しをタップして読めます。</p>

        <div class="card" style="border-color:var(--accent)">
          <b><i class="ti ti-message-chatbot"></i> AIに聞く（操作サポート）</b>
          <p class="note" style="margin:4px 0 8px;color:var(--text)">操作や仕組みについて、AIがこのアプリの仕様をもとに答えます。チャットは<b>右下の💬ボタンからどの画面でも</b>開けます（会話の続きで聞き直しもOK）。</p>
          <p class="note" style="margin:0 0 8px"><b>💳 回答はあなた自身が連携したClaude APIで生成されます。</b>そのため回答のたびに、あなたのClaudeにごく少額の料金が発生します（運営への支払いではありません）。</p>
          <div class="row"><button class="primary" onclick="chatOpen()"><i class="ti ti-message-chatbot"></i> AIチャットを開く</button></div>
        </div>

        <div class="card" style="background:var(--accent-bg);border-color:#b5d4f4">
          <b>かんたんに言うと</b>
          <p class="note" style="line-height:1.9;margin:6px 0 0;color:var(--text)">
            このサービスは、<b>あなたの代わりにXの下書きを毎日つくってくれるAIの右腕</b>です。あなたが過去の投稿を読ませると、AIが<b>あなたの文体のまま</b>下書きを用意します。あなたは<b>承認・添削するだけ</b>。直すほどAIがあなたらしくなり、反応の良い型を自分で学んでいきます。
          </p>
        </div>

        <h3 style="margin:18px 0 6px">使い方</h3>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">最初にやることは？</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">①「アカウント設定」で<b>XとClaudeを連携</b>（鍵を入れる）→ ②「学習データ＆サイクル」に<b>あなたの過去投稿</b>を登録 → ③あとはAIが下書きを用意します。連携すると過去投稿は自動で学習されます。</div></details>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">下書きはどうやってできる？投稿される？</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">AIが「学習データ＆サイクル」で決めたペースで下書きを用意します。<b>手動承認モード</b>なら「承認＆添削」であなたがOKした下書きだけが、決まった時間にXへ投稿されます。<b>自動承認モード</b>なら承認なしでAIが投稿まで進めます（いつでも切り替え可）。</div></details>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">手動承認モードと自動承認モードの違いは？</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)"><b>手動</b>＝あなたが1本ずつ確認・添削してから投稿（最初はこちらが安心）。<b>自動</b>＝確認なしでAIが投稿まで自動で回す（あなたらしさが育ってから推奨）。切り替えは「承認＆添削」または「アカウント設定」から。</div></details>

        <h3 style="margin:18px 0 6px">AIがあなたらしくなる仕組み</h3>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">添削するとどうなる？</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">あなたが直した文章は<b>そのままAIの学習</b>になります。直すほど、言い回し・リズム・締め方があなたに近づきます。★評価（良かった下書きに★5）も学習に使われます。</div></details>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">「テスト期」「微調整期」って何？</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">学習の段階です。<b>テスト期</b>＝いろんな型を幅広く試して、何が効くか探る時期。<b>微調整期</b>＝反応が良かった型を磨きつつ、たまに新しい型も試す時期。データがたまると自動で切り替わります。</div></details>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">「フォーカス」を選ぶと？</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">「分析＆改善」で改善カードを選ぶと、次の作成からAIがその方針に寄せて下書きを作ります（例：効いている型を多めに）。選ばなければ「おまかせ」で、AIがバランスよく回します。</div></details>

        <h3 style="margin:18px 0 6px">型（パターン）について</h3>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">「型」とは？</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">投稿の<b>組み立て方（切り口・引き・締め）</b>のことです。中身や文体はあなたのもので、型は「どう組み立てるか」だけを決めます。型には<b>構造の違い</b>（短文／長文、単発／2連結スレッド、画像カードの有無）もあります。AIは反応の良い型を多めに使うようになります。</div></details>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">自分の型を作りたい／直したい</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">「型の開発」で、<b>構造（短文／長文・単発／連結・画像有無）と切り口</b>を選び、イメージや参考ポストを入れるとAIが型をつくります。サンプルを添削・評価して鍛え、納得したら採用。登録済みの型は「型の管理」の<b>「編集・再トレーニング」</b>でいつでも直せます。</div></details>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">「型の検索（集合知）」って？</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">会員みんなの実績で<b>「効く」と分かった型</b>を探して取り込めます。借りるのは<b>型（組み立て方）だけ</b>で、文章は常にあなたの文体で作られます。共有されるのは型の構造と反応の数値だけで、<b>本文・文体・ネタ・APIキーは一切送られません</b>。同期は自動です。</div></details>

        <h3 style="margin:18px 0 6px">画像カード・誘導リンク</h3>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">投稿に画像（文字入り画像カード）を付けたい</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">「画像カードの型」で<b>ON</b>にし、テーマ（色・フォント・ロゴ）を選びます。対応する型に画像付きの候補が並び、<b>文字は自動で画像に収まります</b>。</div></details>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">リンクへの誘導・クリックやCVの計測は？</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">URL誘導ポストは<b>解放制</b>です。解放すると、登録したリンクへ誘導する投稿が作れ、<b>クリック数とコンバージョン（CV）を「クリック＆CV解析」で計測</b>できます。</div></details>

        <h3 style="margin:18px 0 6px">反応・料金</h3>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">反応や伸びはどこで見る？</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">「ダッシュボード」でフォロワーの推移といいね等の数字、直近の反応が見られます。型別・時間帯別の細かい成績は「分析＆改善」へ。数字は反応がたまってから出ます（自動取得・通常1日〜）。</div></details>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">料金はどれくらいかかる？</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">「API料金の目安」で、今月の概算と着地予想が見られます（<b>あくまで目安</b>）。かかるのは<b>あなた自身が契約したClaude APIとX APIの利用料だけ</b>（使った分のみ・運営への支払いはありません）。AIの下準備は安いモデル、本番の生成は高品質モデルと使い分けてムダを抑えています。<b>X(Twitter)のAPIは有料</b>（2026年2月以降は従量課金・読み取りも課金）、Cloudflareは無料枠で動きます。</div></details>

        <h3 style="margin:18px 0 6px">困ったとき</h3>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">投稿されない／予約が進まない</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">①「アカウント設定」でX・Claudeの<b>連携が有効か</b>確認 → ②「予約済み＆投稿済み」で<b>失敗（エラー）</b>が出ていないか確認（多くは文字数オーバーや鍵の期限切れ）。エラーは「直して再予約」で直せます。</div></details>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">下書きが似てしまう／同じネタが続く</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">直近の投稿とはネタが被らないように作っています。それでも続く場合は「学習データ＆サイクル」で<b>ネタ</b>や<b>発信の方向性</b>を足すと、引き出しが増えます。</div></details>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">困ったら</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">迷ったら、まずは<b>手動承認モード</b>にして、出てきた下書きを1本ずつ確認するのが安心です。AIは投稿前に必ずあなたの承認を待ちます（手動モード時）。それでも分からないことは<b>右下の💬「AIに聞く」</b>へどうぞ。</div></details>

        <h3 style="margin:18px 0 6px">データ・安全・停止</h3>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">鍵やデータの安全は？文体が乗っ取られたりしない？</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">鍵（X・Claude）も投稿本文も、<b>すべてあなた自身のCloudflare内に暗号化して保存</b>され、運営はアクセスしません。文体のお手本は<b>あなたの過去投稿だけ</b>なので、文体が乗っ取られることはありません。集合知に出るのは型の構造と反応の数値だけで、本文・文体・ネタ・APIキーは送られません。</div></details>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">運営からのお知らせメール・配信停止は？</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)">「アカウント設定」でお知らせメールの宛先を登録できます。運営からの案内が届きます。<b>配信はいつでも停止</b>できます（メール内の配信停止リンクから）。</div></details>
        <details class="card" style="margin:8px 0"><summary style="cursor:pointer;font-weight:500">止めたい・やめたいときは？</summary><div class="note" style="margin-top:8px;line-height:1.9;color:var(--text)"><b>承認モードを手動</b>にすれば、投稿前に必ず止まります。いつでも停止・退会できます。<a href="https://join.sns-migiude.com/terms" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">利用規約</a>・<a href="https://join.sns-migiude.com/privacy" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">プライバシーポリシー</a>もご確認ください。</div></details>
      </section>

      <section id="s-invite" class="screen hidden">
        <h2>仲間を招待</h2>
        <p class="lead">いまは招待制です。あなた専用の<b>招待コード（1つ）</b>で仲間を誘えます。このコードを使った人は、運営の承認を待たずにそのまま始められます。</p>

        <div id="invCard"><div class="spin"></div></div>
        <div id="invMsg" class="msg"></div>

        <div class="card">
          <b>招待された人の始め方（共有メッセージに含まれます）</b>
          <ol class="note" style="line-height:1.9;color:var(--text);margin:6px 0 0;padding-left:1.2em">
            <li>「アプリを作る」ボタンから、自分のCloudflareに自分専用のアプリを作る（無料枠）</li>
            <li>最初の設定で、あなたが渡した<b>招待コード</b>を入力する</li>
            <li>X と Claude を連携すれば、その人だけのAIの右腕が動き出します</li>
          </ol>
          <p class="note" style="margin:8px 0 0">※ 鍵もデータも招待された人自身のCloudflareに保存され、あなたからは見えません。費用もその人自身のAPI利用分だけです。</p>
        </div>
      </section>

      <section id="s-uikit" class="screen hidden">
        <h2>UIサンプル <span class="pill">開発用</span></h2>
        <p class="lead">このダッシュボードで使う部品のカタログ（<code>docs/UI_デザインガイド.md</code> の実物）。新しい画面はここの部品を組み合わせて作る。本番では非表示。</p>

        <div class="card">
          <h3 style="margin-top:0">ボタン</h3>
          <div class="row">
            <button class="primary">primary（主アクション）</button>
            <button class="accent">accent（添削など）</button>
            <button class="soft">soft（やめる・削除）</button>
            <button class="soft" disabled>soft（無効）</button>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-top:0">テキスト</h3>
          <p class="lead" style="margin:0 0 6px">lead：画面の説明（この画面で何をするか）</p>
          <p style="margin:0 0 6px">本文テキスト（--text）。ふつうの段落。</p>
          <div class="note">note：補足テキスト（--faint・小さめ）</div>
          <div class="row" style="margin-top:8px"><span class="pill">pill</span><span class="pill">タグ風</span></div>
        </div>

        <div class="card">
          <h3 style="margin-top:0">数値タイル / カード</h3>
          <div class="row">
            <div class="tile"><div class="n">1,234</div><div class="k">フォロワー</div></div>
            <div class="tile"><div class="n">5.6%</div><div class="k">反応率</div></div>
          </div>
          <div class="card draft" style="margin-bottom:0">draft：左に青帯のカード（下書き用）</div>
        </div>

        <div class="card">
          <h3 style="margin-top:0">トグル / 入力</h3>
          <div class="row" style="gap:14px">
            <label class="switch"><input type="checkbox" checked><span class="slider"></span></label>
            <span class="note">switch（ON/OFF）</span>
          </div>
          <div class="row" style="margin-top:10px;gap:10px">
            <input type="time" value="11:30">
            <input type="datetime-local">
          </div>
          <textarea style="margin-top:10px;min-height:60px" placeholder="textarea"></textarea>
        </div>

        <div class="card">
          <h3 style="margin-top:0">チップ選択（複数可・末尾に「その他」）</h3>
          <div id="uikit-chips"></div>
        </div>

        <div class="card">
          <h3 style="margin-top:0">星評価 / バッジ</h3>
          <div class="row" style="gap:16px">
            <span class="stars" id="uikit-stars"></span>
            <span class="note">★5＝採用 / ★4以下＝不採用</span>
            <span style="position:relative">通知<span class="badge" style="display:inline-block">3</span></span>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-top:0">進捗バー</h3>
          <div class="pbar"><div class="pfill" style="width:60%"></div></div>
          <div class="note">合格 6 / 10 本</div>
        </div>

        <div class="card">
          <h3 style="margin-top:0">メッセージ色</h3>
          <div class="msg ok">ok：保存しました（緑）</div>
          <div class="msg ng">ng：エラーです（赤）</div>
        </div>

        <div class="card">
          <h3 style="margin-top:0">2ポスト連結（threadView）</h3>
          <div id="uikit-thread"></div>
        </div>

        <div class="card">
          <h3 style="margin-top:0">長文の折りたたみ（bodyHtml）</h3>
          <div id="uikit-clamp"></div>
        </div>

        <div class="card">
          <h3 style="margin-top:0">生成中の全画面待機（genWaitCard）</h3>
          <div class="note" style="margin-bottom:6px">※AIが生成・学習中は必ずこれを全画面で出す（前の内容を残さない）。</div>
          <div id="uikit-wait"></div>
        </div>
      </section>
      <div style="margin-top:28px;padding-top:14px;border-top:1px solid var(--border);font-size:12px;text-align:center;opacity:.7">
        <a href="https://join.sns-migiude.com/terms" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">利用規約</a>
        ・ <a href="https://join.sns-migiude.com/privacy" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">プライバシーポリシー</a>
        ／ SNSの右腕 <span id="verLabel"></span>
        ・ <a href="https://join.sns-migiude.com/changelog" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">更新履歴</a>
      </div>
    </div>
  </div>

  <!-- 常設AIチャット（どの画面からでも開ける操作サポート） -->
  <button id="chatFab" class="chatfab" onclick="chatOpen()" title="AIに聞く（操作サポート）"><i class="ti ti-message-chatbot"></i></button>
  <aside id="chatDock" class="chatdock" aria-hidden="true">
    <div class="chat-head">
      <b><i class="ti ti-message-chatbot"></i> AIサポート</b>
      <div class="row" style="gap:4px">
        <button class="soft" onclick="chatClear()" title="会話を消す"><i class="ti ti-eraser"></i></button>
        <button class="soft" onclick="chatClose()" title="閉じる"><i class="ti ti-x"></i></button>
      </div>
    </div>
    <div id="chatLog" class="chat-log"></div>
    <div class="chat-in">
      <textarea id="chatQ" rows="1" placeholder="操作や仕組みを質問…（Enterで送信）" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();chatSend();}"></textarea>
      <button class="primary" onclick="chatSend()" title="送信"><i class="ti ti-send"></i></button>
    </div>
    <div class="chat-foot"><div class="note">💳 回答は<b>あなた自身が連携したClaude API</b>で生成されます（回答ごとにあなたのClaudeへ少額の料金。運営への支払いではありません）。このアプリの仕様にある操作のみ答えます。</div></div>
  </aside>
</div>

<script>
  var ACC = ""; // 会員ID。起動時に /api/whoami から取得して確定（ハードコード廃止）
  var ENV_LABEL = "{{ENV_LABEL}}"; // 本番は""・devは"開発環境"（サーバが注入）
  var IS_DEV = !!ENV_LABEL;        // devだけ true
  var DRAFTS = [];
  var EDIT_ID = null;
  var reviewCharLimit = 140; // 添削の文字数上限（無料140・Premium1000）。loadModeで更新
  var CAN_LONGMIX = false; // 長文混ぜトグルを出せる状態か（Premium かつ 手動承認）。loadModeで更新
  var URL_UNLOCKED = false; // URL誘導ポストを解放しているか。loadModeで更新
  var IS_PREMIUM = false; // X Premium（長文ポスト可）か。長文パターンはPremium限定。loadModeで更新
  var CARD_ON = false; // 画像カード・マスターON。ONで型の検索に画像付きの型が並ぶ。loadModeで更新
  // 生成ボタン共通の注意書き（AI生成は会員のClaude APIに課金される）。各生成ボタンの近くに表示する。
  var FEE_NOTE = "<div class='note' style='margin-top:4px;opacity:.85'>💳 生成すると、あなたのClaude APIに料金が発生します。</div>";
  var IS_AUTO = false; // 自動承認モードか。自動なら承認バッジは出さない
  var GEN_LINKS = []; // 生成画面で使う登録済みリンク（url/label/note）。loadModeで更新
  function isUrlType(sel){ return !!(sel && sel.options && sel.selectedIndex>=0 && sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].id==="optUrl"); }
  // 型を選び直したとき：連結タイプなら長文トグルを隠し「1本目は140字固定」の注記を出す。URL誘導なら飛ばし先URL欄を出す。
  function onPostTypeChange(){
    var sel=$("postType"); var v=(sel&&sel.value)||""; var isThread=!!(v.indexOf("##thread")>=0 || v.indexOf("2つの連続ポスト")>=0 || v.indexOf("🧵")>=0);
    var isUrl=isUrlType(sel);
    var hasLink=!!(GEN_LINKS && GEN_LINKS.length);
    var row=$("longMixRow"); if(row){ row.style.display=(CAN_LONGMIX && !isThread)?"flex":"none"; }
    var note=$("threadLenNote"); if(note){ note.style.display=isThread?"block":"none"; }
    // URL誘導：型・飛ばし先を出す。未登録なら設定へ誘導（飛ばし先「指定なし」は不可）。
    if($("urlStyleRow")) $("urlStyleRow").style.display=(isUrl && hasLink)?"flex":"none";
    if($("urlTargetRow")) $("urlTargetRow").style.display=(isUrl && hasLink)?"flex":"none";
    if($("urlNoLink")) $("urlNoLink").style.display=(isUrl && !hasLink)?"flex":"none";
  }
  function $(id){ return document.getElementById(id); }
  function token(){ return localStorage.getItem("sns_token") || ""; }
  function esc(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function comma(n){ try{ return Number(n).toLocaleString("ja-JP"); }catch(e){ return n; } }
  function msg(t, isOk){ var m=$("msg"); m.textContent=t||""; m.className = "msg " + (isOk===false?"ng":"ok"); }

  function api(method, path, body, raw){
    var headers = { "Authorization":"Bearer " + token() };
    var opt = { method:method, headers:headers };
    if (body !== undefined && body !== null){
      if (raw){ opt.body = body; }
      else { headers["Content-Type"]="application/json"; opt.body = JSON.stringify(body); }
    }
    return fetch(path, opt).then(function(r){
      return r.text().then(function(t){ var j; try{ j=JSON.parse(t); }catch(e){ j={raw:t}; } return { status:r.status, body:j }; });
    });
  }

  function saveToken(){ var t=$("tok").value.trim(); if(!t)return; localStorage.setItem("sns_token",t); showApp(); }
  function logout(){ localStorage.removeItem("sns_token"); location.reload(); }

  function showScreen(which){
    $("login").classList.toggle("hidden", which!=="login");
    $("tutorial").classList.toggle("hidden", which!=="tutorial");
    $("app").classList.toggle("hidden", which!=="app");
  }
  // devのみ「UIサンプル」ナビを出す（本番はENV_LABEL=""なので非表示のまま）
  function revealDevTools(){ if(!IS_DEV) return; var a=$("nav-uikit"), g=$("grp-dev"); if(a) a.style.display="flex"; if(g) g.style.display="block"; }
  function showApp(){
    $("loginErr").textContent="";
    revealDevTools();
    if (!token()){ showScreen("login"); return; }
    function authFail(){ localStorage.removeItem("sns_token"); $("loginErr").textContent="合言葉が違うようです。もう一度お試しください。"; showScreen("login"); }
    // ① 会員IDをサーバから取得（ハードコード廃止）→ ② その会員の状態を見て振り分け
    api("GET","/api/whoami").then(function(w){
      if (w.status===401){ authFail(); return; }
      if (w.body && w.body.account_id){ ACC = w.body.account_id; }
      if (w.body){ applyVersion(w.body); }
      api("GET","/api/account/state?account="+ACC).then(function(r){
        if (r.status===401){ authFail(); return; }
        route(r.body||{});
      });
    });
  }
  // バージョン表記＋「アップデートがあります」バナー（本部の最新版と比較）。
  function applyVersion(w){
    var v=$("verLabel"); if(v) v.textContent="v"+(w.version!=null?w.version:"?");
    var b=$("updBanner"); if(!b) return;
    if(w.update_available){
      var note=w.update_note?("："+w.update_note):"";
      var url=w.update_url||"https://join.sns-migiude.com/update";
      b.innerHTML="<i class='ti ti-rocket'></i> 新しいバージョン <b>v"+w.latest_version+"</b> があります"+esc(note)+" <a href='"+esc(url)+"' target='_blank' rel='noopener' style='color:#4a3206;text-decoration:underline;font-weight:600;margin-left:6px'>更新方法を見る →</a>";
      b.style.display="block";
    } else { b.style.display="none"; }
  }
  function route(s){
    // 起動時に解放・Premium状態をグローバルに反映（型の開発／型の検索でも長文・URLパターンの出し分けに使う）。
    IS_PREMIUM = !!s.x_premium;
    URL_UNLOCKED = !!s.url_posts;
    reviewCharLimit = s.char_limit||140;
    if (s.onboarded){ showScreen("app"); hello(); nav("home"); refreshInviteNav(); }
    else { showScreen("tutorial"); renderTutorial(s); }
  }
  // 招待リンクは運営が開放した会員だけ。開放されていればメニューを出す（キャッシュで即時表示＋本部確認で更新）。
  function refreshInviteNav(){
    var el=$("nav-invite"); if(!el) return;
    // .nav は flex（アイコンと文字の余白 gap）。block で出すと余白が消えるので flex で表示する。
    try{ if(localStorage.getItem("sns_invite_enabled")==="1") el.style.display="flex"; }catch(e){}
    api("GET","/api/invites").then(function(r){
      var b=r.body||{}; var on=!!(b.ok && b.code);
      el.style.display = on ? "flex" : "none";
      try{ localStorage.setItem("sns_invite_enabled", on?"1":"0"); }catch(e){}
    });
  }
  function refreshTutorial(){ api("GET","/api/account/state?account="+ACC).then(function(r){ route(r.body||{}); }); }
  function tmsg(t, isOk){ var m=$("tmsg"); m.textContent=t||""; m.className="msg "+(isOk===false?"ng":"ok"); }
  function tstepHtml(label, cls){ return "<div class='tstep "+cls+"'>"+label+"</div>"; }

  var tLearned = null; // 直近の連携で学習した件数（つながりました画面で表示・リロードでnull）
  var tCharLimit = 140; // 添削の文字数上限（無料140・有料1000）。stateから更新
  function renderSteps(active){
    var labels = ["連携","学習","設定","方向性","生成","承認＆添削"];
    var nums = "①②③④⑤⑥";
    var html = "";
    for (var i=0;i<labels.length;i++){
      var n=i+1; var cls = n<active?"done":(n===active?"on":"");
      if (i>0) html += "<span class='tarrow'>→</span>";
      html += tstepHtml(nums.charAt(i)+" "+labels[i], cls);
    }
    $("tsteps").innerHTML = html;
  }
  function selOpts(vals, sel, suf){
    var o="";
    for (var i=0;i<vals.length;i++){ o += "<option value='"+vals[i]+"'"+(vals[i]===sel?" selected":"")+">"+vals[i]+(suf||"")+"</option>"; }
    return o;
  }

  function renderTutorial(s){
    if (!s.consented || !s.licensed){ tGateView(s); }   // ⓪ 入口：招待コード＋利用規約・プライバシー同意
    else if (!s.connected){ tConnectView(); }
    else if (!s.has_direction){ tSetupView(s); }
    else if ((s.pass_count||0)===0 && (s.drafts||0)===0){ tGenerateView(); }
    else { tTrainView(); }
  }
  // ⓪ 入口ゲート：招待コードでライセンス有効化＋利用のお約束に同意。両方そろうと連携へ進む。
  function tGateView(s){
    if ($("tsteps")) $("tsteps").innerHTML="";
    var h="";
    h+="<h2>はじめに</h2>";
    h+="<p class='lead'>招待コードを入れて、利用のお約束に同意したら始められます。</p>";
    h+="<div class='card'><label style='display:block;font-weight:600'>招待コード</label>";
    h+="<input id='gInvite' placeholder='例: SNS-AB12-CD34' style='width:100%;margin-top:6px;text-transform:uppercase'>";
    h+="<div class='note' style='margin-top:4px'>運営から受け取ったコードを入れてください。</div></div>";
    h+="<div class='card'><div style='font-weight:600;margin-bottom:6px'>利用のお約束（要点）</div>";
    h+="<div class='note' style='line-height:1.95;max-height:240px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:10px'>";
    h+="・<b>あなたのAPIキー（X / Claude）はあなたのもの</b>です。運営は預かりません（あなたのCloudflareに暗号保管）。<br>";
    h+="・<b>集めるもの</b>：あなたが<b>公開した投稿</b>とその反応（成果）。これを分析に使います（元から公開情報）。<br>";
    h+="・集めた情報は<b>匿名化・抽象化</b>され、<b>効く型</b>として全会員に還元されます（あなたの文体・本文そのものは他の会員に配りません）。<br>";
    h+="・<b>集めないもの</b>：APIキー／未公開のネタ・下書き／フォロワーの個人情報。<br>";
    h+="・<b>過去投稿の学習（バックフィル）は任意</b>です（あとから設定でON/OFFできます）。<br>";
    h+="・退会してもあなたのデータは失われません。削除のお求め・投稿の削除にも追従します。<br>";
    h+="<span style='opacity:.8'>詳しくは <a href='https://join.sns-migiude.com/terms' target='_blank' rel='noopener' style='text-decoration:underline'>利用規約</a> と <a href='https://join.sns-migiude.com/privacy' target='_blank' rel='noopener' style='text-decoration:underline'>プライバシーポリシー</a> をご確認ください。</span></div>";
    h+="<label style='display:flex;gap:8px;align-items:flex-start;margin-top:10px;cursor:pointer'><input type='checkbox' id='gConsent' style='margin-top:4px'><span>上記の<b>利用のお約束（利用規約・プライバシー方針）に同意</b>します。</span></label>";
    h+="<div class='row' style='margin-top:10px'><button class='primary' onclick='licenseSubmit()'>同意して始める</button></div></div>";
    $("tbody").innerHTML=h;
  }
  function licenseSubmit(){
    var code=($("gInvite")?$("gInvite").value:"").trim();
    var consent=$("gConsent")?$("gConsent").checked:false;
    if(!code){ tmsg("招待コードを入れてください。",false); return; }
    if(!consent){ tmsg("利用のお約束への同意が必要です。",false); return; }
    tmsg("確認しています…");
    api("POST","/api/account/license",{invite_code:code,consent:true}).then(function(r){
      var b=r.body||{};
      if(b.ok){ tmsg(""); refreshTutorial(); }
      else { tmsg((b&&b.error)||"有効化できませんでした。",false); }
    });
  }

  function tConnectView(pref){
    pref = pref || {};
    renderSteps(1);
    var h = "";
    h += "<h2>SNSの右腕にようこそ。まずは、X・Claudeと連携しましょう</h2>";
    h += "<p class='lead'>ここだけ少し作業です。つないだら、あとは自動で進みます。</p>";
    h += "<div class='card'>";
    h += "<details style='margin-bottom:8px'><summary class='note' style='cursor:pointer'>XのAPIキーの取得方法</summary><div class='note' style='line-height:1.9;margin-top:6px'>";
    h += "<b>1. 開発者登録</b>：<a href='https://developer.x.com' target='_blank' rel='noopener'>developer.x.com</a> に自分のXアカウントでログイン（登録は無料）<br>";
    h += "<b>2. 支払い方法を登録</b>：2026年2月以降、API利用には<b>カード登録（従量課金）が必要</b>（新規の無料枠なし）。投稿1件 約$0.015・読み取り1件 約$0.005ほど<br>";
    h += "<b>3. アプリを作って権限をRead and Writeに</b>：「User authentication settings」で App permissions を <b>Read and Write</b> に（投稿に必須）。Callback URLは <a href='https://example.com' target='_blank' rel='noopener'>https://example.com</a> 等でOK<br>";
    h += "<b>4. 4つの鍵を発行</b>：「Keys and tokens」で API Key（コンシューマーキー）/ API Key Secret（コンシューマーシークレット）/ Access Token / Access Token Secret を発行<br>";
    h += "⚠️ Access Token は権限をRead and Writeに<b>した後</b>に発行（先だと読み取り専用→Regenerateで作り直し）。Secretは1度だけ表示なので、その場でコピー";
    h += "</div></details>";
    h += "<details style='margin-bottom:10px'><summary class='note' style='cursor:pointer'>ClaudeのAPIキーの取得方法</summary><div class='note' style='line-height:1.9;margin-top:6px'>";
    h += "<b>1. Consoleに登録</b>：<a href='https://console.anthropic.com' target='_blank' rel='noopener'>console.anthropic.com</a> に登録/ログイン（Claude.aiの会話画面とは別物）<br>";
    h += "<b>2. 支払い方法を登録</b>：Billing で少額のクレジット/カードを登録（API利用に必要）<br>";
    h += "<b>3. 鍵を作る</b>：「API Keys」→「Create Key」<br>";
    h += "<b>4. コピー</b>：sk-ant-… で始まる鍵をコピー（1度だけ表示）";
    h += "</div></details>";
    h += "<details style='margin-bottom:10px'><summary class='note' style='cursor:pointer'>💰 費用について（利用料は無料です）</summary><div class='note' style='line-height:1.9;margin-top:6px'>";
    h += "<b>SNSの右腕の利用料は無料です（月額0円）。</b><br>";
    h += "かかるのは、あなた自身が登録した X と Claude のAPIの<b>実費だけ</b>。各社へ直接・<b>使った分だけ</b>の支払いで、運営が受け取るお金はありません。動かしていない間は一切かかりません。<br><br>";
    h += "<b>単価の目安</b>（1ドル≒155円換算）<br>";
    h += "・X：投稿 1件 約2円（リンク付きは約30円）／成果の集計 1件 約0.8円<br>";
    h += "・Claude：文章の生成 <b>ポスト1本あたり 約3〜5円</b>（数本まとめて生成）<br><br>";
    h += "<b>1アカウントの月あたりの目安</b>（投稿3本/日・手動承認の場合）<br>";
    h += "・X（投稿＋集計）：月 約500〜1,200円<br>";
    h += "・Claude（文章の生成）：月 約300〜700円（学習は無料・計算だけ）<br>";
    h += "・<b>合計：月 およそ800〜2,000円</b>（投稿や分析の頻度を下げればもっと安く）<br><br>";
    h += "<b>初回だけ</b>：連携時に過去の投稿（最大100件）を読んで文体を学習 → <b>一度だけ 約80円まで</b>。投稿が100件より少ない人は<b>もっと安く</b>（実際に読んだ件数ぶんだけ）。次回以降はかかりません。";
    h += "</div></details>";
    // ── メールアドレス（必須・連絡/お知らせ用） ──
    h += "<div style='border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px'>";
    h += "<div style='font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:6px'><i class='ti ti-mail'></i> メールアドレス（必須）</div>";
    h += "<div class='note' style='margin-bottom:6px'>大事なお知らせ・連絡に使います（本部からのお知らせメールの宛先）。</div>";
    h += "<input id='tem' type='email' placeholder='you@example.com'>";
    h += "<div id='tEerr' class='note' style='color:var(--danger);margin-top:8px'></div>";
    h += "</div>";
    // ── X API エリア ──
    h += "<div style='border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px'>";
    h += "<div style='font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:6px'><i class='ti ti-brand-x'></i> X API（4つの鍵・投稿と分析に使用）</div>";
    h += "<label>API Key（コンシューマーキー）</label><input id='tx1' placeholder='API Key'>";
    h += "<label>API Key Secret（コンシューマーシークレット）</label><input id='tx2' type='password' placeholder='API Key Secret'>";
    h += "<label>Access Token（アクセストークン）</label><input id='tx3' placeholder='Access Token'>";
    h += "<label>Access Token Secret</label><input id='tx4' type='password' placeholder='Access Token Secret'>";
    h += "<div id='tXerr' class='note' style='color:var(--danger);margin-top:8px'></div>";
    h += "</div>";
    // ── Claude API エリア ──
    h += "<div style='border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px'>";
    h += "<div style='font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:6px'><i class='ti ti-sparkles'></i> Claude API（1つの鍵・AIの文章生成に使用）</div>";
    h += "<label>Claude APIキー</label><input id='tck' type='password' placeholder='sk-ant-… （console.anthropic.com で取得）'>";
    h += "<div id='tCerr' class='note' style='color:var(--danger);margin-top:8px'></div>";
    h += "</div>";
    h += "<div class='row' style='margin-top:6px'><button class='primary' onclick='tConnect()'>連携する</button></div>";
    h += "</div>";
    $("tbody").innerHTML = h;
    if (pref.email) $("tem").value = pref.email;
    if (pref.apiKey) $("tx1").value = pref.apiKey;
    if (pref.apiSecret) $("tx2").value = pref.apiSecret;
    if (pref.accessToken) $("tx3").value = pref.accessToken;
    if (pref.accessSecret) $("tx4").value = pref.accessSecret;
    if (pref.claudeKey) $("tck").value = pref.claudeKey;
  }
  function tConnect(){
    var em=$("tem")?$("tem").value.trim():"";
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(em)){ if($("tEerr"))$("tEerr").textContent="✗ メールアドレスを正しい形式で入れてください"; tmsg("メールアドレスを入れてください。",false); return; }
    if($("tEerr"))$("tEerr").textContent="";
    var x = { apiKey:$("tx1").value.trim(), apiSecret:$("tx2").value.trim(), accessToken:$("tx3").value.trim(), accessSecret:$("tx4").value.trim() };
    if (!x.apiKey||!x.apiSecret||!x.accessToken||!x.accessSecret){ tmsg("4つの鍵をすべて入れてください。",false); return; }
    var ck=$("tck").value.trim();
    if (!ck){ tmsg("Claude APIキーを入れてください。",false); return; }
    var pref = { email:em, apiKey:x.apiKey, apiSecret:x.apiSecret, accessToken:x.accessToken, accessSecret:x.accessSecret, claudeKey:ck };
    tmsg("");
    tLearningView();
    api("POST","/api/account/connect",{ account:ACC, x:x, claudeKey:ck, email:em }).then(function(r){
      var d=r.body||{};
      if (d.connected){ tLearned = (d.learned!=null?d.learned:null); tmsg(""); refreshTutorial(); return; }
      // 失敗：フォームに戻し、X / Claude のどちらで失敗したかを各エリアに表示。
      tConnectView(pref);
      var parts=[];
      if (d.x_ok===false){ if($("tXerr")) $("tXerr").textContent="✗ "+(d.x_error||"X APIの接続に失敗しました"); parts.push("X API"); }
      if (d.claude_ok===false){ if($("tCerr")) $("tCerr").textContent="✗ "+(d.claude_error||"Claude APIキーが正しくありません"); parts.push("Claude API"); }
      if (!parts.length){ tmsg((d.error)||"うまくいきませんでした。鍵を確認してください。",false); }
      else { tmsg(parts.join("・")+" でエラーです。各欄の赤いメッセージを確認してください。",false); }
    });
  }

  // ② 学習中（連携リクエスト中に表示する待機画面）
  function tLearningView(){
    renderSteps(2);
    var h = "";
    h += "<h2>学習しています…</h2>";
    h += "<p class='lead'>Xに接続して、あなたの過去の投稿から言葉づかいを学んでいます。</p>";
    h += "<div class='card' style='text-align:center'><div class='spin'></div><div style='font-weight:500;margin-top:6px'>接続の確認と学習中…</div><div class='note' style='margin-top:4px'>ふつうは数秒〜十数秒で終わります。このまま少しお待ちください。</div></div>";
    $("tbody").innerHTML = h;
  }

  // ③ ポスト生成＆学習サイクルの設定
  function tSetupView(s){
    renderSteps(3);
    var freq = s.daily_frequency || 3, days = s.cycle_days || 5, mode = s.approval_mode || "queue";
    var learnedN = (tLearned!=null && tLearned>0) ? tLearned : (s.voice_posts||0);
    var vnote;
    if (learnedN>0){ vnote = "過去の投稿 "+learnedN+"件から、あなたの言葉づかいを学びました。"; }
    else if (s.has_voice){ vnote = "過去の投稿から、あなたの言葉づかいを学びました。"; }
    else { vnote = "過去の投稿が少なく、文体サンプルはまだ少なめです。書きながら学んでいきます。"; }
    var h = "";
    h += "<h2>連携できました 🌱</h2>";
    h += "<p class='lead'>@"+esc(s.handle||"")+" ・ "+vnote+"</p>";
    h += "<div class='card'>";
    h += "<div style='font-weight:500;margin-bottom:12px'>配信と学習のペースを決めましょう（あとで変えられます）</div>";
    h += "<label>1日の投稿本数</label><select id='tfreq'>"+selOpts([1,2,3,4,5],freq,"本")+"</select>";
    h += "<div class='note' style='margin-top:4px'>※ 学習サイクルは後で「学習データ＆サイクル」で調整できます。</div>";
    var unlocked = !!s.auto_unlocked, pc = s.pass_count || 0;
    var tAuto = (mode==="auto" && unlocked);
    h += "<label>承認のしかた</label>";
    h += "<div class='row' style='align-items:center;gap:10px;margin-top:4px'>";
    h += "<span class='note' style='font-size:14px;color:var(--text)'>"+(tAuto?"自動承認モード":"手動承認モード")+"</span>";
    h += "<label class='switch' style='opacity:"+(unlocked?"1":"0.5")+"'><input type='checkbox' id='tmodeToggle'"+(tAuto?" checked":"")+(unlocked?"":" disabled")+"><span class='slider'></span></label>";
    h += "</div>";
    h += "<div class='note' style='margin-top:6px'>🔒 <b>AIのトレーニング（添削＋★5合格）が10本になると自動投稿が使えます</b>（現在 "+pc+"/10本）。まずは手動で、AIを育てましょう。</div>";
    h += "<div class='note' style='margin-top:10px'>"+(s.x_premium?"✓ Xの有料プラン（Premium）を検出。長文ポストも作れます。":"Xの有料プランは連携時に自動判定します（後で「アカウント設定」で変更可）。")+"</div>";
    h += "<div class='row' style='margin-top:14px'><button class='primary' onclick='tSaveSetup()'>この設定で進む</button></div>";
    h += "</div>";
    $("tbody").innerHTML = h;
  }
  function tSaveSetup(){
    var tmAuto = !!($("tmodeToggle") && $("tmodeToggle").checked);
    var body = { account:ACC, daily_frequency:parseInt($("tfreq").value,10), approval_mode:tmAuto?"auto":"queue" };
    tmsg("設定を保存しています…");
    api("POST","/api/account/update",body).then(function(r){
      if (r.body && r.body.ok){ tmsg(""); tDirectionView(); }
      else { tmsg((r.body&&r.body.error)||"設定の保存に失敗しました。",false); }
    });
  }

  // 発信の方向性の選択肢（オンボーディング④と設定で共用）
  var DIR_TOPICS = ["経営・マネジメント","マーケティング・集客","起業・独立","投資・お金","キャリア・転職","自己啓発・マインド","健康・フィットネス","子育て・教育","人間関係・恋愛","クリエイティブ・創作","テクノロジー・AI"];
  var DIR_AUD = ["経営者・役員","個人事業主・フリーランス","これから起業する人","会社員・ビジネスパーソン","副業したい人","学生・若手社会人","主婦・主夫","専門職（士業など）","シニア"];
  var DIR_STANCE = ["本音・ぶっちゃけ","データ・ロジック重視","体験・ストーリー","励まし・背中を押す","問題提起・気づき","実用ノウハウ","ユーモア・親しみやすさ","警鐘・注意喚起"];
  // 選択チップ群（multi=複数選択／false=1つだけ）。末尾に「その他」＝自由入力。
  function chipGroup(name, opts, multi){
    var type = multi ? "checkbox" : "radio";
    var h = "<div class='chips' id='"+name+"'>";
    for (var i=0;i<opts.length;i++){
      h += "<label class='chip'><input type='"+type+"' name='"+name+"' value='"+esc(opts[i])+"' onchange=\\"otherToggle('"+name+"')\\"> "+esc(opts[i])+"</label>";
    }
    h += "<label class='chip'><input type='"+type+"' name='"+name+"' value='__other__' onchange=\\"otherToggle('"+name+"')\\"> その他</label>";
    h += "</div>";
    h += "<input id='"+name+"_other' class='hidden' placeholder='その他（自由入力・複数は「、」で区切る）' style='margin-top:2px'>";
    return h;
  }
  function otherToggle(name){
    var grp=$(name); if(!grp) return;
    var other=grp.querySelector("input[value='__other__']");
    var inp=$(name+"_other"); if(!inp) return;
    var show = !!(other && other.checked);
    inp.classList.toggle("hidden", !show);
    if (show) inp.focus();
  }
  function chipValues(name){
    var grp=$(name), vals=[]; if(!grp) return vals;
    var ins=grp.querySelectorAll("input:checked");
    for (var i=0;i<ins.length;i++){
      if (ins[i].value==="__other__"){
        var o=$(name+"_other").value.trim();
        if(o){ var ps=o.split(/[、,]/); for(var k=0;k<ps.length;k++){ var t=ps[k].trim(); if(t) vals.push(t); } }
      } else { vals.push(ins[i].value); }
    }
    return vals;
  }

  // ④ 発信の方向性（何を・誰に・どんなスタンスで）＝選択式・複数可・その他入力
  // チップ群を既存の選択値でプリセット（編集用）。未知の値は「その他」に入れる。
  function presetChips(name, values){
    var grp=$(name); if(!grp||!values||!values.length) return;
    var ins=grp.querySelectorAll("input"), known={}, others=[];
    for (var i=0;i<ins.length;i++){ if(ins[i].value!=="__other__") known[ins[i].value]=ins[i]; }
    for (var k=0;k<values.length;k++){ var v=values[k]; if(known[v]) known[v].checked=true; else others.push(v); }
    if (others.length){ var o=grp.querySelector("input[value='__other__']"); if(o) o.checked=true; var inp=$(name+"_other"); if(inp){ inp.value=others.join("、"); } otherToggle(name); }
  }
  function tDirectionView(){
    renderSteps(4);
    var h = "";
    h += "<h2>発信の方向性を決めましょう</h2>";
    h += "<p class='lead'>当てはまるものを選ぶだけでOK。ここを決めると、AIの下書きがブレなくなります。（あとで変えられます）</p>";
    h += "<div class='card'>";
    h += "<label>メインテーマ（1つ）</label>"+chipGroup("dmain", DIR_TOPICS, false);
    h += "<label style='margin-top:14px'>サブテーマ（いくつでも）</label>"+chipGroup("dsub", DIR_TOPICS, true);
    h += "<label style='margin-top:14px'>届けたい相手（いくつでも）</label>"+chipGroup("daud", DIR_AUD, true);
    h += "<label style='margin-top:14px'>発信のスタンス・トーン（いくつでも）</label>"+chipGroup("dstance", DIR_STANCE, true);
    h += "<div class='note' style='margin-top:10px'>文体（書き方）はあなたの過去投稿から学んだものを使います。ここで決めるのは「内容の方向性」です。</div>";
    h += "<div class='row' style='margin-top:14px'><button class='primary' onclick='tSaveDirection()'>この方向で進む</button></div>";
    h += "</div>";
    $("tbody").innerHTML = h;
  }
  function tSaveDirection(){
    var main = chipValues("dmain")[0]||"";
    if (!main){ tmsg("メインテーマを選んでください。",false); return; }
    var body = { account:ACC, main:main, subthemes:chipValues("dsub"), audience:chipValues("daud"), stance:chipValues("dstance") };
    tmsg("方向性を保存しています…");
    api("POST","/api/account/direction",body).then(function(r){
      if (r.body && r.body.ok){ tmsg(""); tGenerateView(); }
      else { tmsg((r.body&&r.body.error)||"保存に失敗しました。",false); }
    });
  }

  // ⑤ サンプルポスト生成
  function tGenerateView(){
    renderSteps(5);
    api("GET","/api/account/state?account="+ACC).then(function(r){
      var s=r.body||{};
      var h = "";
      h += "<h2>AIのトレーニングを始めましょう</h2>";
      h += "<p class='lead'>まずAIに下書きを<b>5本</b>書かせます。それを<b>添削</b>したり<b>★5（合格）</b>を付けたりして、AIをあなた専用に育てていきます。</p>";
      // AIが今、書くために学習・参照しているもの（透明化）
      h += "<div class='card'><div style='font-weight:500;margin-bottom:8px'>📚 AIが今、書くために学習しているもの</div><div class='note' style='line-height:2'>";
      var vtxt = s.has_voice ? ((s.voice_posts>0)?("過去の投稿 <b>"+s.voice_posts+"件</b> から学習済み"):"過去の投稿から学習済み") : "過去の投稿が少なめ（書きながら学習）";
      h += "・<b>あなたの文体</b>："+vtxt+"<br>";
      h += "・<b>発信の方向性</b>："+(s.niche?("メインテーマ「"+esc(s.niche)+"」ほか、④で選んだ内容"):"④で設定した内容")+"<br>";
      h += "・<b>添削・★評価の傾向</b>：このあとのトレーニングが進むほど強く反映";
      h += "</div></div>";
      h += "<div class='card'><div style='margin-bottom:10px'>下のボタンで<b>あなたの文体・方向性の下書き</b>を5本つくります（<b>1本140文字以内</b>）。</div>";
      h += "<button class='primary' onclick='tGenerate()'>トレーニングを始める（5本つくる）</button>";
      h += "<div class='note' style='margin-top:8px'>AIが下書きを書きます（30〜60秒ほど）。まだ投稿はされません。</div></div>";
      h += "<div class='row'><button class='soft' onclick='tFinish()'>スキップしてはじめる</button></div>";
      $("tbody").innerHTML = h;
    });
  }
  // 生成中の全面待機画面（スピナー）。【ルール】AI生成中は必ずこれを全画面で出す。
  var GEN_TIMER=null, GEN_T0=0;
  function genStartTimer(){
    GEN_T0=Date.now();
    if(GEN_TIMER) clearInterval(GEN_TIMER);
    GEN_TIMER=setInterval(function(){
      var el=$("genElapsed"); if(!el){ clearInterval(GEN_TIMER); GEN_TIMER=null; return; }
      el.textContent="　経過 "+Math.round((Date.now()-GEN_T0)/1000)+"秒";
    },1000);
  }
  function genWaitCard(label){
    setTimeout(genStartTimer,30);
    return "<div class='card' style='text-align:center;padding:26px 16px'><div class='spin'></div><div style='font-weight:600;margin-top:10px'>"+esc(label||"生成中…")+"</div><div class='note' style='margin-top:6px'>AIが一本ずつ、あなたの文体・方向性でじっくり書いています。<br><b>30秒〜2分</b>ほどかかることがあります。</div><div class='note' style='margin-top:6px;font-variant-numeric:tabular-nums'><span id='genElapsed'>　経過 0秒</span></div><div class='note' style='margin-top:6px'>このまま少しお待ちください（投稿はされません）。</div></div>";
  }
  function tGenWaitView(){
    $("tbody").innerHTML = "<h2>下書きをつくっています…</h2>"+genWaitCard();
  }
  function tGenerate(){
    renderSteps(5);
    tmsg("");
    tGenWaitView();
    api("POST","/api/account/sample",{ account:ACC, count:5 }).then(function(){
      api("GET","/api/account/state?account="+ACC).then(function(r){
        var s=r.body||{};
        if (s.onboarded){ route(s); return; }
        if (s.drafts>0){ tmsg(""); tTrainView(); }
        else { tGenerateView(); tmsg("うまく作れませんでした。もう一度お試しください。",false); }
      });
    });
  }

  // ⑥ トレーニング：作る→添削(完成)/★評価→足りなければ自動補充→添削10本で完了
  var TRAIN_GOAL = 10;
  var trainSrc = {}; // トレーニング中の各下書きの {body, reply_text}（編集時に参照）
  function tTrainView(){
    renderSteps(6);
    api("GET","/api/account/state?account="+ACC).then(function(rs){
      var s=rs.body||{};
      if (s.onboarded){ route(s); return; }
      tCharLimit = s.char_limit||140;
      var done = s.pass_count||0; // 添削＋★5合格
      if (done >= TRAIN_GOAL){ tTrainDone(); return; }
      api("GET","/api/pending?account="+ACC).then(function(rp){
        var list=(rp.body&&rp.body.pending)||[];
        if (list.length===0){
          tmsg("");
          tGenWaitView();
          api("POST","/api/account/sample",{account:ACC,count:5}).then(function(rr){
            var made=(rr.body&&rr.body.made)||0;
            if (made>0){ tmsg(""); tTrainView(); }
            else {
              var h="<h2>トレーニング</h2><p class='lead'>うまく作れませんでした。もう一度お試しください。</p>";
              h+="<div class='row'><button class='primary' onclick='tTrainView()'>下書きをつくる</button><button class='soft' onclick='tFinish()'>今はここまでにする</button></div>"+FEE_NOTE;
              $("tbody").innerHTML=h; tmsg("",false);
            }
          });
          return;
        }
        tRenderTrain(done, list);
      });
    });
  }
  function tRenderTrain(done, list){
    var h = "";
    h += "<h2>AIのトレーニング</h2>";
    h += "<p class='lead'>ここは<b>あなたのAIを育てる</b>場所です。出てきた下書き<b>一つひとつ</b>に、<b>「添削」か「評価」</b>を必ず入れてください（見送りはありません）。<br>・<b>添削</b>＝あなたの言葉に直す（合格。AIが文体を学びます）<br>・<b>★5</b>＝そのままで合格／<b>★1〜4</b>＝イマイチという評価（どちらもAIが学びます）<br>合格（添削＋★5）が <b>"+done+" / "+TRAIN_GOAL+" 本</b>になると、いったんのトレーニング完了＝自動投稿が解放されます。</p>";
    var pct=Math.min(100, Math.round(done/TRAIN_GOAL*100));
    var remain=Math.max(0, TRAIN_GOAL-done);
    h += "<div style='font-weight:600;font-size:15px;margin-bottom:4px'>合格 "+done+" / "+TRAIN_GOAL+" 本　<span class='note' style='font-weight:400'>（あと "+remain+"本）</span></div>";
    h += "<div class='pbar'><div class='pfill' style='width:"+pct+"%'></div></div>";
    trainSrc={};
    for (var i=0;i<list.length;i++){
      var p=list[i];
      trainSrc[p.id]={ body:p.body||"", reply_text:p.reply_text||"" };
      h += "<div class='card draft' id='d"+p.id+"'>";
      h += hookLabelHtml(p.hook);
      h += threadView(p);
      h += "<div class='note' style='font-size:11px;margin-top:2px'>"+jLen(p.body||"")+" 字 / "+tCharLimit+(p.reply_text?"（1本目）":"")+"</div>";
      h += "<div class='note' style='margin:8px 0 4px'>👉 <b>このポストに「添削」か「評価」のどちらかを入れてください</b></div>";
      h += "<div class='row' style='align-items:center;gap:10px;flex-wrap:wrap'>";
      h += "<button class='primary' onclick='tStartEdit("+p.id+")'>添削して合格</button>";
      h += "<span class='note'>または評価 →</span><span class='stars' id='st"+p.id+"'>"+starSpans(p.id)+"</span>";
      h += "<span class='note'>（★5＝合格／★1〜4＝イマイチ）</span>";
      h += "</div>";
      h += "</div>";
    }
    h += "<div class='note' style='margin-top:14px;text-align:center'>この5本すべてに「添削」か「評価」を入れると、次の5本が自動で出ます。<b>合格"+TRAIN_GOAL+"本</b>まで続けましょう。</div>";
    $("tbody").innerHTML = h;
  }
  function starSpans(id){
    var s="";
    for (var n=1;n<=5;n++){ s += "<span class='star' onmouseover='tStarHover("+id+","+n+")' onmouseout='tStarHover("+id+",0)' onclick='tRate("+id+","+n+")'>★</span>"; }
    return s;
  }
  function tStarHover(id,n){
    var wrap=$("st"+id); if(!wrap) return;
    var stars=wrap.querySelectorAll(".star");
    for (var i=0;i<stars.length;i++){ stars[i].classList.toggle("on", (i+1)<=n); }
  }
  function tRate(id,n){
    api("POST","/api/posts/"+id+"/rate",{rating:n}).then(function(r){
      if (r.body&&r.body.ok){ tmsg(n===5?"★5 合格！（投稿を予約・トレーニング+1）":("★"+n+" で評価（AIへのフィードバック）。")); tTrainView(); }
      else { tmsg((r.body&&r.body.error)||"評価に失敗しました。",false); }
    });
  }
  function tStartEdit(id){
    var card=$("d"+id); if(!card) return;
    var src=trainSrc[id]||{body:"",reply_text:""};
    var isThread = !!(src.reply_text);
    var h = "";
    if (isThread){ h += "<div class='tw-h' style='margin-bottom:4px'>① 1本目（ここだけがタイムラインに出る）</div>"; }
    h += "<textarea id='ed"+id+"' maxlength='"+tCharLimit+"' oninput='tEdCount("+id+")' style='min-height:120px'></textarea>";
    h += "<div class='note' style='margin-top:2px'><span id='edc"+id+"'>0</span> / "+tCharLimit+" 文字</div>";
    if (isThread){ h += replyBlock("tred"+id, src.reply_text, tCharLimit); }
    h += "<div class='note' style='margin-top:4px'>あなたの言葉に直してください。直した文章がそのままAIの学習になります（合格＝投稿予約）。</div>";
    h += "<div class='row' style='margin-top:8px'><button class='primary' onclick='tSaveEdit("+id+")'>これで合格（投稿予約）</button><button class='soft' onclick='tTrainView()'>やめる</button></div>";
    card.innerHTML = h;
    $("ed"+id).value = src.body;
    tEdCount(id);
    $("ed"+id).focus();
  }
  function tEdCount(id){
    var t=$("ed"+id), c=$("edc"+id); if(!t||!c) return;
    var n=jLen(t.value); c.textContent=n;
    c.parentNode.style.color = (n>=tCharLimit) ? "#c0392b" : "var(--muted)";
  }
  function tSaveEdit(id){
    var body=$("ed"+id).value.trim();
    if (!body){ tmsg("本文が空です。",false); return; }
    if (body.length>tCharLimit){ tmsg(tCharLimit+"文字以内にしてください。",false); return; }
    var rv=replyVal("tred"+id);
    if (rv!==undefined && rv.length>tCharLimit){ tmsg("2本目も"+tCharLimit+"文字以内にしてください。",false); return; }
    tmsg("保存しています…");
    var payload={body:body}; if (rv!==undefined){ payload.reply_text=rv; }
    api("POST","/api/posts/"+id+"/edit-approve",payload).then(function(r){
      if (r.body&&r.body.ok){ tmsg("合格にしました（投稿を予約・トレーニング+1）。"); tTrainView(); }
      else if (r.body&&r.body.unchanged){ tmsg(r.body.error||"少し添削してみましょう。",false); }
      else { tmsg((r.body&&r.body.error)||"保存に失敗しました。",false); }
    });
  }
  function tTrainDone(){
    renderSteps(6);
    var h="";
    h += "<h2>🎉 いったんのトレーニング完了！</h2>";
    h += "<p class='lead'>添削＋★5合格で10本、おつかれさまでした。AIはあなたの文体をしっかり学びました。<b>自動投稿も使えるようになりました</b>（設定でいつでも切替）。トレーニングはこの先も続けるほど精度が上がります。</p>";
    h += "<div class='card'>これで準備OK。ダッシュボードであなたの発信が始まります。</div>";
    h += "<div class='row' style='margin-top:16px'><button class='primary' onclick='tFinish()'>はじめる（ダッシュボードへ）</button></div>";
    $("tbody").innerHTML=h;
  }
  function tFinish(){ api("POST","/api/account/finish-onboarding",{account:ACC}).then(function(){ showScreen("app"); hello(); nav("home"); }); }

  function setBadge(name,n){
    var b=$("badge-"+name); if(!b) return;
    if (n>0){ b.textContent=n; b.style.display="inline-flex"; } else { b.style.display="none"; }
  }
  function refreshBadges(){
    api("GET","/api/account/state?account="+ACC).then(function(r){
      var s=r.body||{}; IS_AUTO = s.approval_mode==="auto";
      setBadge("review", IS_AUTO ? 0 : (s.drafts||0)); // 自動承認なら未承認が残ってもバッジは出さない
    });
  }
  function nav(s){
    var navs = document.querySelectorAll(".nav");
    for (var i=0;i<navs.length;i++){ navs[i].classList.toggle("on", navs[i].getAttribute("data-s")===s); }
    var screens = document.querySelectorAll(".screen");
    for (var k=0;k<screens.length;k++){ screens[k].classList.add("hidden"); }
    $("s-"+s).classList.remove("hidden");
    msg("");
    refreshBadges();
    if (s==="home"){ loadHome(); }
    if (s==="review"){ loadMode(); loadDrafts(); }
    if (s==="scheduled"){ loadScheduled(); }
    if (s==="learn"){ loadVoiceState(); }
    if (s==="settings"){ loadSettings(); }
    if (s==="usage"){ USAGE_MONTH=""; loadUsage(); }
    if (s==="analysis"){ loadAnalysis(); }
    if (s==="cv"){ loadCV(); }
    if (s==="newtype"){ loadNewType(); }
    if (s==="typesearch"){ loadMode(); loadTypeSearch(); } // loadMode＝ラベル絞り込みの長文/画像オプションの表示制御も行う
    if (s==="typemanage"){ loadTypeManage(); }
    if (s==="cards"){ loadCards(); }
    if (s==="invite"){ loadInvites(); }
    if (s==="uikit"){ loadUikit(); }
  }
  // ── クリック→CV：誘導先URL別の クリック(X)・CV(計測ピクセル)・CVR・売上 ──
  function cvSnippet(){
    // 誘導先の完了ページに貼るタグ。sr（投稿リンクに付く印）をURL/localStorageから拾って /cv に通知。
    return "<script>(function(){try{var p=new URLSearchParams(location.search),s=p.get('sr')||localStorage.getItem('sns_sr');if(p.get('sr'))localStorage.setItem('sns_sr',p.get('sr'));if(s)new Image().src='"+location.origin+"/cv?a="+encodeURIComponent(ACC)+"&sr='+encodeURIComponent(s);}catch(e){}})();<\\/script>";
  }
  function cvStat(label,val){
    return "<div style='min-width:64px'><div class='note' style='font-size:11px'>"+esc(label)+"</div><div style='font-size:17px;font-weight:600'>"+esc(String(val))+"</div></div>";
  }
  // CV計測タグの設置チェック：サンクスページURLを送り、サーバがHTML内のタグ署名を判定。
  function checkTag(){
    var u=($("tagCheckUrl")?$("tagCheckUrl").value:"").trim();
    var btn=$("tagCheckBtn"), out=$("tagCheckResult");
    if(u.indexOf("http")!==0){ if(out) out.innerHTML="<span style='color:#c0392b'>URL（httpから始まる）を入れてください。</span>"; return; }
    if(btn){ btn.disabled=true; btn.textContent="確認中…"; }
    if(out){ out.textContent="ページを読んで確認しています…"; }
    api("POST","/api/account/check-tag",{account:ACC,url:u}).then(function(r){
      if(btn){ btn.disabled=false; btn.textContent="チェック"; }
      var b=r.body||{};
      if(!b.ok){ if(out) out.innerHTML="<span style='color:#c0392b'>"+esc(b.error||"確認できませんでした。")+"</span>"; return; }
      if(b.found){ if(out) out.innerHTML="<span style='color:var(--ok)'>✓ "+esc(b.hint||"タグを確認できました。")+"</span>"; }
      else if(b.reachable){ if(out) out.innerHTML="<span style='color:#c0392b'>✗ "+esc(b.hint||"タグが見つかりませんでした。")+"</span>"; }
      else { if(out) out.innerHTML="<span>⚠️ "+esc(b.hint||"ページを取得できませんでした。")+"</span>"; }
    });
  }
  function loadCV(){
    var el=$("cvBody"); if(el) el.innerHTML="<div class='spin'></div>";
    api("GET","/api/account/cv?account="+ACC).then(function(r){
      var items=(r.body&&r.body.items)||[];
      // 誘導先URLの登録UIを同じデータで満たす（管理＝登録/編集/削除はこの画面で完結）。
      LINKS = items.map(function(t){ return {label:t.label, title:t.title, desc:t.desc, url:t.url, unit:t.unit||0}; });
      renderLinks();
      if ($("urlSwitch")) $("urlSwitch").checked = !!(r.body && r.body.url_posts);
      var h="";
      // 主役＝誘導先URL別の成果（計測リンクもここから）。CV計測タグは全LP共通で1回貼れば不要なので末尾に畳む。
      if(!items.length){
        h+="<div class='card'><b>誘導先URL別の成果</b><div class='note' style='margin-top:6px'>誘導先URLがまだありません。上の<b>「誘導先URLの登録」</b>で登録すると、URLごとに<b>計測リンク</b>と<b>成果</b>がここに並びます。</div></div>";
      } else {
        h+="<div class='note' style='margin:4px 0 6px;font-weight:600'>誘導先URL別の成果（計測リンクもここから）</div>";
        items.forEach(function(t){
          var link=location.origin+"/r?a="+encodeURIComponent(ACC)+"&c="+encodeURIComponent(t.code||"");
          h+="<div class='card' style='margin-bottom:10px'>";
          h+="<div style='font-weight:600;font-size:15px'>"+esc(t.label||t.title||"")+(t.unit?"<span class='note' style='margin-left:8px;font-weight:400'>単価 ¥"+Number(t.unit).toLocaleString()+"</span>":"<span class='note' style='margin-left:8px;font-weight:400'>単価 未設定</span>")+"</div>";
          if(t.title && t.title!==t.label) h+="<div class='note'>"+esc(t.title)+"</div>";
          h+="<div class='note' style='word-break:break-all;margin-top:2px'>🔗 "+esc(t.url||"")+"</div>";
          // 計測リンク（このURL専用・Xに貼る）
          h+="<div style='margin-top:8px'><div class='note' style='font-size:12px;margin-bottom:2px'>このURLの<b>計測リンク</b>（Xのポストに貼る／手動でもOK）</div>";
          h+="<input readonly onclick='this.select()' value='"+esc(link)+"' style='width:100%;font-family:monospace;font-size:12px'></div>";
          // 成果サマリ
          h+="<div class='row' style='gap:14px;flex-wrap:wrap;margin-top:10px'>";
          h+=cvStat("クリック",(t.clicks||0).toLocaleString());
          h+=cvStat("CV",(t.conversions||0).toLocaleString());
          h+=cvStat("CVR",(t.cvr_pct!=null?(t.cvr_pct+"%"):"–"));
          h+=cvStat("売上",(t.value?("¥"+Number(t.value).toLocaleString()):"–"));
          h+=cvStat("投稿",(t.posts||0).toLocaleString());
          h+="</div>";
          // 投稿ごとの解析（折りたたみ）
          var pp=t.per_post||[];
          if(pp.length){
            h+="<details style='margin-top:10px'><summary style='cursor:pointer;font-size:13px;color:var(--text)'>📊 ポストごとの解析（"+pp.length+"件）</summary>";
            h+="<div style='overflow-x:auto'><table class='ranktbl' style='width:100%;margin-top:8px'><tr><th style='text-align:left'>ポスト</th><th>クリック</th><th>CV</th><th>CVR</th><th>売上</th></tr>";
            pp.forEach(function(p){
              var body=(p.body||"").replace(/\\s+/g," ").slice(0,60);
              var badge=p.is_common?"<span class='note' style='font-size:10px'>（自動/共通リンク）</span>":"";
              h+="<tr><td style='text-align:left'><div style='font-size:12px;max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>"+esc(body)+"</div>"+badge+"</td>";
              h+="<td>"+(p.clicks||0).toLocaleString()+"</td><td>"+(p.conversions||0).toLocaleString()+"</td><td>"+(p.cvr_pct!=null?(p.cvr_pct+"%"):"–")+"</td><td>"+(p.value?("¥"+Number(p.value).toLocaleString()):"–")+"</td></tr>";
            });
            h+="</table></div></details>";
          } else {
            h+="<div class='note' style='margin-top:8px'>このURLの計測リンクを貼ったポストがまだありません。</div>";
          }
          h+="</div>";
        });
        h+="<div class='note' style='margin-top:2px'>クリック＝計測リンクのクリック数／CV＝計測タグの記録／CVR＝CV÷クリック／売上＝単価×CV。連携した今から少しずつ溜まります（過去には遡れません）。</div>";
      }
      // CV計測タグ（全LP共通・1回貼れば基本不要）→ 普段は畳んでおく
      h+="<details class='card' style='margin-top:14px'><summary style='cursor:pointer;font-weight:600'>⚙️ CV計測タグの設置（最初に1回だけ・全LP共通）</summary>";
      h+="<div class='note' style='margin:8px 0'>このタグは<b>全てのLPで共通の1種類</b>です（違うLPへの誘導でも同じものを使います）。どのLP経由かは計測リンクが自動で見分けるので、LPごとに作り分ける必要はありません。登録・購入が<b>完了する画面（サンクスページ）の&lt;head&gt;内</b>に貼れば、そこに着いた人がCVとして記録されます。<b>一度貼れば基本は触りません。</b></div>";
      h+="<textarea readonly onclick='this.select()' style='width:100%;min-height:60px;font-family:monospace;font-size:12px'>"+esc(cvSnippet())+"</textarea>";
      // 設置チェック（サンクスページURLを入れてタグ有無を自動判定）
      h+="<div style='margin-top:10px;border-top:1px solid var(--border);padding-top:10px'><div class='note' style='margin-bottom:4px'><b>✅ ちゃんと貼れたかチェック</b>（サンクスページのURLを入れて確認）</div>";
      h+="<div class='row' style='gap:6px;flex-wrap:nowrap'><input id='tagCheckUrl' type='url' placeholder='https://…/thanks（完了ページのURL）' style='flex:1'><button class='soft' id='tagCheckBtn' onclick='checkTag()'>チェック</button></div>";
      h+="<div class='note' id='tagCheckResult' style='margin-top:6px'></div></div>";
      h+="<div class='note' style='margin-top:8px'><b>📍 どこに貼る？</b><br>計測リンク →（note等を経由しても可）→ <b>申込フォームのあるLP</b> → <b>サンクスページ</b>、の最後の<b>サンクスページ</b>に貼ります。LPごとにサンクスページが分かれているなら、<b>各サンクスページに同じタグ</b>を貼ってください（中身は全部同じ）。売上は各URLの<b>単価</b>から自動計算（タグ側の金額指定は不要）。</div>";
      h+="<div class='note' style='margin-top:8px;border-top:1px solid var(--border);padding-top:8px'><b>⚠️ 途中でドメインが変わるとCVは結びつきません</b><br>計測リンク→note→<b>別ドメインのLP</b>→サンクスページ…のように<b>ドメインをまたぐ</b>と「誰のクリックか」の印が引き継げずCVが0になります（<b>クリック数は常に取れます</b>）。確実に取るには<b>LPとサンクスページを同じドメイン</b>に。どうしてもまたぐ場合は入口と完了ページの両方に貼ると拾える確率が上がります。</div>";
      h+="</details>";
      if(el) el.innerHTML=h;
    });
  }
  // ── 型の開発（指示/サンプル→AIがプロンプト→命名→トレーニング→採用・既存型の編集/再トレーニング）──
  var NT_STEP="input", NT_MODE="describe", NT_NAME="", NT_PROMPT="", NT_ORIGIN="", NT_DRAFTS=[], NT_KEPT=[], NT_LIST=[];
  var NT_MAX=0; // 到達済みの最遠ステップ（ここまでは前後どちらにも再生成せず移動できる）
  var NT_SEEN=[]; // これまで生成した本文（採用/不採用問わず）＝次バッチでネタ被りさせない対象
  var NT_PROMPT_BEFORE=""; // 仕上げ：改善前のプロンプト（改善後と見比べる用）
  var NT_DIFF=""; // 仕上げ：AIが説明した「改善前との違い（一言）」
  var NT_EDIT_ID=null; // 既存の型を編集中ならそのid（採用＝新規でなく更新になる）
  var NT_PATTERN="single_short"; // 型の長さ・形式パターン
  var NT_IMAGE_TYPE="none"; // 画像の型。none=画像なし／oneliner=一文／list=箇条書き
  var NT_IMAGE_TYPES=[['none','なし（画像を付けない）'],['oneliner','一文（見出し・名言）'],['list','箇条書き（比較・ランキング）']];
  // 型の開発・最初に選ぶ構造（8択＝4形式×画像有無）。[pattern, hasImage, label]
  var NT_STRUCTS=[['single_short',false,'短文・単発'],['single_long',false,'長文・単発'],['thread_short',false,'短文＋短文の連結'],['thread_long',false,'短文＋長文の連結'],['single_short',true,'短文・単発＋画像'],['single_long',true,'長文・単発＋画像'],['thread_short',true,'短文＋短文の連結＋画像'],['thread_long',true,'短文＋長文の連結＋画像']];
  var NT_GOAL=10; // 採用（添削完了 or ★5）が10件たまるまでトレーニングは終わらない
  function ntKey(){ return "nt_draft_"+ACC; }
  function ntPersist(){
    try{
      var t=$("ntText"); if(t) NT_ORIGIN=t.value;
      var nm=$("ntName"); if(nm) NT_NAME=nm.value;
      var pr=$("ntPrompt"); if(pr) NT_PROMPT=pr.value;
      var ps=$("ntPattern"); if(ps) NT_PATTERN=ps.value;
      var im=$("ntImage"); if(im) NT_IMAGE_TYPE=im.value;
      if(NT_STEP==="input" && !(NT_ORIGIN||"").trim() && !NT_PROMPT){ localStorage.removeItem(ntKey()); return; }
      localStorage.setItem(ntKey(), JSON.stringify({step:NT_STEP,max:NT_MAX,mode:NT_MODE,name:NT_NAME,prompt:NT_PROMPT,pattern:NT_PATTERN,imageType:NT_IMAGE_TYPE,pbefore:NT_PROMPT_BEFORE,diff:NT_DIFF,editId:NT_EDIT_ID,origin:NT_ORIGIN,drafts:NT_DRAFTS,kept:NT_KEPT,seen:NT_SEEN.slice(-60)}));
    }catch(e){}
  }
  function ntClearState(){ try{ localStorage.removeItem(ntKey()); }catch(e){} }
  function ntCardPreview(){ // 選んだ画像の型＋保存済みテーマで、本文サンプルから見出し/箇条書きカードを試し描画
    var box=$("ntCardPrev"); if(!box) return;
    if($("ntImage")) NT_IMAGE_TYPE=$("ntImage").value;
    if(NT_IMAGE_TYPE==="none"){ box.innerHTML="<div class='note'>この型は画像なしです（「一文」か「箇条書き」を選ぶとカードが付きます）。</div>"; return; }
    var sample=(NT_DRAFTS&&NT_DRAFTS[0]&&NT_DRAFTS[0].body)||(NT_PROMPT||"完璧主義って、ただの「完成させない言い訳」だったりする。本当に必要なのは、出してから直す勇気の方。");
    box.innerHTML="<div class='note'>カード生成中…（本文から"+(NT_IMAGE_TYPE==="list"?"箇条書き":"見出し")+"を作成）</div>";
    api("POST","/api/account/card-preview",{account:ACC,imageType:NT_IMAGE_TYPE,text:sample}).then(function(r){
      var b=r.body||{};
      if(b.ok&&b.png){ box.innerHTML="<img src='"+b.png+"' style='max-width:100%;border-radius:10px;border:1px solid var(--border)'><div class='note' style='margin-top:2px'>色・フォントは「画像カードの型」の設定が使われます。実際にカードを付けるには「画像カードの型」をONにしてください。</div>"; }
      else { box.innerHTML="<div class='note' style='color:#c0392b'>"+esc(b.error||"カードを作れませんでした。")+"</div>"; }
    });
  }
  function ntRestore(){ try{ var s=localStorage.getItem(ntKey()); return s?JSON.parse(s):null; }catch(e){ return null; } }
  function ntCancel(){
    if(!confirm("作成中の内容を破棄しますか？\\n（保存した内容は消えます）")) return;
    ntClearState(); NT_STEP="input"; NT_MAX=0; NT_NAME=""; NT_PROMPT=""; NT_PROMPT_BEFORE=""; NT_DIFF=""; NT_EDIT_ID=null; NT_DRAFTS=[]; NT_KEPT=[]; NT_SEEN=[]; NT_ORIGIN=""; ntRender(); msg("作成を中止しました。");
  }
  function loadNewType(){
    var saved=ntRestore();
    if(saved){ NT_STEP=saved.step||"input"; NT_MODE=saved.mode||"describe"; NT_NAME=saved.name||""; NT_PROMPT=saved.prompt||""; NT_PATTERN=saved.pattern||"single_short"; NT_IMAGE_TYPE=saved.imageType||"none"; NT_PROMPT_BEFORE=saved.pbefore||""; NT_DIFF=saved.diff||""; NT_EDIT_ID=(saved.editId!=null?saved.editId:null); NT_ORIGIN=saved.origin||""; NT_DRAFTS=saved.drafts||[]; NT_KEPT=saved.kept||[]; NT_SEEN=saved.seen||[]; NT_MAX=(saved.max!=null?saved.max:NT_ORDER[NT_STEP])||0; }
    else { NT_STEP="input"; NT_MAX=0; NT_NAME=""; NT_PROMPT=""; NT_PATTERN="single_short"; NT_IMAGE_TYPE="none"; NT_PROMPT_BEFORE=""; NT_DIFF=""; NT_EDIT_ID=null; NT_DRAFTS=[]; NT_KEPT=[]; NT_SEEN=[]; NT_ORIGIN=""; }
    Promise.all([
      api("GET","/api/types/list?account="+ACC),
      api("GET","/api/account/state?account="+ACC)
    ]).then(function(rs){
      NT_LIST=(rs[0].body&&rs[0].body.types)||[];
      var s=(rs[1]&&rs[1].body)||{}; // 解放・Premium状態を最新化（長文・URLパターンの出し分け）
      IS_PREMIUM=!!s.x_premium; URL_UNLOCKED=!!s.url_posts;
      ntRender();
    });
  }
  function ntSyncText(){ var t=$("ntText"); if(t) NT_ORIGIN=t.value; } // 再描画前に入力欄を退避
  function ntPickStruct(pattern, hasImage){ ntSyncText(); NT_PATTERN=pattern; if(hasImage){ if(NT_IMAGE_TYPE!=='oneliner'&&NT_IMAGE_TYPE!=='list') NT_IMAGE_TYPE='oneliner'; } else { NT_IMAGE_TYPE='none'; } ntPersist(); ntRender(); }
  function ntSetImg(it){ ntSyncText(); NT_IMAGE_TYPE=it; ntPersist(); ntRender(); }
  function ntStructLabel(){ var P={single_short:'短文・単発',single_long:'長文・単発',thread_short:'短文＋短文の連結',thread_long:'短文＋長文の連結',url:'🔗 URLに繋げる'}; var s=P[NT_PATTERN]||'短文・単発'; if(NT_IMAGE_TYPE!=='none') s+='＋画像（'+(NT_IMAGE_TYPE==='list'?'箇条書き':'一文')+'）'; return s; }
  function ntReset(){ ntClearState(); NT_STEP="input"; NT_MAX=0; NT_NAME=""; NT_PROMPT=""; NT_PROMPT_BEFORE=""; NT_DIFF=""; NT_EDIT_ID=null; NT_DRAFTS=[]; NT_KEPT=[]; NT_SEEN=[]; NT_ORIGIN=""; ntRender(); }
  function ntRecordSeen(){ // 今表示中のサンプル本文を既出ネタに記録（次バッチで被らせない）
    (NT_DRAFTS||[]).forEach(function(d){ var b=(d.body||"").trim(); if(b) NT_SEEN.push(b); });
    if(NT_SEEN.length>80) NT_SEEN=NT_SEEN.slice(-80);
  }
  var NT_ORDER={input:0,prompt:1,training:2,finish:3};
  function ntReach(k){ if(NT_ORDER[k]>NT_MAX) NT_MAX=NT_ORDER[k]; } // 前進したら到達点を更新
  function ntGoStep(k){ if(NT_ORDER[k]<=NT_MAX){ NT_STEP=k; ntRender(); } } // 到達済みなら前後どちらへも（再生成なし）
  function ntStepper(){
    var steps=[["input","1. 入力"],["prompt","2. 型を確認"],["training","3. トレーニング"],["finish","4. 仕上げ"]];
    var idx=NT_ORDER[NT_STEP]; var h="<div class='tsteps'>";
    for(var i=0;i<steps.length;i++){
      if(i>0) h+="<span class='tarrow'>→</span>";
      var reach = i<=NT_MAX; // 到達済みステップはクリックで移動可（前にも後ろにも）
      var cls="tstep"+(i===idx?" on":(reach?" done":""));
      var attr = (reach && i!==idx) ? (" onclick=\\"ntGoStep('"+steps[i][0]+"')\\" style='cursor:pointer'") : "";
      h+="<span class='"+cls+"'"+attr+">"+steps[i][1]+"</span>";
    }
    return h+"</div>";
  }
  function ntStars(i){
    var rating=NT_DRAFTS[i].rating||0; var s="<span class='stars'>";
    for(var n=1;n<=5;n++){ s+="<span class='star"+(n<=rating?' on':'')+"' onclick='ntRate("+i+","+n+")'>★</span>"; }
    return s+"</span>";
  }
  // （旧・集合知UIの未使用関数 ntListHtml/ntHqHtml/ntShare/ntUseHqType/ntSyncHonbu は撤去。集合知は「型の検索」に集約済み）
  // 型の長さ・形式パターン → 表示ラベル。
  var PAT_LABEL={single_short:"単発・短文",single_long:"単発・長文",thread_short:"連結・短文",thread_long:"連結・短＋長",url:"🔗 URLに繋げる",img_ss_one:"🖼 短文・単発＋画像（一文）",img_sl_one:"🖼 長文・単発＋画像（一文）",img_ts_one:"🖼 短文＋短文・連結＋画像（一文）",img_tl_one:"🖼 短文＋長文・連結＋画像（一文）",img_ss_list:"🖼 短文・単発＋画像（箇条書き）",img_sl_list:"🖼 長文・単発＋画像（箇条書き）",img_ts_list:"🖼 短文＋短文・連結＋画像（箇条書き）",img_tl_list:"🖼 短文＋長文・連結＋画像（箇条書き）",img_oneliner:"🖼 画像・一文",img_list:"🖼 画像・箇条書き"};
  function patLabel(p){ return PAT_LABEL[p]||""; }
  function patLabelFromKey(k){ var parts=(k||"").split("##"); return parts.length>1?(PAT_LABEL[parts[1]]||""):""; }
  function patKeyFromKey(k){ var parts=(k||"").split("##"); return parts.length>1?parts[1]:""; }
  function patPill(label){ return label?(" <span class='pill' style='background:var(--accent-bg);color:var(--accent-strong)'>"+label+"</span>"):""; }
  // カタログ型名は「切り口（パターン名）」形式。末尾の（パターン名）はバッジに出すので名前からは外す（重複回避）。
  function stripPat(name){ var s=name||""; for(var k in PAT_LABEL){ var suf="（"+PAT_LABEL[k]+"）"; if(s.length>suf.length && s.slice(-suf.length)===suf) return s.slice(0,s.length-suf.length); } return s; }
  // ポストの「型」表示：切り口（##パターン除く）＋パターンのラベルバッジ。予約済み/投稿済み/承認で共通。
  function hookLabelHtml(hook){ if(!hook) return ""; var base=String(hook).split("##")[0]; return "<div class='note' style='font-size:11px;margin-bottom:4px'>🏷 "+esc(base)+patPill(patLabelFromKey(hook))+"</div>"; }
  // ── 型の検索（カタログ型を採用 ＋ 集合知ライブラリを取り込む）──
  var TS_HQ=[];   // 本部から配られた昇格型（みんなに効く型）
  var TS_STD=[];  // カタログ型（採用候補）
  var TS_MERGED=[]; // 統合リスト（カタログ＋集合知・tsSampleM/tsUseMのindex基準）
  var TS_SAMPLING=0; // サンプル生成の同時実行数（>0なら自動同期の再描画を見送って生成枠を守る）
  function fetchTypeSearch(){
    return Promise.all([
      api("GET","/api/types/portfolio?account="+ACC),
      api("GET","/api/hq/library?account="+ACC)
    ]).then(function(rs){
      TS_STD=((rs[0].body&&rs[0].body.standard)||[]);
      TS_HQ=((rs[1].body&&rs[1].body.library)||[]);
      renderTypeSearch();
    });
  }
  function loadTypeSearch(){
    var el=$("tsBody"); if(el) el.innerHTML="<div class='spin'></div>";
    fetchTypeSearch();
    autoSyncHonbu(); // 開いたら自動で最新化（手動ボタン不要・1時間に1回まで）
  }
  // 本部と自動同期：型の検索を開いたとき、最後の同期から1時間以上ならバックグラウンドで同期して再描画。
  function autoSyncHonbu(){
    var last=0; try{ last=parseInt(localStorage.getItem("ts_last_sync")||"0",10)||0; }catch(e){}
    if(Date.now()-last < 3600000) return;
    api("POST","/api/hq/sync").then(function(r){
      if(r.body&&r.body.ok){ try{ localStorage.setItem("ts_last_sync",String(Date.now())); }catch(e){} if(TS_SAMPLING===0) fetchTypeSearch(); } // 生成中は再描画を見送る
    });
  }
  function tsSearch(){ renderTypeSearch(); }
  function tsAdopt(key,i){
    api("POST","/api/account/type-onoff",{account:ACC,key:key,on:true}).then(function(r){
      if(r.body&&r.body.ok){
        msg("採用しました（採用中 "+(r.body.active||"")+" 種）。型の管理で頻度を調整できます。");
        // 画面全体を再描画するとサンプルが消えるので、ローカル状態だけ更新し、そのカードのボタンだけ差し替える。
        TS_STD.forEach(function(t){ if(t.key===key) t.on=true; });
        var b=$("tsAdoptBtn"+i); if(b) b.outerHTML="<span class='pill' style='background:#e1f5ee;color:var(--ok)'>✓ 採用済み</span>";
      }
      else { msg((r.body&&r.body.error)||"採用できませんでした。",false); }
    });
  }
  function renderTypeSearch(){
    var el=$("tsBody"); if(!el) return;
    var q=($("tsQ")?$("tsQ").value:"").trim().toLowerCase();
    var sort=($("tsSort")?$("tsSort").value:"score");
    var sel=($("tsPeriod")?$("tsPeriod").value:"30");
    var hit=function(s){ return !q || s.toLowerCase().indexOf(q)>=0; };
    function win(t){ // 集合知型の選択期間スコア。無ければ既定（保存値）にフォールバック
      var sj=null; try{ sj=t.scores_json?(typeof t.scores_json==="string"?JSON.parse(t.scores_json):t.scores_json):null; }catch(e){ sj=null; }
      if(sj&&sj[sel]) return {s:sj[sel].s, st:sj[sel].st, mc:sj[sel].mc, has:true};
      return {s:(t.score||0), st:(t.sample_total||0), mc:(t.member_count||0), has:false};
    }
    // カタログ標準（未採用）＝暫定スコア1.0（±0%・データ蓄積前）＋ 集合知（その期間10ポスト以上）を1つのリストに統合。
    var items=[];
    var pf=($("tsPat")?$("tsPat").value:""); // ラベル（パターン）で絞り込み
    var longHidden=function(pk){ return !IS_PREMIUM && (pk==='single_long'||pk==='thread_long'); }; // 長文はPremium限定
    TS_STD.forEach(function(t){ if(t.on) return; if(!hit((t.name||"")+" "+(t.desc||""))) return; if(pf && t.pattern!==pf) return; if(longHidden(t.pattern)) return;
      items.push({src:"std", name:t.name, key:t.key, kind:t.kind, core:t.core, desc:t.desc||"", score:1.0, posts:0, people:0, provisional:true, mine:false, pkey:(t.pattern||""), plabel:(t.pattern_label||patLabel(t.pattern))}); });
    TS_HQ.forEach(function(t){ if(!hit((t.name||"")+" "+(t.prompt||""))) return; var w=win(t); if(!(w.has&&(w.st||0)>=10)) return; if(pf && patKeyFromKey(t.type_key)!==pf) return; if(longHidden(patKeyFromKey(t.type_key))) return;
      items.push({src:"hq", name:t.name, desc:t.prompt||"", score:w.s, posts:w.st, people:w.mc, provisional:false, mine:!!t.mine, pkey:patKeyFromKey(t.type_key), plabel:patLabelFromKey(t.type_key)}); });
    items.sort(function(a,b){ return sort==="members" ? ((b.people||0)-(a.people||0)) : (sort==="posts" ? ((b.posts||0)-(a.posts||0)) : ((b.score||0)-(a.score||0))); });
    TS_MERGED=items;
    var h="";
    h+="<div class='note' style='margin:2px 0 10px'>型を探して、🪄サンプルで自分のデータで試し、気に入ったら採用。スコアは平常比（"+esc(sel)+"日間）。<b>カタログ型は実績が貯まるまで暫定±0%</b>です。<br>💳 「🪄サンプルポストを生成」を押すたびに、あなたのClaude APIに料金が発生します（1回 約3〜5円）。</div>";
    if(!items.length){ h+="<div class='card'><div class='note'>"+(q?("「"+esc(q)+"」に当てはまる型はありません。"):"表示できる型がありません。")+"</div></div>"; }
    items.forEach(function(x,i){
      var pct=Math.round(((x.score||1)-1)*100);
      var badges=patPill(x.plabel);
      if(!x.provisional && pct>=5) badges+=" <span class='pill' style='background:#e1f5ee;color:var(--ok)'>おすすめ</span>";
      if(x.mine) badges+=" <span class='pill' style='background:var(--accent-bg);color:var(--accent-strong)'>導入済み</span>";
      h+="<div class='card' style='margin-bottom:10px'><div><b>"+esc(stripPat(x.name))+"</b>"+badges+"</div>";
      if(x.provisional){ h+="<div class='note' style='margin-top:3px'><b>スコア（平常比）±0%</b> <span style='opacity:.7'>（暫定・実績が貯まると更新）</span></div>"; }
      else { h+="<div class='note' style='margin-top:3px'><b>スコア（平常比）"+(pct>=0?"+":"")+pct+"%</b> ・ "+(x.posts||0)+"ポストの実績 ・ "+(x.people||0)+"人が利用 <span style='opacity:.7'>（"+esc(sel)+"日間）</span></div>"; }
      if(x.desc) h+="<div class='note' style='white-space:pre-wrap;margin-top:4px'>"+esc(x.desc)+"</div>";
      h+="<div class='row' id='tsAct"+i+"' style='margin-top:8px;gap:6px;flex-wrap:wrap'><button class='soft' style='padding:4px 12px;font-size:13px' onclick='tsSampleM("+i+")'>🪄 この型でサンプルポストを生成してみる</button>";
      if(x.src==="std"){ h+="<button id='tsAdoptBtn"+i+"' class='accent' style='padding:4px 12px;font-size:13px' onclick='tsAdoptM("+i+")'>＋ 採用する</button>"; }
      else if(!x.mine){ h+="<button class='accent' style='padding:4px 12px;font-size:13px' onclick='tsUseM("+i+")'>＋ この型を使ってみる</button>"; }
      h+="</div><div id='smpM"+i+"' style='margin-top:6px'></div>";
      h+="</div>";
    });
    if($("tsCount")) $("tsCount").textContent = items.length+" 件（カタログ＋集合知）";
    el.innerHTML=h;
  }
  // 型を「自分のデータ・文体」で試す（投稿キューに入れない＝生成して見せるだけ）。
  function tsSampleM(i){ var x=TS_MERGED[i]; if(!x) return; tsSample("smpM"+i, x.src==="std"?{ type_key:x.key }:{ instructions:x.desc }); }
  function tsAdoptM(i){ var x=TS_MERGED[i]; if(!x||x.src!=="std") return; tsAdopt(x.key,i); }
  function tsUseM(i){ var x=TS_MERGED[i]; if(!x||x.src!=="hq") return;
    NT_EDIT_ID=null; NT_NAME=x.name||""; NT_PROMPT=x.desc||""; NT_ORIGIN="（型の検索から取り込み）"; NT_PATTERN="single_short"; NT_IMAGE_TYPE="none";
    NT_PROMPT_BEFORE=""; NT_DIFF=""; NT_DRAFTS=[]; NT_KEPT=[]; NT_SEEN=[];
    NT_STEP="prompt"; NT_MAX=NT_ORDER.prompt; ntPersist(); nav("newtype"); try{ window.scrollTo(0,0); }catch(e){}
  }
  // サンプルに付く画像カード（画像型のとき。連結は1ポスト目に付く）。
  function tsCardHtml(d){ if(!d||!d.card) return ""; return "<div style='margin-top:6px'><div class='note' style='margin-bottom:3px'>🖼 付く画像カード"+(d.reply_text?"（1ポスト目に付きます）":"")+"</div><img src='"+d.card+"' style='max-width:100%;border-radius:10px;border:1px solid var(--border)'></div>"; }
  function tsSample(divId, payload){
    var el=$(divId); if(!el) return;
    el.innerHTML="<div style='border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center;background:var(--surface)'>"
      +"<div class='spin' style='margin:0 auto'></div>"
      +"<div style='font-weight:500;margin-top:8px'>🪄 サンプルポストを生成中…</div>"
      +"<div class='note' style='margin-top:2px'>あなたのデータ・文体で作成しています（ふつう10〜30秒）</div></div>";
    TS_SAMPLING++; // 生成中カウント（再描画で消えないように・複数同時OK）
    function done(){ if(TS_SAMPLING>0) TS_SAMPLING--; }
    api("POST","/api/account/sample-preview", Object.assign({account:ACC,count:1}, payload)).then(function(r){
      done();
      var el2=$(divId); if(!el2) return; // 念のため取り直し（再描画されていても自分の枠に書く）
      var b=r.body||{}; var ds=b.drafts||[];
      if(!b.ok||!ds.length){ el2.innerHTML="<div class='note' style='color:#c0392b'>"+esc(b.error||"サンプルを作れませんでした。文体データが少ない場合は、まず学習データで過去投稿を学習させてください。")+"</div>"; return; }
      var h="<div class='note' style='margin:2px 0 4px'>あなた仕様のサンプル例（投稿はしていません）：</div>";
      ds.forEach(function(d){
        // 連結は①1本目／②2本目を明示（threadView）。単発は1枠。長文は140字で「続きを見る」＝折りたたみ位置も見える。
        if(d.reply_text){ h+="<div style='margin-bottom:10px'>"+threadView(d)+tsCardHtml(d)+"</div>"; }
        else { h+="<div class='tw' style='margin-bottom:10px'>"+bodyHtml(d.body||"")+postLenNote(d.body||"", reviewCharLimit)+tsCardHtml(d)+"</div>"; }
      });
      el2.innerHTML=h;
    }, function(){ done(); var e2=$(divId); if(e2) e2.innerHTML="<div class='note' style='color:#c0392b'>通信に失敗しました。もう一度お試しください。</div>"; });
  }
  // ── 型の管理（採用ON/OFF ＋ 優先度。採用は常に10種以上）──
  var TM_CUSTOM=[], TM_STD=[], TM_ACTIVE=0, TM_AUTO_DEMOTE=false, TM_UNADOPTED=[];
  function loadTypeManage(){
    var el=$("tmBody"); if(el) el.innerHTML="<div class='spin'></div>";
    api("GET","/api/types/portfolio?account="+ACC).then(function(r){
      var b=r.body||{}; TM_CUSTOM=b.custom||[]; TM_STD=b.standard||[]; TM_ACTIVE=b.active||0; TM_AUTO_DEMOTE=!!b.auto_demote; TM_UNADOPTED=b.auto_unadopted||[]; renderTypeManage();
    });
  }
  function tmAutoDemote(on){ api("POST","/api/account/auto-demote",{account:ACC,on:on}).then(function(r){ if(r.body&&r.body.ok){ TM_AUTO_DEMOTE=on; msg(on?"スコアが低い型を自動で不採用にします（最低10種は残します）。":"自動不採用をオフにしました。"); } else { msg("変更できませんでした。",false); loadTypeManage(); } }); }
  function tmReadopt(key){ api("POST","/api/account/readopt",{account:ACC,key:key}).then(function(r){ if(r.body&&r.body.ok){ msg("採用に戻しました（以後は自動で外しません）。"); loadTypeManage(); refreshBadges&&refreshBadges(); } else { msg((r.body&&r.body.error)||"戻せませんでした。",false); } }); }
  // 型ごとの実績（実際に投稿した件数＋学習スコア＝平常比。URL誘導はクリック/CVの平常比）。
  function typeStatHtml(t){
    var posts=t.posts||0;
    var label=(t.pattern==='url')?"クリック/CV":"平常比";
    if(t.score==null || posts<1){ return "<span class='note' style='font-size:11px'>📊 投稿"+posts+"件 ・ データ蓄積中</span>"; }
    var pct=Math.round(((t.score||1)-1)*100);
    var col=pct>=5?"var(--ok)":(pct<=-5?"#c0392b":"var(--muted)");
    return "<span class='note' style='font-size:11px'>📊 投稿"+posts+"件 ・ <b style='color:"+col+"'>"+label+(pct>=0?"+":"")+pct+"%</b><span style='opacity:.6'>（"+(t.score_n||0)+"本で測定）</span></span>";
  }
  function tmCtrl(key,on,p){ // 採用トグル（ON=採用/OFF=不採用）＋優先度セレクタ（共通）
    var sw="<span class='note' style='font-size:12px'>採用</span><label class='switch' title='ONで採用・OFFで不採用'><input type='checkbox' "+(on?"checked":"")+" onchange=\\"tmToggle('"+esc(key)+"',this.checked)\\"><span class='slider'></span></label>";
    var sel="<select title='使う頻度' onchange=\\"savePriority('"+esc(key)+"',this.value)\\" style='width:auto'"+(on?"":" disabled")+"><option value='more'"+(p==='more'?' selected':'')+">多め</option><option value='normal'"+(p==='normal'?' selected':'')+">普通</option><option value='less'"+(p==='less'?' selected':'')+">控えめ</option></select>";
    return "<div class='row' style='gap:6px;align-items:center;flex-wrap:nowrap'>"+sw+sel+"</div>";
  }
  function renderTypeManage(){
    var el=$("tmBody"); if(!el) return; var h="";
    h+="<div class='card' style='background:var(--accent-bg);border-color:#b5d4f4'><b>採用中：<span id='tmActive'>"+TM_ACTIVE+"</span> 種類</b> <span class='note'>（最低10種は必ず残します。OFFにできない＝それ以上は減らせません。控えめでも完全には止めず、AIが“当たり型”を探す幅を確保）</span></div>";
    // スコアが低い型を自動で不採用にするトグル。
    h+="<div class='card'><div class='row' style='justify-content:space-between;align-items:center;gap:10px'><div style='min-width:0'><b>スコアが低い型を自動で不採用にする</b><div class='note' style='margin-top:2px'>ONにすると、十分にデータがたまった型のうち<b>平常比が低いもの</b>をサイクルで自動的に不採用にします（最低10種は必ず残す／手動で戻した型は再び外しません）。外した型は下の「不採用リスト」に残ります。</div></div><label class='switch' title='ONで自動不採用'><input type='checkbox' "+(TM_AUTO_DEMOTE?'checked':'')+" onchange='tmAutoDemote(this.checked)'><span class='slider'></span></label></div></div>";
    h+="<div class='card'><h3 style='margin-top:0'>あなたの型（"+TM_CUSTOM.length+"）</h3>";
    if(!TM_CUSTOM.length){ h+="<div class='note'>まだありません。「型の開発」で作るか、「型の検索」から取り込めます。</div>"; }
    TM_CUSTOM.forEach(function(t){
      var key="⭐ "+t.name;
      h+="<div style='border-bottom:1px solid var(--border);padding:8px 0'><div class='row' style='justify-content:space-between;align-items:flex-start;gap:8px'><div style='min-width:0'><b>⭐ "+esc(t.name)+"</b>"+patPill(patLabel(t.pattern))+(t.origin?" <span class='note'>"+esc(t.origin)+"</span>":"")+"</div>"+tmCtrl(key,t.on,t.priority)+"</div><div style='margin-top:3px'>"+typeStatHtml(t)+"</div><div class='note' style='white-space:pre-wrap;margin-top:2px'>"+esc(t.prompt)+"</div><div class='row' style='gap:6px;margin-top:6px'><button class='accent' style='padding:4px 12px;font-size:13px' onclick='tmEdit("+t.id+")'>✏️ 編集・再トレーニング</button><button class='soft' style='padding:4px 12px;font-size:13px' onclick='tmDelete("+t.id+")'>削除</button></div></div>";
    });
    h+="<div class='note' style='margin-top:8px'>すべての型は構造と反応データ（平常比）だけを匿名で本部に共有します（本文・文体は送りません）。</div></div>";
    var stdOn=TM_STD.filter(function(t){return t.on;});
    h+="<div class='card'><h3 style='margin-top:0'>採用中のカタログ型（"+stdOn.length+"）</h3><div class='note' style='margin-bottom:6px'><b>「採用」スイッチをOFFにすると不採用</b>になり「型の検索」のカタログに戻ります。頻度は多め/普通/控えめで調整。※採用は最低10種（10種ちょうどのときは先に別の型を採用してから外してください）。</div>";
    stdOn.forEach(function(t){
      h+="<div style='border-bottom:1px solid var(--border);padding:7px 0'><div class='row' style='justify-content:space-between;align-items:center;gap:8px'><div style='min-width:0'><b style='font-weight:500'>"+esc(stripPat(t.name))+"</b>"+patPill(t.pattern_label||patLabel(t.pattern))+"</div>"+tmCtrl(t.key,t.on,t.priority)+"</div><div style='margin-top:2px'>"+typeStatHtml(t)+"</div></div>";
    });
    h+="<div class='note' style='margin-top:8px'>もっと型を増やすには <a style='cursor:pointer;text-decoration:underline' onclick=\\"nav('typesearch')\\">型の検索</a> でカタログから採用してください（全"+TM_STD.length+"種）。</div></div>";
    // 不採用リスト（自動でスコア低として外した型）。
    if(TM_UNADOPTED.length){
      h+="<div class='card'><h3 style='margin-top:0'>不採用リスト（自動で外した型 "+TM_UNADOPTED.length+"）</h3><div class='note' style='margin-bottom:6px'>スコア（平常比）が低く、データも十分だったため自動で外した型です。戻したい型は「採用に戻す」を押すと再採用し、以後は自動で外しません。</div>";
      TM_UNADOPTED.forEach(function(u){
        var pct=Math.round((((u.score!=null?u.score:1))-1)*100);
        var col=pct<=-5?"#c0392b":"var(--muted)";
        h+="<div class='row' style='justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding:7px 0;gap:8px'><div style='min-width:0'><b style='font-weight:500'>"+esc(stripPat(u.name||u.key||''))+"</b><div class='note' style='font-size:11px'>📊 投稿"+(u.posts||0)+"件 ・ <b style='color:"+col+"'>平常比"+(pct>=0?'+':'')+pct+"%</b>（"+(u.n||0)+"本で測定）"+(u.at?(" ・ "+esc(String(u.at).slice(0,10))+"に自動不採用"):"")+"</div></div><button class='accent' style='padding:4px 12px;font-size:13px' onclick=\\"tmReadopt('"+esc(u.key||'')+"')\\">採用に戻す</button></div>";
      });
      h+="</div>";
    }
    el.innerHTML=h;
  }
  function tmToggle(key,on){
    api("POST","/api/account/type-onoff",{account:ACC,key:key,on:on}).then(function(r){
      var b=r.body||{};
      if(b.ok){
        TM_ACTIVE=b.active; if($("tmActive")) $("tmActive").textContent=b.active;
        // ローカル状態を実際の操作に合わせて更新してから再描画（古いデータで描き直さない）。
        TM_STD.forEach(function(t){ if(t.key===key) t.on=on; });
        TM_CUSTOM.forEach(function(t){ if(("⭐ "+t.name)===key) t.on=on; });
        renderTypeManage();
        msg(on?"採用しました。":"不採用にしました（型の検索のカタログに戻ります）。");
      }
      else { msg(b.error||"変更できませんでした。",false); loadTypeManage(); } // 失敗（10種未満等）はサーバ状態に戻す
    });
  }
  function savePriority(name,level){
    api("POST","/api/account/type-priority",{account:ACC,name:name,level:level}).then(function(r){
      if(r.body&&r.body.ok){ msg("頻度を"+(level==='more'?'多め':(level==='less'?'控えめ':'普通'))+"にしました。"); }
      else { msg((r.body&&r.body.error)||"保存に失敗しました。",false); }
    });
  }
  function tmEdit(id){
    var t=null; for(var i=0;i<TM_CUSTOM.length;i++){ if(TM_CUSTOM[i].id===id){ t=TM_CUSTOM[i]; break; } }
    if(!t) return;
    NT_EDIT_ID=id; NT_NAME=t.name||""; NT_PROMPT=t.prompt||""; NT_ORIGIN=t.origin||""; NT_PATTERN=t.pattern||"single_short"; NT_IMAGE_TYPE=t.image_type||"none";
    NT_PROMPT_BEFORE=""; NT_DIFF=""; NT_DRAFTS=[]; NT_KEPT=[]; NT_SEEN=[];
    NT_STEP="prompt"; NT_MAX=NT_ORDER.prompt;
    ntPersist(); nav("newtype"); try{ window.scrollTo(0,0); }catch(e){}
  }
  function tmDelete(id){
    if(!confirm("この型を削除しますか？")) return;
    api("POST","/api/types/delete",{account:ACC,id:id}).then(function(r){ if(r.body&&r.body.ok){ msg("削除しました。"); loadTypeManage(); } else { msg("削除に失敗しました。",false); } });
  }
  function ntRender(){
    var el=$("ntBody"); if(!el) return; var h=ntStepper();
    var inProg = NT_STEP!=="input" || (NT_ORIGIN||"").trim() || NT_PROMPT;
    if(inProg){ h+="<div class='row' style='justify-content:space-between;align-items:center;margin:-6px 0 12px;gap:8px'><span class='note'>💾 作成中（離れても自動保存・続きから再開できます）</span><button class='soft' style='padding:3px 12px;font-size:12px' onclick='ntCancel()'>✕ 中止</button></div>"; }
    if(NT_STEP==="input"){
      h+="<div class='card'>";
      // ① 構造（8択＝4形式×画像有無）。長文はPremium限定なので非Premiumでは隠す。
      if(!IS_PREMIUM && (NT_PATTERN==='single_long'||NT_PATTERN==='thread_long')) NT_PATTERN='single_short';
      h+="<label style='display:block;font-weight:600'>① どんな型を作りますか？（構造）</label>";
      h+="<div style='display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:8px 0 6px'>";
      NT_STRUCTS.forEach(function(s){
        var pat=s[0], img=s[1], lab=s[2];
        if(!IS_PREMIUM && (pat==='single_long'||pat==='thread_long')) return; // 長文はPremium限定
        var sel=(NT_PATTERN===pat && ((NT_IMAGE_TYPE!=='none')===img));
        h+="<button class='soft' style='padding:9px 10px;text-align:left;font-size:13px;line-height:1.3"+(sel?";border-color:var(--accent-strong);color:var(--accent-strong);background:var(--accent-bg);font-weight:700":"")+"' onclick=\\"ntPickStruct('"+pat+"',"+(img?'true':'false')+")\\">"+(sel?'✓ ':'')+lab+"</button>";
      });
      h+="</div>";
      if(URL_UNLOCKED){
        var usel=(NT_PATTERN==='url');
        h+="<button class='soft' style='padding:9px 10px;text-align:left;font-size:13px;width:100%"+(usel?";border-color:var(--accent-strong);color:var(--accent-strong);background:var(--accent-bg);font-weight:700":"")+"' onclick=\\"ntPickStruct('url',false)\\">"+(usel?'✓ ':'')+"🔗 URLに繋げる（1本目で引き＋2本目にリンク）</button>";
      }
      h+="<div class='note' style='margin:6px 0 0;line-height:1.6'>連結＋画像の場合、画像は<b>1ポスト目</b>に付きます。長文・連結の型は最初の140字（「続きを読む」より前）で引き込む作りで生成されます。"+(IS_PREMIUM?"":"<br>📌 長文（200字以上）はX Premiumの機能です。設定でPremiumをONにすると選べます。")+"</div>";
      // ② 画像あり → 中身の型（一文／箇条書き）
      if(NT_IMAGE_TYPE!=='none'){
        h+="<label style='display:block;font-weight:600;margin-top:14px'>② 画像の中身</label>";
        h+="<div class='row' style='gap:6px;margin:6px 0'><span class='rtab"+(NT_IMAGE_TYPE==='oneliner'?' on':'')+"' onclick=\\"ntSetImg('oneliner')\\">一文（見出し・名言）</span><span class='rtab"+(NT_IMAGE_TYPE==='list'?' on':'')+"' onclick=\\"ntSetImg('list')\\">箇条書き（比較・ランキング）</span></div>";
        h+="<div class='note' style='line-height:1.6'><b>一文</b>＝本文から最も刺さる一文をAIが取り出して大きな見出し画像に。<b>箇条書き</b>＝本文の要点をAIが3〜5項目にして画像に。<br><span style='opacity:.8'>※画像が付くのは「画像カードの型」をONにしているときだけ。色・フォントはそちらの設定が使われます。</span></div>";
      }
      // ③ 型のイメージ・参考ポスト（旧「イメージで作る」「ポストを参考に」を統合）
      h+="<label style='display:block;font-weight:600;margin-top:14px'>"+(NT_IMAGE_TYPE!=='none'?'③':'②')+" 型のイメージ・参考ポストを入れる</label>";
      h+="<textarea id='ntText' oninput='ntPersist()' style='min-height:90px;margin-top:6px' placeholder='「こんな型がほしい」というイメージ、または参考にしたいポストを貼ってください（1〜数本）。どちらでもOK。\\n例：常識をひっくり返して、最後に希望を残す感じの型がほしい'>"+esc(NT_ORIGIN||'')+"</textarea>";
      h+="<div class='row' style='margin-top:8px'><button class='primary' onclick='ntDraftPrompt()'>🪄 AIに型を作らせる</button></div>"+FEE_NOTE+"</div>";
    } else if(NT_STEP==="prompt"){
      var ntEd=(NT_EDIT_ID!=null);
      h+="<div class='card'>";
      if(ntEd){ h+="<div style='display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:9px 12px;background:var(--accent-bg);border-radius:var(--radius-sm);color:var(--accent-strong);font-size:13px'><i class='ti ti-edit' style='font-size:18px'></i><span><b>既存の型を編集中</b>　保存すると上書き更新されます</span></div>"; }
      h+="<label>型の名前（編集できます）</label><input id='ntName' oninput='ntPersist()' value='"+esc(NT_NAME)+"'>";
      if(!IS_PREMIUM && (NT_PATTERN==='single_long'||NT_PATTERN==='thread_long')) NT_PATTERN='single_short'; // 非Premiumは長文不可
      h+="<label style='margin-top:10px;display:block'>この型の構造</label>";
      h+="<div class='row' style='align-items:center;gap:10px;margin:4px 0'><span style='font-weight:700;color:var(--accent-strong)'>"+ntStructLabel()+"</span><button class='soft' style='padding:3px 12px;font-size:12px' onclick=\\"ntGoStep('input')\\">構造を変える</button></div>";
      if(NT_IMAGE_TYPE!=='none'){
        h+="<div class='row' style='margin:6px 0'><button class='soft' style='padding:4px 12px;font-size:13px' onclick='ntCardPreview()'>🖼 この型でカードを見る</button></div>";
        h+="<div class='note' style='line-height:1.6'>※画像が付くのは「画像カードの型」をONにしているときだけ。色・フォントはそちらの設定が使われます。"+(NT_PATTERN.indexOf('thread')===0?'連結なので画像は1ポスト目に付きます。':'')+"<br>💳 カードのプレビューはAIで本文を要約して作るため、少額のAPI料金が発生します。</div>";
      }
      h+="<div id='ntCardPrev' style='margin-top:8px'></div>";
      h+="<label style='margin-top:10px;display:block'>型のプロンプト（AIが作成・<b>そのまま手で修正もOK</b>）</label>";
      h+="<textarea id='ntPrompt' oninput='ntPersist()' style='min-height:90px;font-size:13px'>"+esc(NT_PROMPT)+"</textarea>";
      h+="<div style='border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;margin-top:10px'><div class='note' style='margin-bottom:4px'>🔁 AIに直してもらう（追加指示）</div><textarea id='ntFeedback' style='min-height:54px' placeholder='例：もっと短く／2本目に答えを置いて／煽りすぎない'></textarea><div class='row' style='margin-top:6px'><button class='accent' onclick='ntRedraft()'>この指示でAIに作り直してもらう</button></div></div>";
      var ntTrained = NT_MAX>=NT_ORDER.training;
      h+="<div class='row' style='margin-top:12px;gap:8px'><button class='soft' onclick=\\"ntGoStep('input')\\">← 戻る</button>";
      if(ntEd){ h+="<button class='primary' onclick='ntUpdateDirect()'>💾 更新（再トレーニングせず保存）</button>"; }
      if(ntTrained){
        h+="<button class='"+(ntEd?'soft':'primary')+"' onclick=\\"ntGoStep('training')\\">→ トレーニングに戻る（そのまま）</button>";
        h+="<button class='soft' onclick='ntTrain()'>🔄 この内容で作り直す（採用リセット）</button>";
      } else {
        h+="<button class='"+(ntEd?'soft':'primary')+"' onclick='ntTrain()'>"+(ntEd?'🔁 再トレーニングする（サンプル5つ）':'この型でサンプルを5つ作る')+"</button>";
      }
      h+="<button class='soft' onclick='ntReset()'>"+(ntEd?'編集をやめる':'最初からやり直す')+"</button></div>"+FEE_NOTE+"</div>";
    } else if(NT_STEP==="training"){
      var done=NT_KEPT.length, pct=Math.min(100,Math.round(done/NT_GOAL*100)), reached=done>=NT_GOAL;
      h+="<div class='card'><div class='note' style='margin-bottom:6px'>型「<b>"+esc(NT_NAME)+"</b>」を、<b>採用（添削完了 or ★5）が"+NT_GOAL+"件</b>たまるまで鍛えます。各サンプルに「添削」か「★評価」を。</div>";
      h+="<div style='font-weight:600;margin-bottom:4px'>採用 "+done+" / "+NT_GOAL+" 件　<span class='note' style='font-weight:400'>（あと "+Math.max(0,NT_GOAL-done)+"件）</span></div>";
      h+="<div class='pbar'><div class='pfill' style='width:"+pct+"%'></div></div>";
      NT_DRAFTS.forEach(function(d,i){
        if(d.editing){ // 編集中（未採用でも採用済みでも、ここで何度でも直せる）
          h+="<div class='hintcard'><div class='note'>サンプル "+(i+1)+(d.kept?" ・✓ 採用済み（編集中）":"")+"</div>";
          h+="<textarea id='nt-b-"+i+"' oninput='ntCount("+i+")' style='min-height:70px'>"+esc(d.body||'')+"</textarea>";
          h+="<div class='note' id='nt-bc-"+i+"' style='text-align:right;margin-top:2px'></div>";
          if(d.reply_text!=null){ h+="<div class='tw-h' style='margin-top:6px'>🧵 2本目</div><textarea id='nt-r-"+i+"' oninput='ntCount("+i+")' style='min-height:50px'>"+esc(d.reply_text||'')+"</textarea><div class='note' id='nt-rc-"+i+"' style='text-align:right;margin-top:2px'></div>"; }
          h+="<div class='row' style='margin-top:6px;gap:6px'><button class='primary' style='padding:3px 12px;font-size:13px' onclick='ntSaveEdit("+i+")'>直しを保存（＝採用）</button><button class='soft' style='padding:3px 12px;font-size:13px' onclick='ntCancelEdit("+i+")'>やめる</button></div>";
          h+="</div>"; return;
        }
        if(d.kept){ // 採用済み → もう一度編集できる
          h+="<div class='hintcard on'><div class='note'>サンプル "+(i+1)+" ・✓ 採用済み</div>"+threadView(d);
          h+="<div class='row' style='margin-top:6px'><button class='soft' style='padding:3px 12px;font-size:13px' onclick='ntEdit("+i+")'>✏️ もう一度編集する</button></div>";
          h+="</div>"; return;
        }
        h+="<div class='hintcard'><div class='note'>サンプル "+(i+1)+"</div>";
        h+=threadView(d);
        h+="<div class='row' style='margin-top:8px;align-items:center;gap:14px;flex-wrap:wrap'>";
        h+="<button class='accent' style='padding:3px 12px;font-size:13px' onclick='ntEdit("+i+")'>✏️ 添削する</button>";
        h+="<span style='display:inline-flex;align-items:center;gap:6px'><span class='note'>評価：</span>"+ntStars(i)+"</span>";
        h+="</div>";
        h+="</div>";
      });
      h+="<label style='margin-top:8px;display:block'>追加指示（任意・次の5本に反映）</label><textarea id='ntFeedback2' style='min-height:46px' placeholder='例：一言目をもっと強く／長すぎる'></textarea>";
      h+="<div class='row' style='margin-top:10px;gap:8px'><button class='soft' onclick=\\"ntGoStep('prompt')\\">← 戻る</button><button class='soft' onclick='ntNextBatch()'>🔄 次の5本を作る</button>";
      if(reached){ h+="<button class='primary' onclick='ntToFinish()'>✅ "+NT_GOAL+"件OK！プロンプト改善へ進む</button>"; }
      h+="</div>";
      h+="<div class='note' style='margin-top:6px'>添削（あなたの言葉に直す）＝採用／★5＝採用／★1〜4＝イマイチ。採用が"+NT_GOAL+"件たまると、AIがその傾向でプロンプトを改善します（採用してからが本番）。</div></div>";
    } else if(NT_STEP==="finish"){
      h+="<div class='card'><div class='note' style='margin-bottom:8px'>採用 <b>"+NT_KEPT.length+"件</b>の傾向を踏まえて、AIがプロンプトを改善しました。<b>改善前</b>と<b>改善後</b>を見比べて、確認・修正してから、再トレーニングするか採用してください。</div>";
      h+="<label>型の名前</label><input id='ntName' oninput='ntPersist()' value='"+esc(NT_NAME)+"'>";
      if((NT_DIFF||"").trim()){
        h+="<div style='display:flex;align-items:center;gap:8px;margin-top:10px;padding:9px 12px;background:var(--accent-bg);border-radius:var(--radius-sm);color:var(--accent-strong);font-size:13px'><i class='ti ti-arrows-diff' style='font-size:18px'></i><span><b>変えた点：</b>"+esc(NT_DIFF)+"</span></div>";
      }
      if((NT_PROMPT_BEFORE||"").trim()){
        var ntSame=(NT_PROMPT_BEFORE||"").trim()===(NT_PROMPT||"").trim();
        h+="<label style='margin-top:10px;display:block'>改善前のプロンプト（トレーニングで使った型）</label>";
        h+="<div style='border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;background:var(--surface);font-size:13px;white-space:pre-wrap;color:var(--muted)'>"+esc(NT_PROMPT_BEFORE)+"</div>";
        if(ntSame) h+="<div class='note' style='margin-top:4px'>※AIは大きな変更を加えませんでした（ほぼ同じ内容です）。</div>";
      }
      h+="<label style='margin-top:10px;display:block'>改善後のプロンプト（手で修正もOK）</label><textarea id='ntPrompt' oninput='ntPersist()' style='min-height:90px;font-size:13px'>"+esc(NT_PROMPT)+"</textarea>";
      h+="<div style='border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;margin-top:10px'><div class='note' style='margin-bottom:4px'>🔁 さらにAIに直してもらう（追加指示）</div><textarea id='ntFeedback' style='min-height:46px' placeholder='例：もっと締めに余白を'></textarea><div class='row' style='margin-top:6px'><button class='accent' onclick='ntRefineFinish()'>この指示で作り直してもらう</button></div></div>"+FEE_NOTE;
      h+="<div class='row' style='margin-top:12px;gap:8px'><button class='soft' onclick=\\"ntGoStep('training')\\">← トレーニングに戻る</button><button class='soft' onclick='ntRetrainFromFinish()'>🔄 改善プロンプトで再トレーニング</button><button class='primary' onclick='ntAdopt()'>🆗 この型を"+(NT_EDIT_ID!=null?"更新":"採用")+"する</button></div></div>";
    }
    // 登録済みの型の一覧・編集・削除は別メニュー「型の管理」へ。集合知は「型の検索」へ分離。
    el.innerHTML = h + "<div class='note' style='margin-top:10px'>登録済みの型の確認・編集・削除は <a style='cursor:pointer;text-decoration:underline' onclick=\\"nav('typemanage')\\">型の管理</a> へ。</div>";
    if(NT_STEP==="training"){ NT_DRAFTS.forEach(function(d,i){ if(d.editing) ntCount(i); }); } // 編集中の文字数を初期表示
    ntPersist(); // 状態が変わるたびに自動保存（途中で離れても再開できる）
  }
  function ntEdit(i){ NT_DRAFTS[i].editing=true; ntRender(); }
  function ntCancelEdit(i){ NT_DRAFTS[i].editing=false; ntRender(); }
  function ntCount(i){ // 編集中サンプルの文字数（連結の1本目は140／それ以外は本文上限。超過は赤）
    var d=NT_DRAFTS[i]; if(!d) return;
    var thread=d.reply_text!=null, lim=thread?140:reviewCharLimit;
    var b=$("nt-b-"+i), bc=$("nt-bc-"+i);
    if(b&&bc){ var n=jLen(b.value); bc.textContent=n+" / "+lim+" 字"+(thread?"（1本目）":""); bc.style.color=(n>lim)?"#c0392b":"var(--muted)"; }
    var r=$("nt-r-"+i), rc=$("nt-rc-"+i);
    if(r&&rc){ var rn=jLen(r.value); rc.textContent=rn+" / "+reviewCharLimit+" 字（2本目）"; rc.style.color=(rn>reviewCharLimit)?"#c0392b":"var(--muted)"; }
  }
  function ntKeep(i){ // サンプルiを採用（添削完了 or ★5）→ NT_KEPTに反映（再編集なら同じ枠を上書き）
    var d=NT_DRAFTS[i];
    if(d.kept){ if(d.keptIdx!=null && NT_KEPT[d.keptIdx]) NT_KEPT[d.keptIdx]={body:d.body, reply_text:d.reply_text}; return; }
    d.kept=true; d.keptIdx=NT_KEPT.length;
    NT_KEPT.push({body:d.body, reply_text:d.reply_text});
  }
  function ntSaveEdit(i){
    var b=$("nt-b-"+i); if(b) NT_DRAFTS[i].body=b.value;
    var r=$("nt-r-"+i); if(r) NT_DRAFTS[i].reply_text=r.value;
    NT_DRAFTS[i].editing=false; NT_DRAFTS[i].edited=true; ntKeep(i); ntRender();
  }
  function ntRate(i,n){ NT_DRAFTS[i].rating=n; if(n>=5) ntKeep(i); ntRender(); }
  function ntDraftPrompt(){
    var t=$("ntText")?$("ntText").value.trim():""; if(!t){ msg("イメージか参考ポストを入れてください。",false); return; }
    NT_ORIGIN=t; if($("ntBody")) $("ntBody").innerHTML=genWaitCard();
    api("POST","/api/types/draft-prompt",{account:ACC,mode:NT_MODE,text:t}).then(function(r){
      if(r.body&&r.body.ok){ NT_NAME=r.body.name||"オリジナルの型"; NT_PROMPT=r.body.prompt||""; NT_STEP="prompt"; ntReach("prompt"); ntRender(); }
      else { msg((r.body&&r.body.error)||"作れませんでした。",false); NT_STEP="input"; ntRender(); }
    });
  }
  function ntRedraft(){
    NT_NAME=($("ntName")&&$("ntName").value.trim())||NT_NAME;
    if($("ntPrompt")) NT_PROMPT=$("ntPrompt").value;
    var fb=$("ntFeedback")?$("ntFeedback").value.trim():"";
    if(!fb && !(NT_PROMPT||"").trim()){ msg("追加指示か、プロンプトの修正を入れてください。",false); return; }
    if($("ntBody")) $("ntBody").innerHTML=genWaitCard();
    api("POST","/api/types/draft-prompt",{account:ACC,mode:NT_MODE,text:NT_ORIGIN,current_prompt:NT_PROMPT,feedback:fb}).then(function(r){
      if(r.body&&r.body.ok){ NT_PROMPT=r.body.prompt||NT_PROMPT; if(r.body.name) NT_NAME=r.body.name; ntRender(); }
      else { msg((r.body&&r.body.error)||"作り直せませんでした。",false); ntRender(); }
    });
  }
  function ntNormDrafts(arr){ return (arr||[]).map(function(d){ return {body:d.body,reply_text:d.reply_text,hook:d.hook,rating:0,editing:false,edited:false,kept:false}; }); }
  function ntKeptExamples(){ return NT_KEPT.map(function(d){ return d.body+(d.reply_text?("\\n→ "+d.reply_text):""); }); }
  function ntTrain(){ // プロンプト確認→初回トレーニング（採用カウントをリセット）
    NT_NAME=($("ntName")&&$("ntName").value.trim())||NT_NAME;
    if($("ntPrompt")) NT_PROMPT=$("ntPrompt").value;
    if($("ntPattern")) NT_PATTERN=$("ntPattern").value;
    if(!(NT_PROMPT||"").trim()){ msg("プロンプトが空です。",false); return; }
    if(NT_KEPT.length && !confirm("サンプルを作り直すと、これまでの採用 "+NT_KEPT.length+"件はリセットされます。よろしいですか？\\n（そのまま続きをやるなら「トレーニングに戻る（そのまま）」を）")) return;
    NT_KEPT=[]; NT_SEEN=[]; if($("ntBody")) $("ntBody").innerHTML=genWaitCard(); // 初回は既出ネタもリセット
    api("POST","/api/types/train",{account:ACC,prompt:NT_PROMPT,pattern:NT_PATTERN}).then(function(r){
      if(r.body&&r.body.ok){ NT_DRAFTS=ntNormDrafts(r.body.drafts); ntRecordSeen(); NT_STEP="training"; ntReach("training"); ntRender(); }
      else { msg((r.body&&r.body.error)||"サンプルを作れませんでした。",false); NT_STEP="prompt"; ntRender(); }
    });
  }
  function ntNextBatch(){ // 次の5本（既出ネタを避ける＋採用例＋追加指示を反映して、より良いサンプルに）
    var fb=$("ntFeedback2")?$("ntFeedback2").value.trim():"";
    if($("ntBody")) $("ntBody").innerHTML=genWaitCard();
    api("POST","/api/types/train",{account:ACC,prompt:NT_PROMPT,pattern:NT_PATTERN,feedback:fb,examples:ntKeptExamples(),avoid:NT_SEEN.slice(-60)}).then(function(r){
      if(r.body&&r.body.ok){ NT_DRAFTS=ntNormDrafts(r.body.drafts); ntRecordSeen(); ntRender(); }
      else { msg((r.body&&r.body.error)||"作れませんでした。",false); ntRender(); }
    });
  }
  function ntToFinish(){ // 採用10件→AIがプロンプトを改善→仕上げステップ
    if(NT_KEPT.length<NT_GOAL){ msg("採用が"+NT_GOAL+"件たまってから進めます。",false); return; }
    NT_PROMPT_BEFORE=NT_PROMPT; // トレーニングで使った型＝改善前として保存（改善後と見比べる）
    if($("ntBody")) $("ntBody").innerHTML=genWaitCard();
    api("POST","/api/types/draft-prompt",{account:ACC,mode:NT_MODE,text:NT_ORIGIN,current_prompt:NT_PROMPT,feedback:"トレーニングの採用例を踏まえて、この型のプロンプトを磨いてください。",examples:ntKeptExamples()}).then(function(r){
      if(r.body&&r.body.ok){ NT_PROMPT=r.body.prompt||NT_PROMPT; if(r.body.name) NT_NAME=r.body.name; NT_DIFF=r.body.change_summary||""; NT_STEP="finish"; ntReach("finish"); ntRender(); }
      else { msg((r.body&&r.body.error)||"改善できませんでした。",false); ntRender(); }
    });
  }
  function ntRefineFinish(){ // 仕上げで追加指示→プロンプト再改善
    if($("ntName")) NT_NAME=$("ntName").value;
    if($("ntPrompt")) NT_PROMPT=$("ntPrompt").value;
    var fb=$("ntFeedback")?$("ntFeedback").value.trim():"";
    if(!fb && !(NT_PROMPT||"").trim()){ msg("追加指示か、プロンプトの修正を入れてください。",false); return; }
    NT_PROMPT_BEFORE=NT_PROMPT; // 今表示中（改善後・手直し含む）を改善前として保存
    if($("ntBody")) $("ntBody").innerHTML=genWaitCard();
    api("POST","/api/types/draft-prompt",{account:ACC,mode:NT_MODE,text:NT_ORIGIN,current_prompt:NT_PROMPT,feedback:fb,examples:ntKeptExamples()}).then(function(r){
      if(r.body&&r.body.ok){ NT_PROMPT=r.body.prompt||NT_PROMPT; if(r.body.name) NT_NAME=r.body.name; NT_DIFF=r.body.change_summary||""; ntRender(); }
      else { msg((r.body&&r.body.error)||"作り直せませんでした。",false); ntRender(); }
    });
  }
  function ntRetrainFromFinish(){ // 改善プロンプトで再トレーニング（採用は引き継ぐ）
    if($("ntName")) NT_NAME=$("ntName").value;
    if($("ntPrompt")) NT_PROMPT=$("ntPrompt").value;
    if($("ntPattern")) NT_PATTERN=$("ntPattern").value;
    if($("ntBody")) $("ntBody").innerHTML=genWaitCard();
    api("POST","/api/types/train",{account:ACC,prompt:NT_PROMPT,pattern:NT_PATTERN,examples:ntKeptExamples(),avoid:NT_SEEN.slice(-60)}).then(function(r){
      if(r.body&&r.body.ok){ NT_DRAFTS=ntNormDrafts(r.body.drafts); ntRecordSeen(); NT_STEP="training"; ntRender(); }
      else { msg((r.body&&r.body.error)||"作れませんでした。",false); NT_STEP="finish"; ntRender(); }
    });
  }
  function ntAdopt(){ // 仕上げで採用＝保存（編集中なら更新）。採用サンプルを下書きに残せる。
    if($("ntName")) NT_NAME=$("ntName").value;
    if($("ntPrompt")) NT_PROMPT=$("ntPrompt").value;
    if($("ntPattern")) NT_PATTERN=$("ntPattern").value;
    if($("ntImage")) NT_IMAGE_TYPE=$("ntImage").value;
    var editing=(NT_EDIT_ID!=null);
    var keep=false;
    if(NT_KEPT.length){ keep=confirm((editing?"この内容で型を更新します。":"この型を採用します。")+"\\n採用したサンプル"+NT_KEPT.length+"本（最大10本）を下書き（承認＆添削）に残しますか？\\nOK＝残す ／ キャンセル＝"+(editing?"更新だけ":"型だけ採用")); }
    else { if(!confirm(editing?"この内容で型を更新しますか？":"この型を採用しますか？")) return; }
    var payload={account:ACC,name:NT_NAME,prompt:NT_PROMPT,origin:NT_ORIGIN,pattern:NT_PATTERN,image_type:NT_IMAGE_TYPE};
    if(editing) payload.id=NT_EDIT_ID;
    if(keep&&NT_KEPT.length){ payload.keep_posts=NT_KEPT.map(function(d){ return {body:d.body,reply_text:d.reply_text}; }); }
    if($("ntBody")) $("ntBody").innerHTML=genWaitCard(editing?"更新しています…":"保存しています…");
    api("POST","/api/types/save",payload).then(function(r){
      if(r.body&&r.body.ok){ var nm=NT_NAME, up=r.body.updated; ntClearState(); NT_STEP="input"; NT_MAX=0; NT_NAME=""; NT_PROMPT=""; NT_PROMPT_BEFORE=""; NT_DIFF=""; NT_EDIT_ID=null; NT_DRAFTS=[]; NT_KEPT=[]; NT_SEEN=[]; NT_ORIGIN=""; msg("型「"+nm+"」を"+(up?"更新":"採用")+"しました。"+(r.body.kept?("採用サンプル"+r.body.kept+"本を承認＆添削に残しました。"):"")); refreshBadges(); loadNewType(); }
      else { msg((r.body&&r.body.error)||"保存に失敗しました。",false); NT_STEP="finish"; ntRender(); }
    });
  }
  function ntEditType(id){ // 保存済みの型を編集・再トレーニング（採用＝更新になる）
    var t=null; for(var i=0;i<NT_LIST.length;i++){ if(NT_LIST[i].id===id){ t=NT_LIST[i]; break; } }
    if(!t) return;
    NT_EDIT_ID=id; NT_NAME=t.name||""; NT_PROMPT=t.prompt||""; NT_ORIGIN=t.origin||""; NT_PATTERN=t.pattern||"single_short"; NT_IMAGE_TYPE=t.image_type||"none";
    NT_PROMPT_BEFORE=""; NT_DIFF=""; NT_DRAFTS=[]; NT_KEPT=[]; NT_SEEN=[];
    NT_STEP="prompt"; NT_MAX=NT_ORDER.prompt; ntRender();
    try{ window.scrollTo(0,0); }catch(e){}
  }
  function ntUpdateDirect(){ // 編集中：再トレーニングせず、プロンプトの修正だけ保存
    NT_NAME=($("ntName")&&$("ntName").value.trim())||NT_NAME;
    if($("ntPrompt")) NT_PROMPT=$("ntPrompt").value;
    if($("ntPattern")) NT_PATTERN=$("ntPattern").value;
    if($("ntImage")) NT_IMAGE_TYPE=$("ntImage").value;
    if(!(NT_NAME||"").trim()||!(NT_PROMPT||"").trim()){ msg("名前とプロンプトを入れてください。",false); return; }
    if($("ntBody")) $("ntBody").innerHTML=genWaitCard("保存しています…");
    api("POST","/api/types/save",{account:ACC,id:NT_EDIT_ID,name:NT_NAME,prompt:NT_PROMPT,origin:NT_ORIGIN,pattern:NT_PATTERN,image_type:NT_IMAGE_TYPE}).then(function(r){
      if(r.body&&r.body.ok){ var nm=NT_NAME; ntClearState(); NT_STEP="input"; NT_MAX=0; NT_NAME=""; NT_PROMPT=""; NT_PROMPT_BEFORE=""; NT_DIFF=""; NT_EDIT_ID=null; NT_DRAFTS=[]; NT_KEPT=[]; NT_SEEN=[]; NT_ORIGIN=""; msg("型「"+nm+"」を更新しました。"); refreshBadges(); loadNewType(); }
      else { msg((r.body&&r.body.error)||"更新に失敗しました。",false); ntRender(); }
    });
  }
  function ntDelete(id){
    if(!confirm("この型を削除しますか？")) return;
    api("POST","/api/types/delete",{account:ACC,id:id}).then(function(r){ if(r.body&&r.body.ok){ msg("削除しました。"); loadNewType(); } else { msg("削除に失敗しました。",false); } });
  }
  // 分析＆改善：反応データの集計・型別/時間帯別の成績・伸びたポスト・AIの学習を表示。
  function aTile(k,n){ return "<div class='tile'><div class='n'>"+n+"</div><div class='k'>"+k+"</div></div>"; }
  function learnedCard(l){
    l=l||{};
    var ha=(l.hook_affinity||[]).slice(0,3).map(function(x){return esc(x.key);}).filter(Boolean);
    var bh=(l.best_hours||[]).slice(0,3).map(function(x){return esc(x.key)+"時";}).filter(Boolean);
    var lp=l.length_pref, fp=l.format_pref;
    var hasLp=lp&&lp.prefer&&lp.prefer!=="none", hasFp=fp&&fp.prefer&&fp.prefer!=="none";
    var en=l.exec_notes||{}; var enKeys=[]; for(var ek in en){ if(en[ek]&&en[ek].note) enKeys.push(ek); }
    if(!ha.length && !bh.length && !hasLp && !hasFp && !enKeys.length) return "<div class='card note'>反応が安定（各10件以上）すると、AIが効く型・時間帯・長さ・形式を学習。添削を重ねると<b>型ごとの書き方の好み</b>も覚えて生成に反映します。</div>";
    var h="<div class='card'><h3 style='margin-top:0'>AIが学習して効かせていること</h3>";
    if(ha.length) h+="<div>反応が良かった型：<b>"+ha.join("・")+"</b>（優先的に試す）</div>";
    if(bh.length) h+="<div style='margin-top:4px'>反応が良かった時間帯：<b>"+bh.join("・")+"</b></div>";
    if(hasLp) h+="<div style='margin-top:4px'>反応が良い長さ：<b>"+esc(lp.prefer)+"</b></div>";
    if(hasFp) h+="<div style='margin-top:4px'>反応が良い形式：<b>"+(fp.prefer==="連結"?"2ポスト連結":"単発")+"</b></div>";
    if(enKeys.length){
      h+="<div style='margin-top:8px'><div style='font-weight:600'>型ごとの書き方の好み（添削から学習）</div>";
      enKeys.slice(0,8).forEach(function(k){ h+="<div class='note' style='margin-top:3px;line-height:1.5'>・<b>"+esc(k)+"</b>："+esc(en[k].note)+"</div>"; });
      h+="</div>";
    }
    h+="<div class='note' style='margin-top:6px'>これらは次のポスト生成・配信に自動で反映されます。</div></div>";
    return h;
  }
  var ANALYSIS_DAYS=0; // 集計期間（日数。0=全期間）
  var ANALYSIS_CARDS=[]; var ANALYSIS_FOCUS=null; var CARD_OFFSET=0; // 改善カード（常時3枚・手動ローテ）
  function renderCards(){
    var el=$("hintBody"); if(!el) return;
    var html="";
    if(ANALYSIS_FOCUS){ var f=ANALYSIS_FOCUS; html+="<div style='background:var(--accent-bg);border-radius:var(--radius-sm);padding:8px 10px;margin-bottom:8px;font-size:13px'>🎯 いま「<b>"+esc(f.label||f.value)+"</b>」にフォーカス中。<b>次の自動補充サイクル</b>から多めに作ります。　<a onclick='clearFocus()' style='cursor:pointer;color:var(--accent-strong);font-weight:600'>自動に戻す</a></div>"; }
    var cards=ANALYSIS_CARDS||[];
    if(!cards.length){ el.innerHTML=html||"<div class='note'>提案はありません。</div>"; return; }
    var shown=Math.min(3,cards.length);
    for(var k=0;k<shown;k++){
      var idx=(CARD_OFFSET+k)%cards.length; var c=cards[idx];
      var active=ANALYSIS_FOCUS && c.focus && ANALYSIS_FOCUS.dim===c.focus.dim && ANALYSIS_FOCUS.value===c.focus.value;
      var ic=c.tone==='good'?'👍':'💡';
      var btn=active ? "<span style='color:var(--accent-strong);font-weight:700;font-size:13px'>🎯 この指針で回しています</span>"
                     : "<button class='accent' style='padding:5px 14px;font-size:13px' onclick='setFocusByCard("+idx+")'>▶ この指針で回す</button>";
      html+="<div class='hintcard"+(active?" on":"")+"'><div class='hc-text'>"+ic+" "+esc(c.text)+"</div><div style='margin-top:10px'>"+btn+"</div></div>";
    }
    el.innerHTML=html;
  }
  function aiSuggestCards(){
    var btn=$("aiCardBtn"); if(btn){ btn.disabled=true; btn.textContent="AIが考え中…"; }
    api("POST","/api/account/suggest-cards",{account:ACC}).then(function(r){
      if(btn){ btn.disabled=false; btn.textContent="✨ AIに別の指針を考えてもらう"; }
      if(r.body&&r.body.ok&&r.body.cards&&r.body.cards.length){ ANALYSIS_CARDS=r.body.cards; CARD_OFFSET=0; renderCards(); }
      else { msg((r.body&&r.body.error)||"提案を作れませんでした。",false); }
    });
  }
  function setFocusByCard(idx){
    var c=(ANALYSIS_CARDS||[])[idx]; if(!c||!c.focus) return;
    api("POST","/api/account/focus",{account:ACC,focus:c.focus}).then(function(r){
      if(r.body&&r.body.ok){ msg("「"+(c.focus.label||c.focus.value)+"」を指針に設定しました。次の自動補充サイクルから反映されます（自動承認モードで効きます）。"); loadAnalysis(); }
      else { msg((r.body&&r.body.error)||"設定に失敗しました。",false); }
    });
  }
  function clearFocus(){
    api("POST","/api/account/focus",{account:ACC,focus:null}).then(function(r){
      if(r.body&&r.body.ok){ msg("自動（バランス）に戻しました。"); loadAnalysis(); }
      else { msg("解除に失敗しました。",false); }
    });
  }
  function setPeriod(days){
    ANALYSIS_DAYS=days;
    var tabs=document.querySelectorAll("#periodTabs .rtab");
    for(var i=0;i<tabs.length;i++){ tabs[i].classList.toggle("on", parseInt(tabs[i].getAttribute("data-d"),10)===days); }
    loadAnalysis();
  }
  function periodLabel(){ return ANALYSIS_DAYS>0 ? ("過去"+ANALYSIS_DAYS+"日") : "全期間"; }
  // ===== 常設AIチャット（操作サポート） =====
  var CHAT = [];          // {role:"user"|"assistant", content:string}
  var CHAT_BUSY = false;
  try{ CHAT = JSON.parse(localStorage.getItem("sns_chat")||"[]")||[]; }catch(e){ CHAT=[]; }
  function chatSave(){ try{ localStorage.setItem("sns_chat", JSON.stringify(CHAT.slice(-40))); }catch(e){} }
  function chatRender(){
    var log=$("chatLog"); if(!log) return;
    if(!CHAT.length){
      log.innerHTML="<div class='chat-hint'>操作・仕組みについて何でも聞いてください。<br>このアプリの仕様書をもとにAIが答えます。<br><br>例）手動承認から自動投稿に切り替えるには？<br>例）反応の数字が出ないのはなぜ？</div>";
      return;
    }
    var h="";
    for(var i=0;i<CHAT.length;i++){
      var m=CHAT[i]; var cls=(m.role==="user")?"u":"a";
      h+="<div class='chat-msg "+cls+"'>"+esc(m.content)+"</div>";
    }
    if(CHAT_BUSY){ h+="<div class='chat-msg a think'>考えています…</div>"; }
    log.innerHTML=h;
    log.scrollTop=log.scrollHeight;
  }
  function chatOpen(){
    var d=$("chatDock"); if(!d) return;
    d.classList.add("open"); d.setAttribute("aria-hidden","false");
    var f=$("chatFab"); if(f) f.classList.add("hide");
    chatRender();
    var q=$("chatQ"); if(q) setTimeout(function(){ q.focus(); }, 250);
  }
  function chatClose(){
    var d=$("chatDock"); if(d){ d.classList.remove("open"); d.setAttribute("aria-hidden","true"); }
    var f=$("chatFab"); if(f) f.classList.remove("hide");
  }
  function chatClear(){ CHAT=[]; chatSave(); chatRender(); }
  function chatSend(){
    if(CHAT_BUSY) return;
    var ta=$("chatQ"); if(!ta) return;
    var q=(ta.value||"").trim(); if(!q) return;
    ta.value=""; ta.style.height="42px";
    CHAT.push({role:"user",content:q}); chatSave();
    CHAT_BUSY=true; chatRender();
    var hist=CHAT.slice(-12);
    api("POST","/api/help-ask",{account:ACC,question:q,history:hist}).then(function(r){
      CHAT_BUSY=false;
      var ans=(r.body&&r.body.ok)?(r.body.answer||""):((r.body&&r.body.error)||"回答に失敗しました。時間をおいて再度お試しください。");
      CHAT.push({role:"assistant",content:ans}); chatSave(); chatRender();
    }).catch(function(){
      CHAT_BUSY=false;
      CHAT.push({role:"assistant",content:"通信に失敗しました。電波の良い場所で再度お試しください。"}); chatSave(); chatRender();
    });
  }
  // ===== 仲間を招待（リファラル・1人1種類のコード） =====
  var INV = null;
  function invMsg(t, ok){ var m=$("invMsg"); if(!m) return; m.textContent=t||""; m.className="msg "+(ok===false?"ng":"ok"); }
  function loadInvites(){
    var C=$("invCard"); if(C) C.innerHTML="<div class='spin'></div>";
    invMsg("");
    api("GET","/api/invites").then(function(r){
      var b=r.body||{}; INV=b;
      if(!b.ok || !b.code){
        if(b.error==="not_enabled"){
          // 開放されていない → メニューも隠す
          var nv=$("nav-invite"); if(nv) nv.style.display="none";
          try{ localStorage.setItem("sns_invite_enabled","0"); }catch(e){}
          if(C) C.innerHTML="<div class='card'><div class='note' style='color:var(--text)'>この機能は現在ご利用いただけません。</div></div>";
          return;
        }
        var em = b.error==="not_registered" ? "本部との連携がまだ完了していません。先に「アカウント設定」でXとClaudeを連携してください。連携すると、あなた専用の招待コードが発行されます。" :
                 b.error==="honbu_unconfigured" ? "この環境では招待機能は使えません。" :
                 "招待コードを取得できませんでした。時間をおいて再度お試しください。";
        if(C) C.innerHTML="<div class='card'><div class='note' style='color:var(--text)'>"+esc(em)+"</div></div>";
        return;
      }
      renderInvite(b);
    });
  }
  function renderInvite(b){
    var C=$("invCard"); if(!C) return;
    var remaining=(b.remaining!=null?b.remaining:0), maxu=(b.max_uses!=null?b.max_uses:0), used=(b.used!=null?b.used:0);
    var none = remaining<=0;
    var bar = none ? "<span class='pill' style='background:#fdecea;color:var(--danger)'>残り0（使い切りました）</span>"
                   : "<span class='pill' style='background:var(--accent-bg);color:var(--accent-strong)'>残り有効数 "+remaining+" / "+maxu+"</span>";
    var refurl = b.referral_url || "";
    var h="<div class='card' style='background:var(--accent-bg);border-color:#b5d4f4'>"+
      "<div class='note' style='color:var(--text);margin-bottom:4px'>あなた専用の招待コード</div>"+
      "<div style='font-size:26px;font-weight:700;letter-spacing:2px'>"+esc(b.code)+"</div>"+
      "<div style='margin:8px 0 12px'>"+bar+" <span class='note'>（使われた回数 "+used+"）</span></div>";
    if(refurl){
      h+="<label style='margin-top:0'>紹介リンク（これを送るのが一番かんたん）</label>"+
         "<div class='row' style='gap:6px'>"+
           "<input id='invUrl' readonly value='"+esc(refurl)+"' style='flex:1;font-size:13px' onclick='this.select()'>"+
           "<button class='accent' onclick=\\"inviteCopyUrl('"+esc(refurl)+"')\\"><i class='ti ti-link'></i> リンクをコピー</button>"+
         "</div>"+
         "<div class='note' style='margin-top:4px'>このリンクを開くと、相手にはコード入力済みの案内とアプリ作成ボタンが表示されます。</div>";
    }
    h+="<div class='row' style='gap:8px;margin-top:12px'>"+
        "<button class='primary' onclick=\\"inviteCopy('"+esc(b.code)+"')\\"><i class='ti ti-copy'></i> 共有メッセージをコピー</button>"+
        "<button class='soft' onclick=\\"inviteCopyCode('"+esc(b.code)+"')\\"><i class='ti ti-clipboard'></i> コードだけコピー</button>"+
      "</div>"+
      (none?"<div class='note' style='margin-top:10px;color:var(--text)'>招待枠を使い切りました。もっと招待したい場合は運営にご相談ください。</div>":"")+
    "</div>";
    C.innerHTML=h;
  }
  function inviteShareText(code){
    var ref=(INV&&INV.referral_url)||"";
    var lp=(INV&&INV.lp_url)||"https://join.sns-migiude.com";
    var link = ref || lp;
    return "【SNSの右腕】への招待\\n\\nあなたのXの「右腕」になるAIです。あなたの文体を学習して、発信→学習→改善のサイクルまで自動でまわします。\\n\\n▼はじめ方（このリンクを開くだけ）\\n"+link+"\\n\\n招待コード："+code+"\\n（リンクを開くと、コード入力済みの案内とアプリ作成ボタンが出ます）\\n\\n※鍵もデータもあなた自身のCloudflareに保存され、他の人からは見えません。費用はあなた自身のAPI利用分だけです。";
  }
  function inviteClip(text, done, fail){
    try{
      if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(done, fail); }
      else { var ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); done(); }
    }catch(e){ fail(); }
  }
  function inviteCopy(code){
    inviteClip(inviteShareText(code),
      function(){ invMsg("共有メッセージをコピーしました（コード "+code+"）。SNSのDMやメールに貼り付けて送ってください。", true); },
      function(){ invMsg("コピーできませんでした。招待コードは "+code+" です（手動でお伝えください）。", false); });
  }
  function inviteCopyCode(code){
    inviteClip(code,
      function(){ invMsg("招待コードをコピーしました： "+code, true); },
      function(){ invMsg("コピーできませんでした。招待コードは "+code+" です。", false); });
  }
  function inviteCopyUrl(u){
    inviteClip(u,
      function(){ invMsg("紹介リンクをコピーしました。SNSのDMやメールに貼り付けて送ってください。", true); },
      function(){ invMsg("コピーできませんでした。リンク： "+u, false); });
  }
  function collectNow(){
    if(!confirm("いまXからメトリクスをまとめて取得します。\\n\\n💳 Xの読み取りAPIを使うため、取得のたびに料金が発生します（通常は1日1回・自動）。\\n実行しますか？")) return;
    msg("メトリクスを取得しています…（投稿数により数十秒かかることがあります）");
    api("POST","/api/collect-now").then(function(r){
      if(r.body&&r.body.ok){ var mc=(r.body.metrics&&r.body.metrics.length)||0; msg("取得しました（"+mc+"アカウント分）。最新の反応で分析を更新します。"); loadAnalysis(); }
      else { msg("取得に失敗しました。連携状態をご確認ください。",false); }
    });
  }
  function loadAnalysis(){
    if($("analysisBody")) $("analysisBody").innerHTML="<div class='spin'></div>";
    var q = ANALYSIS_DAYS>0 ? ("&days="+ANALYSIS_DAYS) : "";
    api("GET","/api/account/analysis?account="+ACC+q).then(function(r){
      var b=r.body||{};
      if(!b.has_data){
        if($("analysisBody")) $("analysisBody").innerHTML =
          "<div class='card note'>「"+periodLabel()+"」に反応データがありません。期間を広げるか、投稿が増えると表示されます。</div>"
          + learnedCard(b.learned);
        return;
      }
      var s=b.summary||{};
      ANALYSIS=b;
      var h="";
      h+="<div class='card'><h3 style='margin-top:0'>「"+periodLabel()+"」の平均（投稿"+comma(s.posts)+"件）</h3><div class='row' style='gap:12px;flex-wrap:wrap'>";
      h+=aTile("平均インプ", comma(s.avg_impressions));
      h+=aTile("平均いいね", comma(s.avg_likes));
      h+=aTile("平均リポスト", comma(s.avg_reposts));
      h+=aTile("平均反応率", s.avg_er_pct+"%");
      if(s.sum_link_clicks>0) h+=aTile("クリック計", comma(s.sum_link_clicks));
      h+="</div></div>";
      // 改善のヒント（常時3枚のカード＋手動で別案ローテ）
      ANALYSIS_CARDS=b.cards||[]; ANALYSIS_FOCUS=b.focus||null; CARD_OFFSET=0;
      if(ANALYSIS_CARDS.length || ANALYSIS_FOCUS){
        h+="<div class='card' style='border-left:3px solid var(--accent)'><h3 style='margin-top:0'>🎯 次の学習サイクルの指針を選ぶ</h3>";
        var ph=b.learn_phase;
        if(ph){ h+="<div class='note' style='margin:0 0 8px'>学習フェーズ："+(ph==='test'?"<b>テスト期</b>（いろいろな型を試して傾向を集める）":"<b>微調整期</b>（効く型を“書き方”ごと磨く）")+"</div>"; }
        h+="<p class='note' style='margin:0 0 10px'>下のカードから1つ選ぶと、次のサイクルがその方向に寄ります。選ばなければ自動でバランスよく回ります。</p>";
        h+="<div id='hintBody'></div>";
        h+="<div class='row' style='margin-top:8px;gap:8px;align-items:center'><button class='soft' id='aiCardBtn' onclick='aiSuggestCards()'>✨ AIに別の指針を考えてもらう</button><span class='note'>押すたびにAIが新しい3案を出します</span></div>";
        var ins=b.insights||[];
        if(ins.length){ h+="<div class='note' style='margin-top:10px;line-height:1.8'>"; ins.forEach(function(x){ var ic=x.tone==='good'?'👍':x.tone==='bad'?'⚠️':'💡'; h+=ic+" "+esc(x.text)+"<br>"; }); h+="</div>"; }
        h+="<div class='note' style='margin-top:8px'>📌 選んだ指針は<b>自動承認モードの「次の補充サイクル」から</b>反映されます（在庫が減って新しく作られるぶん）。手動承認モードでは効きません（自分で型を選ぶ運用）。<br>「平常比」＝あなたの平均を100%とした相対値（公平に補正済み）。最初の3案はデータからの自動抽出（無料）、上のボタンはAIが毎回新しく考えます（少額のAI料金）。</div></div>";
      }
      var ct="";
      for (var ci=0; ci<CATS.length; ci++){ ct += "<span class='rtab"+(CATS[ci].key===RANK_CAT?" on":"")+"' onclick=\\"rankCat('"+CATS[ci].key+"')\\">"+CATS[ci].label+"</span>"; }
      h+="<div class='card'><h3 style='margin-top:0'>ランキング</h3>"
        + "<div class='row' id='rankCatTabs' style='gap:6px;margin-bottom:8px'>"+ct+"</div>"
        + "<div id='rankBody'></div>"
        + "<div class='note' style='margin-top:8px'>列の見出しをタップで並び替え（もう一度で昇順⇄降順）。反応率＝(いいね＋リポスト＋返信)÷インプの平均。型別・時間帯別は平均値です。</div></div>";
      h+=learnedCard(b.learned);
      if($("analysisBody")){ $("analysisBody").innerHTML=h; renderCards(); renderRankTable(); } // hintBody/rankBody生成後に描画
    });
  }
  // ランキング：3カテゴリ（型別/ポスト別/時間帯別）×全指標の並び替え自由テーブル。
  var ANALYSIS=null; var RANK_CAT="type"; var RANK_SORT={col:"impressions",dir:-1};
  var CATS=[{key:"type",label:"型別"},{key:"post",label:"ポスト別"},{key:"hour",label:"時間帯別"}];
  var RANK_COLS=[
    {key:"impressions",label:"インプ"},{key:"likes",label:"いいね"},{key:"reposts",label:"リポスト"},
    {key:"quotes",label:"引用"},{key:"bookmarks",label:"保存"},{key:"clicks",label:"クリック",dash0:true},{key:"er_pct",label:"反応率",pct:true}
  ];
  function rankCatData(){ if(!ANALYSIS)return []; if(RANK_CAT==="post")return ANALYSIS.by_post||[]; if(RANK_CAT==="hour")return ANALYSIS.by_hour||[]; return ANALYSIS.by_type||[]; }
  function nameLabel(){ return RANK_CAT==="post"?"ポスト":RANK_CAT==="hour"?"時間":"型"; }
  function nameOf(row){ return RANK_CAT==="post"?(esc(row.body)+xLink(row.pid)):RANK_CAT==="hour"?(row.hour+"時台"):esc(row.hook); }
  function sortVal(row,col){
    if(col==="__name"){ if(RANK_CAT==="hour")return row.hour; if(RANK_CAT==="post")return new Date(String(row.posted_at).replace(" ","T")+"Z").getTime(); return row.hook||""; }
    return (row[col]!=null)?row[col]:-1;
  }
  function rankSort(col){ if(RANK_SORT.col===col){ RANK_SORT.dir=-RANK_SORT.dir; } else { RANK_SORT.col=col; RANK_SORT.dir=-1; } renderRankTable(); }
  function rankCat(key){ RANK_CAT=key; if(key==="post" && RANK_SORT.col==="n") RANK_SORT.col="impressions"; var tabs=document.querySelectorAll("#rankCatTabs .rtab"); for(var i=0;i<CATS.length;i++){ if(tabs[i]) tabs[i].classList.toggle("on", CATS[i].key===key); } renderRankTable(); }
  function renderRankTable(){
    var el=$("rankBody"); if(!el) return;
    var data=rankCatData().slice();
    data.sort(function(a,b){ var va=sortVal(a,RANK_SORT.col),vb=sortVal(b,RANK_SORT.col); if(typeof va==="string"){ return RANK_SORT.dir*String(va).localeCompare(String(vb)); } return RANK_SORT.dir*((va<vb?-1:va>vb?1:0)); });
    var cols=[{key:"__name",label:nameLabel()}];
    if(RANK_CAT!=="post") cols.push({key:"n",label:"本数"});
    for(var k=0;k<RANK_COLS.length;k++) cols.push(RANK_COLS[k]);
    var h="<div class='rankwrap'><table class='ranktbl'><tr>";
    cols.forEach(function(c){ var on=c.key===RANK_SORT.col; h+="<th class='"+(on?"on":"")+"' onclick=\\"rankSort('"+c.key+"')\\">"+esc(c.label)+(on?(RANK_SORT.dir<0?" ▼":" ▲"):"")+"</th>"; });
    h+="</tr>";
    if(!data.length){ h+="<tr><td colspan='"+cols.length+"' class='note'>データがありません。</td></tr>"; }
    data.forEach(function(row){
      h+="<tr><td>"+nameOf(row)+"</td>";
      if(RANK_CAT!=="post") h+="<td>"+comma(row.n)+"</td>";
      RANK_COLS.forEach(function(c){ var v=row[c.key]; var cell = (c.dash0 && !v) ? "-" : (c.pct?((v!=null?v:0)+"%"):comma(v||0)); h+="<td>"+cell+"</td>"; });
      h+="</tr>";
    });
    h+="</table></div>";
    el.innerHTML=h;
  }
  // 利用APIコストの目安（実測の利用回数 × 仮の単価）。月別で遡れる。
  var USAGE_MONTH=""; // 表示中の月 "YYYY-MM"（空=今月）
  function curYM(){ var d=new Date(); return d.getUTCFullYear()+"-"+("0"+(d.getUTCMonth()+1)).slice(-2); }
  function shiftYM(ym, delta){ var p=ym.split("-"); var y=+p[0], m=(+p[1]-1)+delta; y+=Math.floor(m/12); m=((m%12)+12)%12; return y+"-"+("0"+(m+1)).slice(-2); }
  function fmtYM(ym){ var p=(ym||"").split("-"); return p.length===2 ? (p[0]+"年"+(+p[1])+"月") : ""; }
  function usageNav(delta){ USAGE_MONTH = shiftYM(USAGE_MONTH||curYM(), delta); loadUsage(); }
  function loadUsage(){
    if ($("usageBody")) $("usageBody").innerHTML = "<div class='spin'></div>";
    if ($("usageForecast")) $("usageForecast").innerHTML = "";
    var q = USAGE_MONTH ? ("&month="+USAGE_MONTH) : "";
    api("GET","/api/account/usage?account="+ACC+q).then(function(r){
      var b=r.body||{}, m=b.month||{}, t=b.total||{}, a=b.assumptions||{};
      USAGE_MONTH = b.month_label || USAGE_MONTH || curYM();
      if ($("usageMonthLabel")) $("usageMonthLabel").textContent = fmtYM(USAGE_MONTH)+(b.is_current?"（今月）":"");
      if ($("usageNextBtn")) $("usageNextBtn").style.visibility = b.can_next ? "visible" : "hidden";
      // 着地予想（今月のみ）
      if ($("usageForecast")){
        $("usageForecast").innerHTML = (b.forecast_jpy!=null)
          ? "<div class='card' style='border-left:3px solid var(--accent)'><div class='note'>今月の着地予想（今のペースのまま進んだ場合）</div><div style='font-size:22px;font-weight:700;color:var(--accent-strong);margin:2px 0'>約 ¥"+comma(b.forecast_jpy)+"</div><div class='note'>"+(b.days_elapsed||0)+"／"+(b.days_in_month||0)+"日の利用から日割りで概算。実際は増減します。</div></div>"
          : "";
      }
      function row(label, cnt, jpy, unit){ return "<tr><td>"+label+"</td><td class='c'>"+comma(cnt||0)+" "+(unit||"回")+"</td><td class='c'>約 ¥"+comma(jpy||0)+"</td></tr>"; }
      function tbl(title, d){
        d=d||{};
        var aiRows="";
        var ams=d.ai_models||[];
        if (ams.length){ for (var i=0;i<ams.length;i++){ aiRows += row(ams[i].label, ams[i].calls, ams[i].jpy); } }
        else { aiRows = row("AI（生成・下準備）", 0, 0); }
        return "<div class='card'><h3 style='margin-top:0'>"+title+"</h3><table class='usage'>"
          + "<tr><td class='note'>項目</td><td class='c note'>回数</td><td class='c note'>目安</td></tr>"
          + row("X 投稿（書き込み）", d.x_posts, d.x_post_jpy)
          + row("X 読み取り（反応の取得）", d.x_reads, d.x_read_jpy)
          + row("過去ポストの学習（読み取り）", d.learn_reads, d.learn_jpy)
          + aiRows
          + "<tr class='sum'><td>合計の目安</td><td></td><td class='c'>約 ¥"+comma(d.total_jpy||0)+"</td></tr>"
          + "</table></div>";
      }
      if ($("usageBody")) $("usageBody").innerHTML = tbl(fmtYM(USAGE_MONTH)+"の目安", m) + tbl("累計の目安（全期間）", t);
      if ($("usageAssume")){
        var ml=(a.ai_models||[]).map(function(x){ return "・"+x.label+"：入力 $"+x.in_usd+"／出力 $"+x.out_usd+"（100万トークンあたり）"; }).join("<br>");
        var fxNote = a.usdjpy_fallback
          ? "為替を取得できなかったため概算 ¥"+(a.usdjpy||0)+" を使用"
          : "1ドル <b>¥"+(a.usdjpy||0)+"</b>"+(a.usdjpy_as_of?("（"+a.usdjpy_as_of+" 時点）"):"")+" で換算";
        $("usageAssume").innerHTML =
          "💱 <b>この為替レートで概算しています：</b>"+fxNote+"<br><br>"
          + "・X 投稿：1件 約 ¥"+(a.x_post_jpy||0)+"（$"+(a.x_post_usd||0)+"）<br>"
          + "・X 読み取り：1件 約 ¥"+(a.x_read_jpy||0)+"（$"+(a.x_read_usd||0)+"）<br>"
          + "・過去ポストの学習も同じ読み取り単価で計算（連携時の100件・再学習ぶん）<br>"
          + "・AI は<b>モデル別に実トークンで計算</b>（雑務はHaiku＝安い／本生成はOpus）：<br>"+ml+"<br>"
          + "・為替は<b>各月の月末時点のレート</b>を取得して換算（当月は最新レート）。<br>"
          + "※ 反応の取得はまとめ取りのことがあり、実際はもっと少ない場合があります（上限寄りの目安）。<br>"
          + "※ AIのトークン記録はこの機能を入れた以降ぶん。それ以前の生成は計上されません。";
      }
    });
  }
  // 開発用：部品カタログの動的部分（チップ・星・連結・折りたたみ・待機）を流し込む。
  function loadUikit(){
    if ($("uikit-chips")) $("uikit-chips").innerHTML = chipGroup("uikit_demo", ["仕事術","マインド","事例"], true);
    if ($("uikit-stars")) $("uikit-stars").innerHTML = "<span class='star on'>★</span><span class='star on'>★</span><span class='star on'>★</span><span class='star on'>★</span><span class='star'>★</span>";
    if ($("uikit-thread")) $("uikit-thread").innerHTML = threadView({ body:"「努力は裏切らない」って言うけど、半分ウソだと思ってる。", reply_text:"正しくは『正しい方向の努力は裏切らない』。方向がズレてたら、頑張るほど遠ざかる。まず確かめるべきはやる量じゃなくて向きの方。" });
    if ($("uikit-clamp")) $("uikit-clamp").innerHTML = bodyHtml("これは長文ポストの例です。".concat("ダミー本文。".repeat(20)));
    if ($("uikit-wait")) $("uikit-wait").innerHTML = genWaitCard();
  }

  var HANDLE=""; // @ユーザー名（Xの投稿リンク生成に使う）。helloで更新
  function hello(){
    api("GET","/api/check?account="+ACC).then(function(r){
      if (r.body && r.body.ok){ HANDLE=r.body.handle||""; $("hello").innerHTML = "こんにちは、<b>@"+esc(r.body.handle)+"</b> さん　フォロワー "+comma(r.body.followers)+"人"; }
      else if (r.status===401){ $("hello").textContent = "合言葉が違うようです。ログアウトして入り直してください。"; }
      else { $("hello").textContent = "アカウントにつながりませんでした。"; }
    });
  }
  // Xの投稿リンク。実ツイートID（数字）のときだけリンク化（ダミーSIM等は出さない）。
  function xLink(pid){
    if (!HANDLE || !pid || !/^\\d+$/.test(String(pid))) return "";
    return " <a class='xbtn' href='https://x.com/"+esc(HANDLE)+"/status/"+esc(String(pid))+"' target='_blank' rel='noopener'><i class=\\"ti ti-brand-x\\"></i> Xで見る</a>";
  }

  // ── 画像カード（会員ごとテーマ＋テーマ内バリアント）──
  var CARD_THEME=null, CARD_PRESETS=[], CARD_FONTS=[];
  function loadCards(){
    var el=$("cardsBody"); if(el) el.innerHTML="<div class='spin'></div>";
    api("GET","/api/account/card-theme?account="+ACC).then(function(r){
      var b=r.body||{}; CARD_THEME=b.theme||{}; CARD_PRESETS=b.presets||[]; CARD_FONTS=b.fonts||[]; renderCards(); cardPreview();
    });
  }
  function cardVal(id){ var e=$(id); return e?e.value:""; }
  function cardSizeOpts(opts, cur){ // 現在値に最も近い選択肢を selected にする
    var best=opts[0][0], bd=1e9; for(var i=0;i<opts.length;i++){ var d=Math.abs(parseInt(opts[i][0],10)-(cur||0)); if(d<bd){ bd=d; best=opts[i][0]; } }
    return opts.map(function(o){ return "<option value='"+o[0]+"'"+(o[0]===best?' selected':'')+">"+o[1]+"</option>"; }).join("");
  }
  function cardThemeFromForm(){
    return { bg:cardVal('cBg'), fg:cardVal('cFg'), accent:cardVal('cAccent'), weight:cardVal('cWeight'), font:(cardVal('cFontFam')||'sans'), handle:cardVal('cHandle'), fontSize:parseInt(cardVal('cFont'),10)||48, logoSize:parseInt(cardVal('cLogoSize'),10)||64, logoKey:(CARD_THEME&&CARD_THEME.logoKey)||'', bgKey:(CARD_THEME&&CARD_THEME.bgKey)||'' };
  }
  function renderCards(){
    var el=$("cardsBody"); if(!el) return; var t=CARD_THEME||{}; var h="";
    h+="<div class='note' id='cardSaveState' style='color:var(--ok);min-height:18px;margin-bottom:6px'></div>";
    h+="<div class='card'><div class='row' style='justify-content:space-between;align-items:center;gap:10px'><div style='min-width:0'><b>画像カードを使う（マスター）</b><div class='note' style='margin-top:2px'>ONで、画像の型を付けた型の投稿にカードが付きます（URL誘導はOGP優先で無し）。<b>ONにすると「型の検索」に画像付きの型（40種）が並び、選べるようになります。</b>変更は<b>自動保存</b>されます。</div></div><label class='switch'><input type='checkbox' id='cardOn' "+(t.on?'checked':'')+" onchange='cardAutoSave()'><span class='slider'></span></label></div></div>";
    h+="<div class='card'><div class='row' style='justify-content:space-between;align-items:center;margin-bottom:8px'><b>プレビュー</b><button class='soft' style='padding:4px 12px;font-size:13px' onclick='cardPreview()'>🔄 更新</button></div><div id='cardPrev' style='text-align:center'><div class='note'>生成中…</div></div></div>";
    h+="<div class='card'><b>プリセット（選んで土台にする）</b><div class='row' style='gap:8px;flex-wrap:wrap;margin-top:8px'>";
    CARD_PRESETS.forEach(function(p){ h+="<button class='soft' style='padding:6px 14px' onclick=\\"cardApplyPreset('"+esc(p.id)+"')\\">"+esc(p.name)+"</button>"; });
    h+="</div></div>";
    h+="<div class='card'><b>カスタム（あなた専用に）</b>";
    h+="<div class='row' style='gap:18px;flex-wrap:wrap;margin-top:10px'>"
      +"<label style='font-size:13px'>背景<br><input type='color' id='cBg' value='"+(t.bg||'#0f1419')+"' onchange='cardAutoSave()'></label>"
      +"<label style='font-size:13px'>文字<br><input type='color' id='cFg' value='"+(t.fg||'#ffffff')+"' onchange='cardAutoSave()'></label>"
      +"<label style='font-size:13px'>アクセント<br><input type='color' id='cAccent' value='"+(t.accent||'#1d9bf0')+"' onchange='cardAutoSave()'></label>"
      +"<label style='font-size:13px'>フォント<br><select id='cFontFam' onchange='cardAutoSave()'>"+CARD_FONTS.map(function(ff){ return "<option value='"+ff.id+"'"+((t.font||'sans')===ff.id?' selected':'')+">"+esc(ff.name)+"</option>"; }).join("")+"</select></label>"
      +"<label style='font-size:13px'>太さ<br><select id='cWeight' onchange='cardAutoSave()'><option value='bold'"+(t.weight!=='regular'?' selected':'')+">太字</option><option value='regular'"+(t.weight==='regular'?' selected':'')+">標準</option></select></label>"
      +"<label style='font-size:13px'>文字サイズ<br><select id='cFont' onchange='cardAutoSave()'>"+cardSizeOpts([['38','小'],['48','中'],['58','大'],['68','特大']], t.fontSize||48)+"</select></label>"
      +"<label style='font-size:13px'>ロゴサイズ<br><select id='cLogoSize' onchange='cardAutoSave()'>"+cardSizeOpts([['48','小'],['72','中'],['104','大'],['140','特大']], t.logoSize||64)+"</select></label>"
      +"</div>";
    h+="<label style='display:block;margin-top:12px'>ハンドル（右下に表示・任意）</label><input id='cHandle' value='"+esc(t.handle||'')+"' placeholder='@yourname' oninput='cardAutoSave()' style='max-width:260px'>";
    h+="<div class='row' style='gap:18px;flex-wrap:wrap;margin-top:14px'>"
      +"<div><div class='note'>ロゴ（左下・任意）"+(t.logoKey?" <span style='color:var(--ok)'>設定済み</span> <a style='cursor:pointer;text-decoration:underline' onclick=\\"cardClearImg('logo')\\">外す</a>":"")+"</div><input type='file' id='cLogo' accept='image/*' onchange=\\"cardUpload('logo')\\"></div>"
      +"<div><div class='note'>背景画像（任意・文字は自動で読みやすく）"+(t.bgKey?" <span style='color:var(--ok)'>設定済み</span> <a style='cursor:pointer;text-decoration:underline' onclick=\\"cardClearImg('bg')\\">外す</a>":"")+"</div><input type='file' id='cBgImg' accept='image/*' onchange=\\"cardUpload('bg')\\"></div>"
      +"</div>";
    h+="<div class='note' style='margin-top:14px'>※設定は変更すると<b>自動保存</b>されます（保存ボタンは不要）。</div>";
    h+="</div>";
    el.innerHTML=h;
  }
  var _cardPrevT=null;
  function cardPreviewDebounced(){ if(_cardPrevT) clearTimeout(_cardPrevT); _cardPrevT=setTimeout(cardPreview,500); }
  function cardPreview(){
    var box=$("cardPrev"); if(!box) return; box.innerHTML="<div class='note'>生成中…</div>";
    var payload=Object.assign({account:ACC, text:"出してから直す。それが全部。", imageType:"oneliner", raw:true, variant:0}, cardThemeFromForm());
    api("POST","/api/account/card-preview",payload).then(function(r){
      var b=r.body||{}; if(b.ok&&b.png){ box.innerHTML="<img src='"+b.png+"' style='max-width:100%;border-radius:10px;border:1px solid var(--border)'>"; }
      else { box.innerHTML="<div class='note' style='color:#c0392b'>"+esc(b.error||"プレビューを作れませんでした。")+"</div>"; }
    });
  }
  function cardApplyPreset(id){
    var p=null; for(var i=0;i<CARD_PRESETS.length;i++){ if(CARD_PRESETS[i].id===id){ p=CARD_PRESETS[i]; break; } }
    if(!p) return;
    if($("cBg")) $("cBg").value=p.bg; if($("cFg")) $("cFg").value=p.fg; if($("cAccent")) $("cAccent").value=p.accent;
    if($("cWeight")) $("cWeight").value=p.weight||'bold';
    if(CARD_THEME) CARD_THEME.preset=p.id;
    cardAutoSave();
  }
  function cardSaved(){ var e=$("cardSaveState"); if(e){ e.textContent="✓ 自動保存しました"; } }
  function cardDoSave(){ // 即時保存（サイレント）
    var on = $("cardOn")?$("cardOn").checked:(CARD_THEME&&CARD_THEME.on);
    var payload=Object.assign({account:ACC, on:on, preset:(CARD_THEME&&CARD_THEME.preset)}, cardThemeFromForm());
    return api("POST","/api/account/card-theme",payload).then(function(r){ if(r.body&&r.body.ok){ CARD_THEME=r.body.theme; cardSaved(); } else { var e=$("cardSaveState"); if(e){ e.textContent="保存できませんでした"; e.style.color="#c0392b"; } } });
  }
  var _cardSaveT=null;
  function cardAutoSave(){ if(_cardSaveT) clearTimeout(_cardSaveT); _cardSaveT=setTimeout(cardDoSave,400); cardPreview(); }
  function cardUpload(kind){
    var inp = kind==='logo'?$("cLogo"):$("cBgImg"); if(!inp||!inp.files||!inp.files[0]) return;
    var f=inp.files[0]; if(f.size>4*1024*1024){ msg("画像は4MBまでにしてください。",false); return; }
    var st=$("cardSaveState"); if(st){ st.textContent="アップロード中…"; st.style.color="var(--muted)"; }
    f.arrayBuffer().then(function(buf){
      return fetch("/api/account/card-upload?account="+encodeURIComponent(ACC)+"&kind="+kind, { method:"POST", headers:{ "Authorization":"Bearer "+token(), "Content-Type":f.type||"image/png" }, body:buf });
    }).then(function(res){ return res.json(); }).then(function(j){
      if(j&&j.ok&&j.key){ if(!CARD_THEME) CARD_THEME={}; if(kind==='logo'){ CARD_THEME.logoKey=j.key; } else { CARD_THEME.bgKey=j.key; } cardDoSave().then(function(){ renderCards(); cardPreview(); }); }
      else { msg((j&&j.error)||"アップロードに失敗しました。",false); }
    }, function(){ msg("アップロードに失敗しました。",false); });
  }
  function cardClearImg(kind){
    if(!CARD_THEME) return; if(kind==='logo'){ CARD_THEME.logoKey=''; } else { CARD_THEME.bgKey=''; }
    var payload=Object.assign({account:ACC}, cardThemeFromForm()); payload[kind==='logo'?'logoKey':'bgKey']='';
    api("POST","/api/account/card-theme",payload).then(function(r){ if(r.body&&r.body.ok){ CARD_THEME=r.body.theme; renderCards(); cardPreview(); cardSaved(); } });
  }
  function loadHome(){
    var el=$("homeBody"); if(el) el.innerHTML="<div class='note'>読み込み中…</div>";
    function safe(p){ return p.then(function(r){return r;},function(){return {body:{}};}); }
    Promise.all([
      safe(api("GET","/api/account/state?account="+ACC)),
      safe(api("GET","/api/status?account="+ACC)),
      safe(api("GET","/api/account/analysis?account="+ACC+"&days=7")),
      safe(api("GET","/api/account/usage?account="+ACC)),
      safe(api("GET","/api/types/list?account="+ACC)),
      safe(api("GET","/api/account/growth?account="+ACC+"&days=30")),
      safe(api("GET","/api/hq/announcements")),
      safe(api("GET","/api/account/cv?account="+ACC)),
      safe(api("GET","/api/types/portfolio?account="+ACC))
    ]).then(function(res){
      renderHome(res[0].body||{}, res[1].body||{}, res[2].body||{}, res[3].body||{}, res[4].body||{}, res[5].body||{}, res[6].body||{}, res[7].body||{}, res[8].body||{});
    });
  }
  function sparkline(vals){ // 数値配列→小さな折れ線グラフ（SVG）。2点以上で描く。
    if(!vals || vals.length<2) return "";
    var w=180,h=44,pad=4;
    var min=Math.min.apply(null,vals), max=Math.max.apply(null,vals), range=(max-min)||1;
    var step=(w-pad*2)/(vals.length-1);
    var pts=vals.map(function(v,i){ var x=pad+i*step; var y=pad+(h-pad*2)*(1-(v-min)/range); return (Math.round(x*10)/10)+","+(Math.round(y*10)/10); }).join(" ");
    var up = vals[vals.length-1]>=vals[0];
    var col = up?"var(--ok)":"var(--danger)";
    return "<svg width='"+w+"' height='"+h+"' viewBox='0 0 "+w+" "+h+"' style='display:block'><polyline points='"+pts+"' fill='none' stroke='"+col+"' stroke-width='2' stroke-linejoin='round' stroke-linecap='round'/></svg>";
  }
  function homeBox(bg,bd,col,html){
    return "<div style='background:"+bg+";border:1px solid "+bd+";border-radius:var(--radius);padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px'>"+html+"</div>";
  }
  function renderHome(s,st,an,us,ty,gw,bc,cv,pf){
    var el=$("homeBody"); if(!el) return;
    gw=gw||{}; bc=bc||{}; cv=cv||{}; pf=pf||{};
    var anns=bc.announcements||[];
    var auto = s.approval_mode==="auto";
    var connected = !!s.connected;
    var pending = s.drafts||0;
    var nextRaw = (st.next_up&&st.next_up[0])?st.next_up[0].not_before:"";
    var nextWhen = nextRaw?fmtJst(nextRaw):"";
    var queued = (st.counts&&st.counts.queued)||0;
    var h="";
    // 本部からのお知らせ（周知）
    if(anns.length){
      h+="<div class='card' style='border-color:#9fe1cb;background:#f1faf6'><div class='row' style='align-items:center;gap:8px;margin-bottom:6px'><i class='ti ti-speakerphone' style='color:var(--ok)'></i><b>本部からのお知らせ</b></div>";
      anns.forEach(function(a,i){
        h+="<div style='"+(i>0?"border-top:1px solid var(--border);padding-top:8px;margin-top:8px":"")+"'><div style='font-weight:500'>"+esc(a.title)+"</div><div class='note' style='white-space:pre-wrap;margin-top:2px'>"+esc(a.body)+"</div></div>";
      });
      h+="</div>";
    }
    // ① 今やること（承認モードで主役が変わる。連携切れは最優先で警告）
    if(!connected){
      h+=homeBox("#fcebeb","#f0c0c0","var(--danger)",
        "<div style='display:flex;align-items:center;gap:12px'><i class='ti ti-alert-triangle' style='font-size:24px;color:var(--danger)'></i><div><div style='font-weight:500;color:var(--danger)'>X・Claudeの連携が確認できません</div><div class='note'>連携しないと下書き作成・投稿ができません</div></div></div>"+
        "<button class='accent' onclick=\\"nav('settings')\\">連携を確認</button>");
    } else if(auto){
      h+=homeBox("#e1f5ee","#9fe1cb","var(--ok)",
        "<div style='display:flex;align-items:center;gap:12px'><i class='ti ti-robot' style='font-size:24px;color:var(--ok)'></i><div><div style='font-weight:500;color:var(--ok)'>AIが自動で回しています</div><div class='note'>承認は不要。次の投稿："+(nextWhen||"調整中")+"</div></div></div>"+
        "<button class='accent' onclick=\\"nav('scheduled')\\">予約済みを見る</button>");
    } else if(pending>0){
      h+=homeBox("var(--accent-bg)","#b5d4f4","var(--accent-strong)",
        "<div style='display:flex;align-items:center;gap:12px'><i class='ti ti-pencil' style='font-size:24px;color:var(--accent-strong)'></i><div><div style='font-weight:500;color:var(--accent-strong)'>確認待ちの下書き "+pending+"件</div><div class='note'>あなたが承認・添削すると投稿予約に入ります</div></div></div>"+
        "<button class='primary' onclick=\\"nav('review')\\">承認＆添削へ</button>");
    } else {
      h+=homeBox("var(--surface)","var(--border)","var(--text)",
        "<div style='display:flex;align-items:center;gap:12px'><i class='ti ti-plus' style='font-size:24px;color:var(--muted)'></i><div><div style='font-weight:500'>下書きはありません</div><div class='note'>新しく作って、承認すると投稿予約に入ります</div></div></div>"+
        "<button class='primary' onclick='generate()'>下書きをつくる</button>"+FEE_NOTE);
    }
    // ② 状態タイル
    h+="<div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px'>";
    h+="<div class='tile'><div class='n'>"+(auto?"自動":"手動")+"</div><div class='k'>承認モード</div></div>";
    h+="<div class='tile'><div class='n' style='font-size:18px'>"+(nextWhen||"予約なし")+"</div><div class='k'>次の投稿</div></div>";
    h+="<div class='tile'><div class='n'>"+queued+"</div><div class='k'>予約済み（本）</div></div>";
    h+="<div class='tile'><div class='n' style='font-size:18px;color:"+(connected?"var(--ok)":"var(--danger)")+"'>"+(connected?"OK":"要対応")+"</div><div class='k'>X・Claude連携</div></div>";
    h+="</div>";
    // ②.5 のび（フォロワー推移グラフ＋反応の数字）
    var fol=gw.followers||{}, tt=gw.totals||{};
    h+="<div class='card' style='margin:0 0 16px'><div class='row' style='justify-content:space-between;align-items:center;margin-bottom:10px'><b>のび（直近30日）</b><a class='note' style='cursor:pointer;text-decoration:underline' onclick=\\"nav('analysis')\\">分析＆改善へ →</a></div>";
    if(gw.has_followers){
      var ch=fol.change;
      var chTxt = (ch==null)?"" : (ch>0?("▲ +"+ch.toLocaleString()):(ch<0?("▼ "+ch.toLocaleString()):"±0"));
      var chCol = (ch>0)?"var(--ok)":((ch<0)?"var(--danger)":"var(--muted)");
      h+="<div style='display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap'>";
      h+="<div><div class='note'>フォロワー</div><div style='font-size:26px;font-weight:500'>"+((fol.current!=null)?fol.current.toLocaleString():"–")+"<span style='font-size:13px;color:"+chCol+";margin-left:8px;font-weight:400'>"+chTxt+(chTxt?"（30日）":"")+"</span></div></div>";
      h+="<div>"+sparkline(fol.series)+"</div>";
      h+="</div>";
    } else {
      h+="<div class='note'>フォロワーの推移は<b>連携した今から毎日1回・自動で記録</b>します。数日たつとここに線が伸びます（過去には遡れません）。</div>";
    }
    h+="<div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-top:12px'>";
    h+="<div class='tile'><div class='n' style='font-size:20px'>"+((tt.likes||0).toLocaleString())+"</div><div class='k'>いいね（30日）</div></div>";
    h+="<div class='tile'><div class='n' style='font-size:20px'>"+((tt.impressions||0).toLocaleString())+"</div><div class='k'>インプ（30日）</div></div>";
    h+="<div class='tile'><div class='n' style='font-size:20px'>"+((tt.reposts||0).toLocaleString())+"</div><div class='k'>リポスト（30日）</div></div>";
    h+="<div class='tile'><div class='n' style='font-size:20px'>"+((tt.posts||0).toLocaleString())+"</div><div class='k'>投稿（30日）</div></div>";
    h+="</div></div>";
    // ②.7 クリック＆CV（誘導の成果・全期間の累計）
    var cvItems=(cv&&cv.items)||[];
    h+="<div class='card' style='margin:0 0 16px'><div class='row' style='justify-content:space-between;align-items:center;margin-bottom:10px'><b>クリック＆CV（誘導の成果）</b><a class='note' style='cursor:pointer;text-decoration:underline' onclick=\\"nav('cv')\\">クリック＆CV解析へ →</a></div>";
    if(!cvItems.length){
      h+="<div class='note'>誘導先URL（LP・申込ページなど）を登録すると、Xからの<b>クリック</b>と、その先の<b>申込・購入（CV）・売上</b>がここに出ます。</div>";
      h+="<div class='row' style='margin-top:8px'><button class='accent' onclick=\\"nav('cv')\\">誘導先URLを登録 →</button></div>";
    } else {
      var tc=0,tcv=0,tval=0;
      cvItems.forEach(function(t){ tc+=t.clicks||0; tcv+=t.conversions||0; tval+=t.value||0; });
      var cvr = tc>0 ? (Math.round((tcv/tc)*1000)/10) : null;
      h+="<div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px'>";
      h+="<div class='tile'><div class='n' style='font-size:20px'>"+tc.toLocaleString()+"</div><div class='k'>クリック</div></div>";
      h+="<div class='tile'><div class='n' style='font-size:20px'>"+tcv.toLocaleString()+"</div><div class='k'>CV（成果）</div></div>";
      h+="<div class='tile'><div class='n' style='font-size:20px'>"+(cvr!=null?(cvr+"%"):"–")+"</div><div class='k'>CVR</div></div>";
      h+="<div class='tile'><div class='n' style='font-size:20px'>"+(tval?("¥"+tval.toLocaleString()):"–")+"</div><div class='k'>売上</div></div>";
      h+="</div>";
      var best=cvItems.slice().sort(function(a,b){return (b.conversions-a.conversions)||(b.clicks-a.clicks);})[0];
      if(best && ((best.clicks||0)||(best.conversions||0))){
        h+="<div class='note' style='margin-top:10px;border-top:1px solid var(--border);padding-top:8px'>一番効いている誘導先：<b>"+esc(best.label||best.title||"")+"</b>（クリック "+(best.clicks||0).toLocaleString()+" ・ CV "+(best.conversions||0).toLocaleString()+(best.value?(" ・ 売上 ¥"+Number(best.value).toLocaleString()):"")+"）</div>";
      } else {
        h+="<div class='note' style='margin-top:8px'>計測リンクを貼ったポストが投稿され、クリックされると数字が入ります。</div>";
      }
    }
    h+="</div>";
    // ②.8 型の成績（今セッションで作った最適化：採用数・学習フェーズ・自動不採用・効いている型）
    var allTypes=((pf.standard||[]).concat(pf.custom||[]));
    var onTypes=allTypes.filter(function(t){return t.on;});
    var scored=onTypes.filter(function(t){return t.score!=null && (t.posts||0)>=1;});
    var topT=scored.slice().sort(function(a,b){return (b.score||0)-(a.score||0);}).slice(0,3);
    var weakT=scored.filter(function(t){return (t.score||1)<0.9;});
    var activeN=(pf.active!=null)?pf.active:onTypes.length;
    var unN=(pf.auto_unadopted||[]).length;
    var autoD=!!pf.auto_demote;
    h+="<div class='card' style='margin:0 0 16px'><div class='row' style='justify-content:space-between;align-items:center;margin-bottom:10px'><b>型の成績（効いている型）</b><a class='note' style='cursor:pointer;text-decoration:underline' onclick=\\"nav('typemanage')\\">型の管理へ →</a></div>";
    h+="<div class='row' style='gap:6px;margin-bottom:10px;flex-wrap:wrap'><span class='pill'>採用 "+activeN+"型</span><span class='pill'>"+(an.learn_phase==='tune'?'微調整期':'テスト期')+"</span><span class='pill' style='"+(autoD?'background:var(--accent-bg);color:var(--accent-strong)':'')+"'>自動不採用 "+(autoD?'ON':'OFF')+"</span>"+(unN?("<span class='pill'>不採用リスト "+unN+"件</span>"):"")+"</div>";
    if(topT.length){
      h+="<div class='note' style='margin-bottom:4px'>効いている型 TOP3（平常比）</div>";
      topT.forEach(function(t,i){ var pct=Math.round(((t.score||1)-1)*100); var pc=pct>=0?'var(--ok)':'#c0392b'; h+="<div class='row' style='justify-content:space-between;align-items:center;padding:5px 0"+(i<topT.length-1?";border-bottom:1px solid var(--border)":"")+";gap:8px'><div style='min-width:0'><b style='font-weight:500'>"+esc(stripPat(t.name||''))+"</b>"+patPill(t.pattern_label||patLabel(t.pattern))+"</div><div class='note' style='white-space:nowrap'><b style='color:"+pc+"'>"+(pct>=0?'+':'')+pct+"%</b> ・ "+(t.posts||0)+"本</div></div>"; });
      if(weakT.length){ h+="<div class='note' style='margin-top:8px;border-top:1px solid var(--border);padding-top:8px'>⚠️ 伸び悩み型 "+weakT.length+"件"+(autoD?"（自動で外れていきます）":"（型の管理で自動不採用をONにすると整理できます）")+"</div>"; }
    } else {
      h+="<div class='note'>型ごとの成績（平常比）は、投稿の反応データが確定するとここに出ます。型の管理で各型の投稿数・スコアが見られます。</div>";
    }
    h+="</div>";
    // ③ コールドスタートのナッジ：まだ自分の型が無い人を「みんなに効く型」へ誘導
    if((ty.types||[]).length===0){
      h+="<div style='background:var(--accent-bg);border:1px solid #b5d4f4;border-radius:var(--radius);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap'><span style='color:var(--accent-strong)'>💡 あなた独自のオリジナルのポストの型を作りませんか？</span><button class='accent' onclick=\\"nav('newtype')\\">型の開発へ →</button></div>";
    }
    // ④⑤ 反応・学習（2カラム）
    h+="<div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-bottom:16px' id='homeMid'>";
    // ③ 反応（分析の要約＋反応の大きいポスト3件。詳細は分析＆改善へ）
    h+="<div class='card' style='margin:0'><div class='row' style='justify-content:space-between;align-items:center;margin-bottom:8px'><b>反応（直近7日）</b><a class='note' style='cursor:pointer;text-decoration:underline' onclick=\\"nav('analysis')\\">分析＆改善へ →</a></div>";
    if(an.has_data){
      var sm=an.summary||{};
      h+="<div class='row' style='gap:18px;margin-bottom:10px'><div><div class='note'>投稿</div><div style='font-size:20px;font-weight:500'>"+(sm.posts||0)+"本</div></div><div><div class='note'>平均インプ</div><div style='font-size:20px;font-weight:500'>"+(sm.avg_impressions||0).toLocaleString()+"</div></div><div><div class='note'>平均反応率</div><div style='font-size:20px;font-weight:500'>"+(sm.avg_er_pct||0)+"%</div></div></div>";
      var top=(an.by_post||[]).slice().sort(function(a,b){return (b.impressions||0)-(a.impressions||0);}).slice(0,3);
      if(top.length){
        h+="<div style='border-top:1px solid var(--border);padding-top:8px'><div class='note' style='margin-bottom:4px'>反応が大きかったポスト</div>";
        top.forEach(function(bp,i){
          var bd=(bp.body||"").replace(/\\n/g,' ');
          h+="<div style='padding:6px 0"+(i<top.length-1?";border-bottom:1px solid var(--border)":"")+"'><div style='font-size:13px'>"+esc(bd.slice(0,50))+(bd.length>50?"…":"")+"</div><div class='note' style='margin-top:2px'>表示 "+(bp.impressions||0).toLocaleString()+" ・ いいね "+(bp.likes||0)+" ・ 反応率 "+(bp.er_pct||0)+"%"+xLink(bp.pid)+"</div></div>";
        });
        h+="</div>";
      }
    } else {
      h+="<div class='note'>📈 反応データは<b>連携した今から蓄積</b>されます。これから投稿したぶんの反応がたまると、ここに伸びたポストが出ます（自動取得・通常1日〜）。過去の投稿には遡れません（Xの仕様）。</div>";
    }
    h+="</div>";
    // ④ AIの学習の今
    var phase = an.learn_phase==="tune" ? "微調整期" : "テスト期";
    var focusLabel = (an.focus&&an.focus.label) ? an.focus.label : "おまかせ（自動）";
    var execN = (an.learned&&an.learned.exec_notes) ? Object.keys(an.learned.exec_notes).length : 0;
    var typeN = (ty.types||[]).length;
    h+="<div class='card' style='margin:0'><div class='row' style='justify-content:space-between;align-items:center;margin-bottom:8px'><b>AIの学習の今</b><a class='note' style='cursor:pointer;text-decoration:underline' onclick=\\"nav('learn')\\">学習＆サイクルへ →</a></div>";
    h+="<div class='row' style='gap:6px;margin-bottom:10px;flex-wrap:wrap'><span class='pill' style='background:var(--accent-bg);color:var(--accent-strong)'>"+phase+"</span><span class='pill'>フォーカス："+esc(focusLabel)+"</span></div>";
    h+="<div class='note' style='line-height:1.9'>ネタ "+(s.neta_count||0)+"件 ・ 文体サンプル "+(s.voice_posts||0)+"件<br>型 "+typeN+"個 ・ 覚えた書き方の好み "+execN+"件</div>";
    h+="</div>";
    h+="</div>"; // end 2col
    // ⑤ コスト（軽く）
    var mj=(us.month&&us.month.total_jpy)||0;
    var fc=(us.forecast_jpy!=null)?us.forecast_jpy:null;
    var fx=(us.assumptions&&us.assumptions.usdjpy)||null;
    h+="<div style='display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--surface);border-radius:var(--radius-sm);padding:12px 16px;margin-bottom:16px;flex-wrap:wrap'>";
    h+="<div class='row' style='gap:22px;align-items:baseline'><div><span class='note'>今月のAPI料金の目安　</span><b style='font-size:18px'>¥"+mj.toLocaleString()+"</b></div>"+(fc!=null?"<div><span class='note'>今月の予想　</span><b style='font-size:18px'>¥"+fc.toLocaleString()+"</b></div>":"")+"</div>";
    h+="<span class='note' style='cursor:pointer;text-decoration:underline' onclick=\\"nav('usage')\\">"+(fx?("1ドル="+fx+"円で概算（あくまで目安）"):"あくまで目安")+" →</span>";
    h+="</div>";
    // ⑥ クイック操作（下書き作成はダッシュボードに出さない：生成はサイクル／承認＆添削で）
    h+="<div class='row' style='gap:10px;flex-wrap:wrap'>";
    h+="<button class='soft' onclick=\\"nav('learn')\\"><i class='ti ti-bulb'></i> ネタを足す</button>";
    h+="<button class='soft' onclick=\\"nav('newtype')\\"><i class='ti ti-wand'></i> 型を開発</button>";
    h+="<button class='soft' onclick=\\"nav('analysis')\\"><i class='ti ti-chart-line'></i> 分析＆改善</button>";
    h+="<button class='soft' onclick=\\"nav('settings')\\"><i class='ti ti-settings'></i> 設定</button>";
    h+="</div>";
    el.innerHTML=h;
  }

  function loadMode(){
    api("GET","/api/account/state?account="+ACC).then(function(r){
      var s=r.body||{};
      var auto = s.approval_mode==="auto";
      var unlocked = !!s.auto_unlocked, pc = s.pass_count||0;
      var tg=$("modeToggle");
      if (tg){
        tg.checked = auto;
        tg.disabled = !unlocked;               // 未解放のときはONにできない
        if (tg.parentNode) tg.parentNode.style.opacity = unlocked?"1":"0.5";
      }
      // 表示はトグルを押すと「どうなるか」＝切り替え先のモード名。
      if ($("modeStateLabel")) $("modeStateLabel").textContent = auto?"手動承認モードに切り替える":"自動承認モードに切り替える";
      IS_AUTO = auto;
      setBadge("review", auto ? 0 : (s.drafts||0)); // 自動承認なら未承認が残ってもバッジは消す
      var n=$("modeNote");
      if (n){ n.innerHTML = unlocked
        ? "オン＝自動承認モード／オフ＝手動承認モード。いつでも切り替えられます。"
        : "🔒 AIのトレーニング（添削＋★5合格）が10本になると自動投稿が使えます（現在 "+pc+"/10本）。"; }
      // 自動承認なら、この画面はやることなし（生成ボタン・一覧を隠して案内を出す）
      if ($("autoNote")) $("autoNote").style.display = auto?"block":"none";
      if ($("reviewActions")) $("reviewActions").style.display = auto?"none":"block";
      if ($("drafts")) $("drafts").style.display = auto?"none":"block";
      CAN_LONGMIX = (!auto && !!s.x_premium);
      IS_PREMIUM = !!s.x_premium; // 長文パターン（単発・長文／連結・短＋長）はPremium限定
      // 型の検索：長文の絞り込み候補は非Premiumでは隠す。
      var tp1=$("tsPatLong1"), tp2=$("tsPatLong2");
      if(tp1){ tp1.hidden=!IS_PREMIUM; tp1.disabled=!IS_PREMIUM; }
      if(tp2){ tp2.hidden=!IS_PREMIUM; tp2.disabled=!IS_PREMIUM; }
      // 型の検索：画像付きの絞り込み候補は画像カードOFFでは隠す。長文の画像はPremiumも必要。
      CARD_ON = !!s.card_on;
      try{
        var imgOpts=document.querySelectorAll(".tsPatImg");
        for(var ii=0; ii<imgOpts.length; ii++){
          var isLong=imgOpts[ii].className.indexOf("tsPatImgLong")>=0;
          var show=CARD_ON && (!isLong || !!s.x_premium);
          imgOpts[ii].hidden=!show; imgOpts[ii].disabled=!show;
        }
        var tsp=$("tsPat"); if(tsp && tsp.selectedIndex>=0 && tsp.options[tsp.selectedIndex] && tsp.options[tsp.selectedIndex].disabled){ tsp.value=""; }
      }catch(e){}
      // URL誘導ポストの解放：ONの人だけ型メニューにオプションを出す。
      URL_UNLOCKED = !!s.url_posts;
      var ou=$("optUrl");
      if (ou){
        ou.hidden=!URL_UNLOCKED; ou.disabled=!URL_UNLOCKED;
        var sel=$("postType");
        if (!URL_UNLOCKED && sel && sel.value===ou.value){ sel.value=""; } // ロック時に選ばれていたら解除
      }
      // 飛ばし先URLの選択肢を、登録済みリンクから作る（DOM APIで安全に）。
      GEN_LINKS = s.link_targets||[];
      var us=$("urlTarget");
      if (us){
        us.innerHTML=""; // 「指定なし」は出さない＝必ず登録済みから選ぶ
        for (var gi=0; gi<GEN_LINKS.length; gi++){ var oo=document.createElement("option"); oo.value=GEN_LINKS[gi].url; oo.textContent=GEN_LINKS[gi].label; us.appendChild(oo); }
      }
      onPostTypeChange(); // 長文トグル/連結注記/URL欄を現在の型選択に合わせて表示
      reviewCharLimit = s.char_limit||140;
    });
    // オリジナル型を型メニューに追加（⭐つき・value＝プロンプト）。
    api("GET","/api/types/list?account="+ACC).then(function(rr){
      var ts=(rr.body&&rr.body.types)||[]; var sel=$("postType"); if(!sel) return;
      var old=sel.querySelectorAll("option[data-custom]"); for(var i=0;i<old.length;i++) old[i].parentNode.removeChild(old[i]);
      ts.forEach(function(t){ var o=document.createElement("option"); o.value=t.prompt; o.textContent="⭐ "+t.name; o.setAttribute("data-custom","1"); sel.appendChild(o); });
    });
  }
  function setMode(){
    var on=$("modeToggle")?$("modeToggle").checked:false;
    var mode=on?"auto":"queue";
    api("POST","/api/account/update",{ account:ACC, approval_mode:mode }).then(function(r){
      if (r.body&&r.body.ok){ msg(on?"自動承認モードに切り替えました。":"手動承認モードに切り替えました。"); loadMode(); }
      else { msg((r.body&&r.body.error)||"切り替えできませんでした。",false); loadMode(); } // loadModeが実状態に戻す
    });
  }

  function generate(){
    var sel=$("postType");
    var opt=(sel && sel.selectedIndex>=0)?sel.options[sel.selectedIndex]:null;
    var body = {account:ACC,count:5};
    if (isUrlType(sel)){
      // URL誘導は飛ばし先必須。指示文（運営資産）はサーバが組み立てる。clientは会員のリンクデータ＋型ラベルだけ渡す。
      if (!GEN_LINKS || !GEN_LINKS.length){ msg("飛ばし先URLが未登録です。「クリック＆CV解析」で登録してください。",false); nav("cv"); return; }
      var u=$("urlTarget")?$("urlTarget").value.trim():"";
      if (!u){ msg("飛ばし先URLを選んでください。",false); return; }
      var ln=null; for (var li=0; li<GEN_LINKS.length; li++){ if(GEN_LINKS[li].url===u){ ln=GEN_LINKS[li]; break; } }
      var urlCode=(ln&&ln.code)||"";
      var postUrl=urlCode ? (location.origin+"/r?a="+encodeURIComponent(ACC)+"&c="+encodeURIComponent(urlCode)) : u;
      var stSel=$("urlStyle"); var styleLabel=stSel?stSel.value:"";
      body.url_post=true;
      body.url_style=styleLabel;                 // ラベルのみ（角度＝指示文はサーバがパックから解決）
      body.post_url=postUrl;
      if (ln){ if(ln.title) body.url_title=ln.title; var de=ln.desc||ln.note||""; if(de) body.url_desc=de; }
      if (urlCode){ body.link_code=urlCode; body.url=u; }
      if (styleLabel) body.type_label="🔗 URL誘導・"+styleLabel;
    } else if (opt && opt.getAttribute("data-key")){
      // base型：型キーを送り、指示文はサーバがパックから解決（公開リポにIPを出さない）。
      body.type_key=sel.value;
      body.type_label=opt.text;
    } else if (sel && sel.value){
      // ⭐自作型：会員自身のプロンプトをそのまま指示に使う（会員のもの）。
      body.instructions=sel.value;
      body.type_label=opt?opt.text:"";
    }
    var lm=$("longMix"), row=$("longMixRow");
    if (lm && row && row.style.display!=="none"){ body.long_mix = lm.checked; }
    if ($("reviewActions")) $("reviewActions").style.display="none";
    if ($("drafts")) $("drafts").innerHTML = genWaitCard(); // 全画面待機
    msg("");
    api("POST","/api/account/sample",body).then(function(r){
      var made=(r.body&&r.body.made)||0;
      msg(made>0?(made+"件の下書きができました。"):"うまく作れませんでした。もう一度お試しください。", made>0);
      nav("review");
    });
  }

  function loadDrafts(){
    api("GET","/api/pending?account="+ACC).then(function(r){
      DRAFTS = (r.body&&r.body.pending)||[]; EDIT_ID=null; renderDrafts(); setBadge("review", IS_AUTO ? 0 : DRAFTS.length);
    });
  }
  function reviewStars(id){
    var s=""; for (var n=1;n<=5;n++){ s += "<span class='star' onmouseover='tStarHover("+id+","+n+")' onmouseout='tStarHover("+id+",0)' onclick='rateDraft("+id+","+n+")'>★</span>"; }
    return s;
  }
  function rateDraft(id,n){
    api("POST","/api/posts/"+id+"/rate",{rating:n}).then(function(r){
      if(r.body&&r.body.ok){ msg(n===5?"★5 採用！（投稿を予約）":("★"+n+" 不採用（AIが学びます）。")); loadDrafts(); refreshBadges(); }
      else { msg((r.body&&r.body.error)||"評価に失敗しました。",false); }
    });
  }
  function renderDrafts(){
    var el=$("drafts");
    if (!DRAFTS.length){ el.innerHTML="<p class='note'>いま確認待ちの下書きはありません。「下書きをつくる」を押してみてください。</p>"; return; }
    var html="";
    for (var i=0;i<DRAFTS.length;i++){
      var p=DRAFTS[i];
      html += "<div class='card draft'>";
      if (p.id===EDIT_ID){
        if (p.reply_text){ html += "<div class='tw-h' style='margin-bottom:4px'>① 1本目（ここだけがタイムラインに出る）</div>"; }
        html += "<textarea id='edit-"+p.id+"' maxlength='"+reviewCharLimit+"' oninput='edCount("+p.id+")'>"+esc(p.body)+"</textarea>";
        html += "<div class='note' style='margin-top:2px'><span id='edc-"+p.id+"'>"+jLen(p.body||"")+"</span> / "+reviewCharLimit+" 字"+(reviewCharLimit>140?"（Premium）":"")+"</div>";
        if (p.reply_text){ html += replyBlock("redit-"+p.id, p.reply_text, reviewCharLimit); }
        html += "<div class='row' style='margin-top:10px'><button class='primary' onclick='saveEdit("+p.id+")'>この内容で投稿</button><button class='soft' onclick='cancelEdit()'>やめる</button></div>";
      } else {
        html += hookLabelHtml(p.hook);
        html += threadView(p);
        html += "<div class='row' style='margin-top:10px;gap:16px;flex-wrap:wrap;align-items:center'>";
        html += "<button class='accent' onclick='startEdit("+p.id+")'><i class=\\"ti ti-pencil\\"></i> 添削して投稿</button>";
        html += "<span style='display:inline-flex;align-items:center;gap:6px'><span class='note'>評価して投稿：</span><span class='stars' id='st"+p.id+"'>"+reviewStars(p.id)+"</span></span>";
        html += "</div>";
        html += "<div class='note' style='margin-top:4px;font-size:11px'>★5＝採用して投稿 ／ ★4以下＝不採用（どちらもAIが学びます）</div>";
      }
      html += "</div>";
    }
    el.innerHTML=html;
  }
  function startEdit(id){ EDIT_ID=id; renderDrafts(); }
  function cancelEdit(){ EDIT_ID=null; renderDrafts(); }
  function edCount(id){ var t=$("edit-"+id),c=$("edc-"+id); if(!t||!c) return; var n=jLen(t.value); c.textContent=n; c.parentNode.style.color=(n>=reviewCharLimit)?"#c0392b":"var(--muted)"; }
  function saveEdit(id){
    var v=$("edit-"+id).value;
    if (!v.trim()){ msg("本文が空です。",false); return; }
    if (v.length>reviewCharLimit){ msg(reviewCharLimit+"文字以内にしてください。",false); return; }
    var rv=replyVal("redit-"+id);
    if (rv!==undefined && rv.length>reviewCharLimit){ msg("2本目も"+reviewCharLimit+"文字以内にしてください。",false); return; }
    var payload={ body:v }; if (rv!==undefined){ payload.reply_text=rv; }
    api("POST","/api/posts/"+id+"/edit-approve",payload).then(function(r){
      if (r.body&&r.body.approved){ msg("添削して投稿予約しました。この文章はAIの学習にも使われます。"); loadDrafts(); }
      else if (r.body&&r.body.unchanged){ msg(r.body.error||"少し直してください。",false); }
      else { msg((r.body&&r.body.error)||"うまくいきませんでした",false); }
    });
  }
  function approve(id){
    if (!confirm("この下書きを投稿しますか？\\n「はい」を押すと、次の配信時間にXへ投稿されます。")) return;
    api("POST","/api/posts/"+id+"/approve").then(function(r){
      if (r.body&&r.body.approved){ msg("投稿を予約しました。"); loadDrafts(); }
      else { msg((r.body&&r.body.error)||"うまくいきませんでした",false); }
    });
  }
  function reject(id){
    api("POST","/api/posts/"+id+"/reject").then(function(r){
      if (r.body&&r.body.rejected){ msg("見送りました。"); loadDrafts(); }
      else { msg((r.body&&r.body.error)||"うまくいきませんでした",false); }
    });
  }

  function fmtJst(utc){
    if(!utc) return "";
    var d=new Date(String(utc).replace(" ","T")+"Z"); if(isNaN(d.getTime())) return "";
    var j=new Date(d.getTime()+9*3600000); var p=function(n){return ("0"+n).slice(-2);};
    return (j.getUTCMonth()+1)+"/"+j.getUTCDate()+" "+p(j.getUTCHours())+":"+p(j.getUTCMinutes());
  }
  // UTC文字列 → datetime-local用 "YYYY-MM-DDTHH:MM"（JST）
  function toLocalInput(utc){
    if(!utc) return "";
    var d=new Date(String(utc).replace(" ","T")+"Z"); if(isNaN(d.getTime())) return "";
    var j=new Date(d.getTime()+9*3600000); var p=function(n){return ("0"+n).slice(-2);};
    return j.getUTCFullYear()+"-"+p(j.getUTCMonth()+1)+"-"+p(j.getUTCDate())+"T"+p(j.getUTCHours())+":"+p(j.getUTCMinutes());
  }
  // X基準の厳密な文字数。全角(日本語・絵文字)=2・半角=1・URL=23。「140字」の単位＝X重み/2の切り上げ（X上限280重み＝日本語140字）。
  function xWeight(t){ t=t||""; var w=0; var urls=t.match(/https?:\\/\\/\\S+/g)||[]; for(var u=0;u<urls.length;u++){ w+=23; t=t.replace(urls[u],""); } var a=Array.from(t); for(var i=0;i<a.length;i++){ var cp=a[i].codePointAt(0); var wide=(cp>=0x1100&&cp<=0x11ff)||(cp>=0x2e80&&cp<=0x9fff)||(cp>=0xa960&&cp<=0xa97f)||(cp>=0xac00&&cp<=0xd7ff)||(cp>=0xf900&&cp<=0xfaff)||(cp>=0xfe30&&cp<=0xfe4f)||(cp>=0xff00&&cp<=0xff60)||(cp>=0xffe0&&cp<=0xffe6)||(cp>=0x1f000&&cp<=0x1ffff)||(cp>=0x20000&&cp<=0x3fffd); w+=wide?2:1; } return w; }
  function jLen(t){ return Math.ceil(xWeight(t)/2); } // 日本語換算の文字数（X厳密）
  function postLenNote(t,lim){ var n=jLen(t); var over=lim&&n>lim; return "<div class='note' style='font-size:11px;text-align:right;margin-top:2px"+(over?";color:#c0392b;font-weight:600":"")+"'>"+n+(lim?(" / "+lim):"")+"字"+(over?" ⚠️超過":"")+"</div>"; }
  var bdSeq=0;
  function bodyHtml(body){
    body = body||"";
    if (jLen(body)<=140) return "<pre>"+esc(body)+"</pre>";
    var id="bd"+(bdSeq++);
    return "<pre class='clamp' id='"+id+"'>"+esc(body)+"</pre><button class='soft' style='margin-top:4px' onclick='toggleBody(\\""+id+"\\",this)'>続きを見る（"+jLen(body)+"字）</button>";
  }
  function toggleBody(id,btn){ var e=$(id); if(!e) return; var open=e.classList.toggle("open"); btn.textContent = open?"閉じる":"続きを見る"; }
  // 2ポスト連結を階層表示（1本目→2本目）。各ポストにX基準の文字数を表示。連結でなければ本文だけ＋文字数。
  function threadView(p){
    if (!p.reply_text){ return bodyHtml(p.body)+postLenNote(p.body, reviewCharLimit); }
    return "<div class='thread'>"
      + "<div class='tw'><div class='tw-h'>① 1本目（ここだけがタイムラインに出る）</div>"+bodyHtml(p.body)+postLenNote(p.body,140)+"</div>"
      + "<div class='tw-conn'></div>"
      + "<div class='tw'><div class='tw-h'>🧵 ② 2本目（1本目へのリプ）</div>"+bodyHtml(p.reply_text)+postLenNote(p.reply_text, reviewCharLimit)+"</div>"
      + "</div>";
  }
  // 汎用の文字数カウンタ（textareaのmaxlengthを見て上限色を出す）
  function cnt(id){ var t=$(id), c=$(id+"c"); if(!t||!c) return; var mx=parseInt(t.getAttribute("maxlength"),10)||140; var n=jLen(t.value); c.textContent=n; c.parentNode.style.color=(n>=mx)?"#c0392b":"var(--muted)"; }
  // 編集フォームの「2本目」入力ブロック（連結ポストのときだけ出す）
  function replyBlock(rid, val, limit){
    val = val||"";
    return "<div class='tw-h' style='margin:12px 0 4px'>🧵 2本目（1本目につながるポスト）</div>"
      + "<textarea id='"+rid+"' maxlength='"+limit+"' oninput='cnt(\\""+rid+"\\")' style='min-height:90px'>"+esc(val)+"</textarea>"
      + "<div class='note' style='margin-top:2px'><span id='"+rid+"c'>"+jLen(val)+"</span> / "+limit+" 字</div>";
  }
  function replyVal(rid){ var t=$(rid); return t?t.value:undefined; }
  var curSlots=[]; var curFreq=3;
  // 1日の本数ごとの「基本の配信タイミング」プリセット（サーバの SLOT_PRESETS と一致）。
  function slotPreset(n){
    var P={1:["12:00"],2:["08:00","20:00"],3:["07:30","12:30","21:00"],4:["06:30","11:30","17:00","21:00"],5:["07:00","11:00","14:30","18:00","21:30"]};
    return P[Math.max(1,Math.min(5,n))]||P[4];
  }
  function renderSlotInputs(usePreset){
    var n=curFreq, h="";
    // 保存スロットが本数と一致する時だけそれを使う。違う（本数を変えた直後など）or 明示的に「おすすめに戻す」ならプリセット。
    var base = (!usePreset && curSlots && curSlots.length===n) ? curSlots : slotPreset(n);
    for (var i=0;i<n;i++){
      var v=base[i]||"12:00";
      h+="<div class='row' style='align-items:center;gap:8px;margin-bottom:6px'><span class='note' style='width:60px'>"+(i+1)+"本目</span><input type='time' id='sl"+i+"' value='"+v+"'></div>";
    }
    if ($("slotInputs")) $("slotInputs").innerHTML=h;
    if ($("freqLabel")) $("freqLabel").textContent = n+"本";
  }
  function resetSlots(){ renderSlotInputs(true); msg("おすすめの時間に戻しました。よければ「保存」してください。"); }
  var schedBodies={}; var schedReplies={}; var schedImg={}; var schedLimit=140;
  function schedTab(which){
    ["queued","posted"].forEach(function(t){
      var pane=$("scpane-"+t); if(pane) pane.classList.toggle("hidden", t!==which);
      var tab=$("sctab-"+t); if(tab) tab.classList.toggle("on", t===which);
    });
  }
  function postedStat(label,val){
    return "<div style='min-width:54px'><div class='note' style='font-size:11px'>"+esc(label)+"</div><div style='font-size:16px;font-weight:600'>"+(val==null?"–":comma(val))+"</div></div>";
  }
  function loadScheduled(){
    api("GET","/api/status?account="+ACC).then(function(r){
      var q=(r.body&&r.body.next_up)||[]; var po=(r.body&&r.body.recently_posted)||[];
      curSlots=(r.body&&r.body.post_slots)||[];
      curFreq=(r.body&&r.body.daily_frequency)||3;
      schedLimit=(r.body&&r.body.char_limit)||140;
      schedBodies={}; schedReplies={}; schedImg={};
      renderSlotInputs();
      $("queued").innerHTML = q.length ? q.map(function(p,i){
        schedBodies[p.id]=p.body||""; schedReplies[p.id]=p.reply_text||"";
        var h="<div class='card' id='qc"+p.id+"'>"+hookLabelHtml(p.hook)+threadView(p);
        if(p.image_type){ schedImg[p.id]=p.image_type; h+="<div style='margin-top:6px'><button class='soft' style='padding:3px 12px;font-size:13px' onclick='schedCard("+p.id+")'>🖼 付く画像カードを見る</button><span class='note' style='margin-left:8px;opacity:.85'>💳 表示にAI要約の少額API料金</span><div id='schedCardPrev"+p.id+"' style='margin-top:6px'></div></div>"; }
        h+="<div class='row' style='align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px'>";
        h+="<span class='note'>📅</span><input type='datetime-local' id='sch"+p.id+"' value='"+toLocalInput(p.not_before)+"' onchange='saveSchedule("+p.id+")' style='width:auto'>";
        h+="<button class='soft' onclick='movePost("+p.id+",\\"up\\")' "+(i===0?"disabled":"")+">↑</button>";
        h+="<button class='soft' onclick='movePost("+p.id+",\\"down\\")' "+(i===q.length-1?"disabled":"")+">↓</button>";
        h+="<button class='accent' onclick='editScheduled("+p.id+")'>✏️ 編集</button>";
        h+="<button class='soft' onclick='toDraft("+p.id+")'>下書きへ</button>";
        h+="<button class='soft' onclick='delScheduled("+p.id+")'>削除</button>";
        h+="</div></div>";
        return h;
      }).join("") : "<p class='note'>予約済みはありません。</p>";
      if($("qCount")) $("qCount").textContent = q.length?("("+q.length+")"):"";
      if($("pCount")) $("pCount").textContent = po.length?("("+po.length+")"):"";
      var cInfo=$("cycleInfo"); var cd=r.body&&r.body.cycle_day, ct=r.body&&r.body.cycle_days;
      if(cInfo){
        if(ct){
          var started=r.body&&r.body.cycle_started;
          cInfo.innerHTML="<b><i class='ti ti-refresh'></i> 学習サイクル："+ct+"日サイクルの "+(started?(cd+"日目"):"開始前")+"</b><div class='note' style='margin-top:3px;color:var(--text)'>"+ct+"日ごとのサイクル切替で学習し直し、未投稿の予約を最新の傾向で作り直します。サイクルの途中で在庫が1日分を切ったら、そのサイクルの学習のまま補充します（学習は据え置き＝同じサイクルの傾向で揃えます）。在庫の上限は「1日の本数 × "+ct+"日」です。</div>";
          cInfo.style.display="block";
        } else { cInfo.style.display="none"; }
      }
      $("posted").innerHTML = po.length ? po.map(function(p){
        var t=fmtJst(p.posted_at);
        var h="<div class='card'>";
        h+="<div class='row' style='justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px'>";
        h+="<span class='note'><i class='ti ti-calendar-check'></i> "+(t?t+" に投稿":"投稿済み")+"</span>";
        h+="<span>"+xLink(p.platform_post_id)+"</span>";
        h+="</div>";
        h+=hookLabelHtml(p.hook);
        h+=threadView(p);
        var hasM = (p.impressions!=null)||(p.likes!=null)||(p.reposts!=null);
        if(hasM){
          h+="<div class='row' style='gap:16px;margin-top:8px;border-top:1px solid var(--border);padding-top:8px'>";
          h+=postedStat("表示",p.impressions)+postedStat("いいね",p.likes)+postedStat("リポスト",p.reposts)+postedStat("返信",p.replies);
          h+="</div>";
        } else {
          h+="<div class='note' style='margin-top:8px;border-top:1px solid var(--border);padding-top:8px'>反応はまだ集計されていません（毎日自動で集計されます）。</div>";
        }
        h+="</div>";
        return h;
      }).join("") : "<p class='note'>まだ投稿はありません。投稿が出ると、ここに反応とあわせて並びます。</p>";
      var fa=(r.body&&r.body.failed)||[];
      if ($("failedWrap")) $("failedWrap").style.display = fa.length?"block":"none";
      if ($("failed")) $("failed").innerHTML = fa.map(function(p){
        schedBodies[p.id]=p.body||""; schedReplies[p.id]=p.reply_text||"";
        return "<div class='card' id='nac"+p.id+"' style='border-left:3px solid #c0392b'>"+threadView(p)+"<div class='note' style='color:#c0392b;margin-top:6px'>エラー："+esc(p.error||"投稿に失敗しました")+"</div><div class='row' style='gap:8px;margin-top:8px'><button class='accent' onclick='editPromote("+p.id+")'>✏️ 直して再予約</button><button class='soft' onclick='delScheduled("+p.id+")'>削除</button></div></div>";
      }).join("");
      var na=(r.body&&r.body.not_adopted)||[];
      if ($("notAdopted")) $("notAdopted").innerHTML = na.length ? na.map(function(p){
        schedBodies[p.id]=p.body||""; schedReplies[p.id]=p.reply_text||"";
        return "<div class='card' id='nac"+p.id+"'>"+threadView(p)+"<div class='row' style='align-items:center;gap:8px;margin-top:8px'><span class='note'>"+(p.rating?("★"+p.rating+"で不採用"):"不採用")+"</span><button class='accent' onclick='editPromote("+p.id+")'>✏️ このポストを添削して採用に昇格</button></div></div>";
      }).join("") : "<p class='note'>まだありません。</p>";
    });
  }
  // 予約ポストに付く画像カードを、その場で描いて見せる（実投稿と同じく本文→カード化）。
  function schedCard(id){
    var box=$("schedCardPrev"+id); if(!box) return;
    var it=schedImg[id]; if(!it){ box.innerHTML="<div class='note'>この型は画像なしです。</div>"; return; }
    var body=schedBodies[id]||""; var rep=schedReplies[id]||"";
    var text = (rep && rep.trim()) ? (body+"\\n"+rep) : body; // 連結は1本目＋2本目を要約ソースに（実投稿と同じ）
    box.innerHTML="<div class='note'>🖼 カード生成中…（本文から作成）</div>";
    api("POST","/api/account/card-preview",{account:ACC,imageType:it,text:text}).then(function(r){
      var b=r.body||{};
      if(b.ok&&b.png){ box.innerHTML="<img src='"+b.png+"' style='max-width:100%;border-radius:10px;border:1px solid var(--border)'>"; }
      else { box.innerHTML="<div class='note' style='color:#c0392b'>"+esc(b.error||"カードを作れませんでした")+"</div>"; }
    });
  }
  function saveSlots(reflow){
    var n=curFreq, slots=[];
    for (var i=0;i<n;i++){ var v=$("sl"+i)?$("sl"+i).value:""; if(/^\\d{1,2}:\\d{2}$/.test(v)) slots.push(v); }
    if(slots.length<n){ msg("すべての時刻を入れてください。",false); return; }
    msg("保存しています…");
    api("POST","/api/account/slots",{account:ACC,slots:slots,daily_frequency:n,reflow:!!reflow}).then(function(r){
      if(r.body&&r.body.ok){ msg(reflow?"保存し、予約を組み直しました。":"保存しました（次の予約から反映）。"); loadScheduled(); }
      else { msg((r.body&&r.body.error)||"保存に失敗しました。",false); }
    });
  }
  function saveSchedule(id){
    var v=$("sch"+id).value; if(!v){ return; }
    api("POST","/api/posts/"+id+"/schedule",{not_before:v}).then(function(r){
      if(r.body&&r.body.ok){ msg("投稿日時を変更しました。"); loadScheduled(); }
      else { msg((r.body&&r.body.error)||"変更に失敗しました。",false); }
    });
  }
  function movePost(id,dir){ api("POST","/api/posts/"+id+"/move",{dir:dir}).then(function(){ loadScheduled(); }); }
  function editPromote(id){
    var card=$("nac"+id); if(!card) return;
    var body=schedBodies[id]||""; var reply=schedReplies[id]||"";
    var h="<div class='note' style='margin-bottom:4px'>添削して採用に昇格します。あなたの言葉に直してください（直した文章はAIの学習にもなります）。</div>";
    if (reply){ h+="<div class='tw-h' style='margin-bottom:4px'>① 1本目（ここだけがタイムラインに出る）</div>"; }
    h+="<textarea id='qed"+id+"' maxlength='"+schedLimit+"' oninput='qedCount("+id+")' style='min-height:120px'></textarea>";
    h+="<div class='note' style='margin-top:2px'><span id='qedc"+id+"'>0</span> / "+schedLimit+" 文字</div>";
    if (reply){ h+=replyBlock("qred"+id, reply, schedLimit); }
    h+="<div class='row' style='margin-top:8px'><button class='primary' onclick='savePromote("+id+")'>添削して採用（投稿予約）</button><button class='soft' onclick='loadScheduled()'>やめる</button></div>";
    card.innerHTML=h; $("qed"+id).value=body; qedCount(id); $("qed"+id).focus();
  }
  function savePromote(id){
    var body=$("qed"+id).value.trim();
    if(!body){ msg("本文が空です。",false); return; }
    if(body.length>schedLimit){ msg(schedLimit+"文字以内にしてください。",false); return; }
    var rv=replyVal("qred"+id);
    if(rv!==undefined && rv.length>schedLimit){ msg("2本目も"+schedLimit+"文字以内にしてください。",false); return; }
    msg("保存しています…");
    var payload={body:body}; if(rv!==undefined){ payload.reply_text=rv; }
    api("POST","/api/posts/"+id+"/edit-approve",payload).then(function(r){
      if(r.body&&r.body.ok){ msg("添削して採用しました（投稿を予約）。"); loadScheduled(); }
      else if(r.body&&r.body.unchanged){ msg(r.body.error||"少し直してから昇格してください。",false); }
      else { msg((r.body&&r.body.error)||"失敗しました。",false); }
    });
  }
  function editScheduled(id){
    var card=$("qc"+id); if(!card) return;
    var body=schedBodies[id]||""; var reply=schedReplies[id]||"";
    var h="";
    if (reply){ h+="<div class='tw-h' style='margin-bottom:4px'>① 1本目（ここだけがタイムラインに出る）</div>"; }
    h+="<textarea id='qed"+id+"' maxlength='"+schedLimit+"' oninput='qedCount("+id+")' style='min-height:120px'></textarea>";
    h+="<div class='note' style='margin-top:2px'><span id='qedc"+id+"'>0</span> / "+schedLimit+" 文字</div>";
    if (reply){ h+=replyBlock("qred"+id, reply, schedLimit); }
    h+="<div class='row' style='margin-top:8px'><button class='primary' onclick='saveScheduledEdit("+id+")'>保存</button><button class='soft' onclick='loadScheduled()'>やめる</button></div>";
    card.innerHTML=h; $("qed"+id).value=body; qedCount(id); $("qed"+id).focus();
  }
  function qedCount(id){ var t=$("qed"+id),c=$("qedc"+id); if(!t||!c) return; var n=jLen(t.value); c.textContent=n; c.parentNode.style.color=(n>=schedLimit)?"#c0392b":"var(--muted)"; }
  function saveScheduledEdit(id){
    var body=$("qed"+id).value.trim();
    if(!body){ msg("本文が空です。",false); return; }
    if(body.length>schedLimit){ msg(schedLimit+"文字以内にしてください。",false); return; }
    var rv=replyVal("qred"+id);
    if(rv!==undefined && rv.length>schedLimit){ msg("2本目も"+schedLimit+"文字以内にしてください。",false); return; }
    msg("保存しています…");
    var payload={body:body}; if(rv!==undefined){ payload.reply_text=rv; }
    api("POST","/api/posts/"+id+"/edit-body",payload).then(function(r){
      if(r.body&&r.body.ok){ msg("ポストを更新しました。"); loadScheduled(); }
      else { msg((r.body&&r.body.error)||"保存に失敗しました。",false); }
    });
  }
  function toDraft(id){ api("POST","/api/posts/"+id+"/to-draft").then(function(r){ if(r.body&&r.body.ok){ msg("下書き（承認待ち）に戻しました。"); loadScheduled(); } }); }
  function delScheduled(id){ if(!confirm("この予約ポストを削除しますか？")) return; api("POST","/api/posts/"+id+"/delete").then(function(r){ if(r.body&&r.body.ok){ msg("削除しました。"); loadScheduled(); } }); }
  function cancelQueued(){
    if(!confirm("予約済み（投稿待ち）をすべて削除します。\\n（投稿済み・添削待ちの下書きは消えません）\\nよろしいですか？")) return;
    var btn=$("cancelBtn"); if(btn){ btn.disabled=true; btn.textContent="キャンセル中…"; }
    api("POST","/api/account/cancel-queued",{account:ACC}).then(function(r){
      if(btn){ btn.disabled=false; btn.textContent="🗑 予約を全てキャンセルする"; }
      if(r.body&&r.body.ok){ msg((r.body.deleted||0)+"本の予約をキャンセルしました。"); loadScheduled(); refreshBadges(); }
      else { msg((r.body&&r.body.error)||"キャンセルに失敗しました。",false); }
    });
  }
  function genDays(){
    var btn=$("genBtn"); if(btn){ btn.disabled=true; btn.textContent="生成中…"; }
    api("POST","/api/account/generate-days",{account:ACC}).then(function(r){
      if(btn){ btn.disabled=false; btn.textContent="✨ 1日分を追加"; }
      if(r.body&&r.body.ok){
        var made=r.body.generated||0;
        var where=(r.body.mode==="auto")?"予約済み":"下書き（添削待ち）";
        msg(made+"本を"+where+"に追加しました（1日分）。");
        loadScheduled(); refreshBadges();
      } else if(r.body&&r.body.at_cap){ msg(r.body.error||"予約の在庫が上限です。",false); }
      else { msg((r.body&&r.body.error)||"生成に失敗しました。",false); }
    });
  }

  // 学習データ画面：文体ステータス・自動拡張・ネタ元一覧を読み込む
  function loadVoiceState(){
    api("GET","/api/account/state?account="+ACC).then(function(r){
      var s=r.body||{};
      $("voiceState").innerHTML = (s.has_voice && s.voice_posts>0)
        ? "<span style='color:var(--ok)'>過去の投稿 "+s.voice_posts+"件 から学習済み</span>"
        : (s.has_voice ? "<span style='color:var(--ok)'>学習済み</span>" : "まだ学習していません");
      var ae=!!s.auto_expand;
      if ($("autoExpand")) $("autoExpand").checked = ae;
      if ($("expandNote")) $("expandNote").innerHTML = ae
        ? "ON：ネタ元・方向性を起点に、AIが内容をある程度ふくらませて書きます。"
        : "OFF：学習データ（ネタ元・方向性）の範囲を超えず、書いてあることから書きます。";
      var cyc=s.cycle_days||5, freq=s.daily_frequency||3;
      var cf=$("cycFreq"); if(cf){ var of=""; for(var k=1;k<=5;k++){ of+="<option value='"+k+"'"+(k===freq?" selected":"")+">"+k+"本</option>"; } cf.innerHTML=of; }
      var cd=$("cycDays"); if(cd){ var od=""; for(var d=3;d<=5;d++){ od+="<option value='"+d+"'"+(d===cyc?" selected":"")+">"+d+"日</option>"; } cd.innerHTML=od; }
      updCycleCalc();
    });
    updLearnCost();
    loadNetaList();
  }
  function updCycleCalc(){
    var f=parseInt(($("cycFreq")||{}).value||"3",10), d=parseInt(($("cycDays")||{}).value||"5",10), z=f*d;
    if ($("cycleCalc")) $("cycleCalc").innerHTML = "1日 <b>"+f+"本</b> × <b>"+d+"日</b> ＝ 1サイクル <b>"+z+"ポスト</b>"+(z>=10?"（推奨の10ポスト以上 ✓）":" <span style='color:#c0392b'>（10ポスト未満。本数か日数を増やすのがおすすめ）</span>");
  }
  function saveCycle(){
    var f=parseInt($("cycFreq").value,10), d=parseInt($("cycDays").value,10);
    api("POST","/api/account/update",{account:ACC,daily_frequency:f,cycle_days:d}).then(function(){ msg("学習サイクルを保存しました（1日"+f+"本 × "+d+"日 ＝ "+(f*d)+"ポスト）。"); });
  }
  function updLearnCost(){
    var n=parseInt(($("learnCount")||{}).value||"200",10);
    var yen=Math.round(n*0.8); // 読み取り1件 約0.8円
    if ($("learnCost")) $("learnCost").innerHTML = "費用の目安：約"+yen.toLocaleString("ja-JP")+"円（過去投稿の読み取り。1回のみ）";
  }
  function learnMore(){
    var n=parseInt($("learnCount").value,10);
    msg("Xから過去の投稿を"+n+"件まで読み込んでいます…（少しかかります）");
    $("learnState").textContent = "読み込み中…";
    api("POST","/api/account/learn-posts",{ account:ACC, count:n }).then(function(r){
      $("learnState").textContent = "";
      if (r.body && r.body.ok && r.body.learned){ msg(r.body.learned+"件の投稿を学習しました（"+comma(r.body.bytes)+"文字）。"); loadVoiceState(); }
      else if (r.body && r.body.ok){ msg(r.body.note||"取得できる投稿がありませんでした。",false); }
      else { msg((r.body&&r.body.error)||"うまくいきませんでした",false); }
    });
  }
  function saveExpand(){
    var on=$("autoExpand").checked;
    api("POST","/api/account/update",{account:ACC,auto_expand:on}).then(function(){
      $("expandNote").innerHTML = on
        ? "ON：ネタ元・方向性を起点に、AIが内容をある程度ふくらませて書きます。"
        : "OFF：学習データ（ネタ元・方向性）の範囲を超えず、書いてあることから書きます。";
      msg(on?"自動拡張をONにしました。":"自動拡張をOFFにしました。");
    });
  }
  function loadNetaList(){
    api("GET","/api/neta/list?account="+ACC).then(function(r){
      var files=(r.body&&r.body.files)||[];
      $("netaList").innerHTML = files.length ? files.map(function(f){
        return "<div class='netaItem'><span>📄 "+esc(f.filename)+"　<span class='note'>"+Math.round((f.bytes||0)/1024)+"KB</span></span><button class='soft' onclick='delNeta("+f.id+")'>削除</button></div>";
      }).join("") : "<div class='note'>まだアップロードされていません。</div>";
    });
  }
  function uploadNeta(){
    var fl=$("netaFile").files; if(!fl||!fl.length) return;
    var done=0, total=fl.length;
    $("netaState").textContent = "アップロード中…";
    for (var i=0;i<fl.length;i++){
      (function(f){
        if (f.size > 512000){ done++; msg("「"+f.name+"」は500KBを超えています。",false); if(done===total){ $("netaState").textContent=""; loadNetaList(); } return; }
        var rd=new FileReader();
        rd.onload=function(){
          api("POST","/api/neta/upload",{account:ACC,filename:f.name,content:rd.result}).then(function(r){
            done++;
            if (!(r.body&&r.body.ok)) msg((r.body&&r.body.error)||("「"+f.name+"」のアップロードに失敗"),false);
            if (done===total){ $("netaState").textContent=""; $("netaFile").value=""; loadNetaList(); msg("アップロードしました。"); }
          });
        };
        rd.readAsText(f);
      })(fl[i]);
    }
  }
  function delNeta(id){ api("POST","/api/neta/delete",{account:ACC,id:id}).then(function(){ msg("削除しました。"); loadNetaList(); }); }

  // 投稿（書き込み）権限の確認：実際に1本投稿→すぐ削除。タイムラインに残さない。
  function testPost(){
    var btn=$("testPostBtn"), note=$("testPostNote");
    if(btn){ btn.disabled=true; btn.textContent="投稿中…"; }
    if(note){ note.textContent=""; }
    api("POST","/api/test-post",{account:ACC,text:"（連携テスト・自動削除されます）"}).then(function(r){
      if(!(r.body&&r.body.ok)||!r.body.tweet_id){
        if(btn){ btn.disabled=false; btn.textContent="📮 テスト投稿（すぐ消す）"; }
        var em=(r.body&&r.body.error)||"投稿に失敗しました。";
        if(note){ note.innerHTML="<span style='color:#c0392b'>✗ "+esc(em)+"</span>"; }
        if(em.indexOf("POST_ENABLED")>=0){ if(note) note.innerHTML="<span class='note'>※ 開発環境では実投稿しません。本番環境で確認してください。</span>"; }
        return;
      }
      var tid=r.body.tweet_id;
      if(btn){ btn.textContent="削除中…"; }
      api("POST","/api/delete-tweet",{account:ACC,tweet_id:tid}).then(function(d){
        if(btn){ btn.disabled=false; btn.textContent="📮 テスト投稿（すぐ消す）"; }
        setWriteVerified(true); // 投稿できた時点で書き込み権限OK（サーバ側もフラグ保存済み）
        if(d.body&&d.body.ok){ msg("テスト投稿に成功し、すぐ削除しました。投稿権限は正常です。"); }
        else { msg("投稿はできました（権限OK）が削除に失敗（ID:"+tid+"）。お手数ですが手動で削除してください。",false); }
      });
    });
  }
  // 投稿(書き込み)権限の確認済み表示の切替。済んだらボタンを隠して確認済み表示にする。
  function setWriteVerified(v){
    if($("writePane")) $("writePane").style.display = v?"none":"block";
    if($("writeDone")){
      $("writeDone").style.display = v?"block":"none";
      if(v) $("writeDone").innerHTML = "<span style='color:var(--ok)'>✓ 投稿（書き込み）権限：確認済み</span>　<a class='note' style='cursor:pointer;text-decoration:underline' onclick='showTestPostAgain()'>もう一度テストする</a>";
    }
  }
  function showTestPostAgain(){ if($("writePane")) $("writePane").style.display="block"; if($("writeDone")) $("writeDone").style.display="none"; if($("testPostNote")) $("testPostNote").textContent=""; }
  function copyMemberId(){
    var t=ACC||""; if(!t) return;
    function done(){ if($("memberIdCopied")){ $("memberIdCopied").textContent="コピーしました"; setTimeout(function(){ if($("memberIdCopied")) $("memberIdCopied").textContent=""; },1500); } }
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(done,function(){}); } else { done(); }
  }
  function saveEmail(){
    var em=($("emailInput")?$("emailInput").value:"").trim();
    var out=$("emailMsg");
    if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(em)){ if(out) out.innerHTML="<span style='color:#c0392b'>メールアドレスを正しい形式で入れてください。</span>"; return; }
    api("POST","/api/account/email",{account:ACC,email:em}).then(function(r){
      if(r.body&&r.body.ok){ if(out) out.innerHTML="<span style='color:var(--ok)'>✓ 保存しました。</span>"; }
      else { if(out) out.innerHTML="<span style='color:#c0392b'>"+esc((r.body&&r.body.error)||"保存に失敗しました。")+"</span>"; }
    });
  }
  function loadSettings(){
    if($("memberIdView")) $("memberIdView").textContent = ACC || "—";
    api("GET","/api/check?account="+ACC).then(function(r){
      $("connState").innerHTML = (r.body&&r.body.ok) ? "<i class='ti ti-link'></i> @"+esc(r.body.handle)+" と連携中" : "連携を確認できませんでした";
    });
    api("GET","/api/account/state?account="+ACC).then(function(r){
      var s=r.body||{};
      if ($("emailInput")) $("emailInput").value = s.email || "";
      if ($("premSwitch")) $("premSwitch").checked = !!s.x_premium;
      setWriteVerified(!!s.write_verified);
      dirStruct = s.direction_struct || null;
      renderDirView(s.direction||"");
    });
  }
  var dirStruct=null;
  function renderDirView(text){
    if (!$("dirView")) return;
    var body = text ? "<pre>"+esc(text)+"</pre>" : "<div class='note'>まだ設定されていません。</div>";
    $("dirView").innerHTML = body + "<div class='row' style='margin-top:8px'><button class='accent' onclick='editDirection()'>✏️ 編集する</button></div>";
  }
  function editDirection(){
    var st=dirStruct||{};
    var h="<label>メインテーマ（1つ）</label>"+chipGroup("smain", DIR_TOPICS, false);
    h+="<label style='margin-top:12px'>サブテーマ（いくつでも）</label>"+chipGroup("ssub", DIR_TOPICS, true);
    h+="<label style='margin-top:12px'>届けたい相手（いくつでも）</label>"+chipGroup("saud", DIR_AUD, true);
    h+="<label style='margin-top:12px'>発信のスタンス・トーン（いくつでも）</label>"+chipGroup("sstance", DIR_STANCE, true);
    h+="<div class='row' style='margin-top:12px'><button class='primary' onclick='saveDirection()'>保存する</button><button class='soft' onclick='loadSettings()'>やめる</button></div>";
    $("dirView").innerHTML=h;
    presetChips("smain", st.main?[st.main]:[]);
    presetChips("ssub", st.subthemes||[]);
    presetChips("saud", st.audience||[]);
    presetChips("sstance", st.stance||[]);
  }
  function saveDirection(){
    var main=chipValues("smain")[0]||"";
    if(!main){ msg("メインテーマを選んでください。",false); return; }
    msg("保存しています…");
    api("POST","/api/account/direction",{account:ACC,main:main,subthemes:chipValues("ssub"),audience:chipValues("saud"),stance:chipValues("sstance")}).then(function(r){
      if(r.body&&r.body.ok){ msg("発信の方向性を更新しました。"); loadSettings(); }
      else { msg((r.body&&r.body.error)||"保存に失敗しました。",false); }
    });
  }
  function savePremium(){
    var on=$("premSwitch").checked;
    api("POST","/api/account/update",{account:ACC,x_premium:on}).then(function(){
      msg(on?"プレミアムON：長文ポストも作れます。":"プレミアムOFF：140文字以内になります。");
    });
  }
  function saveUrlPosts(){
    var on=$("urlSwitch").checked;
    api("POST","/api/account/update",{account:ACC,url_posts:on}).then(function(){
      msg(on?"URL誘導ポストをONにしました（型メニューに「🔗 URL誘導」が出ます）。":"URL誘導ポストをOFFにしました。");
    });
  }
  // 飛ばし先URLの登録（複数）。LINKSをローカルに持ち、保存はリスト全体を上書き。
  var LINKS=[];
  var linkEditIdx=null; // null=フォーム閉／-1=追加／0以上=その行を編集
  function renderLinks(){
    var el=$("linkList"); if(!el) return;
    el.innerHTML = LINKS.length ? LINKS.map(function(l,i){
      var d=l.desc||l.note||"";
      return "<div class='row' style='justify-content:space-between;align-items:flex-start;gap:6px;border-bottom:1px solid var(--border);padding:7px 0'>"
        + "<div style='min-width:0'><b>"+esc(l.label)+"</b>"
        + (l.unit?"<span class='note' style='margin-left:6px'>単価 ¥"+Number(l.unit).toLocaleString()+"</span>":"")
        + (l.title?"<div style='font-size:13px'>"+esc(l.title)+"</div>":"")
        + "<div class='note' style='word-break:break-all'>"+esc(l.url)+"</div>"
        + "<div class='note' style='margin-top:2px'>📝 "+esc(d)+"</div></div>"
        + "<div class='row' style='gap:6px;flex-wrap:nowrap'><button class='soft' onclick='openLinkForm("+i+")'>編集</button><button class='soft' onclick='delLink("+i+")'>削除</button></div></div>";
    }).join("") : "<div class='note'>まだ登録がありません。</div>";
  }
  function openLinkForm(idx){
    linkEditIdx=idx;
    var l = (idx>=0 && LINKS[idx]) ? LINKS[idx] : {label:"",title:"",url:"",desc:"",unit:0};
    if($("linkLabel"))$("linkLabel").value=l.label||"";
    if($("linkTitle"))$("linkTitle").value=l.title||"";
    if($("linkUrl"))$("linkUrl").value=l.url||"";
    if($("linkUnit"))$("linkUnit").value=(l.unit?String(l.unit):"");
    if($("linkDesc"))$("linkDesc").value=l.desc||l.note||"";
    cnt("linkDesc");
    if($("linkFormTitle"))$("linkFormTitle").textContent = idx>=0 ? "URLを編集" : "URLを追加";
    if($("descBtnNote"))$("descBtnNote").textContent="";
    if($("linkForm"))$("linkForm").style.display="block";
    if($("linkAddBtn"))$("linkAddBtn").style.display="none";
  }
  function closeLinkForm(){
    linkEditIdx=null;
    if($("linkForm"))$("linkForm").style.display="none";
    if($("linkAddBtn"))$("linkAddBtn").style.display="inline-flex";
    ["linkLabel","linkTitle","linkUrl","linkUnit","linkDesc"].forEach(function(id){ if($(id))$(id).value=""; });
    cnt("linkDesc");
  }
  function saveLinkForm(){
    var la=($("linkLabel")?$("linkLabel").value:"").trim();
    var ti=($("linkTitle")?$("linkTitle").value:"").trim();
    var u=($("linkUrl")?$("linkUrl").value:"").trim();
    var de=($("linkDesc")?$("linkDesc").value:"").trim();
    if(!la){ msg("ラベル（管理名称）を入れてください。",false); return; }
    if(!ti){ msg("リンクタイトルを入れてください。",false); return; }
    if(u.indexOf("http")!==0){ msg("URL（http から始まる）を入れてください。",false); return; }
    if(!de){ msg("リンク先の説明を入れてください（AIがこれを基に作ります）。",false); return; }
    if(de.length>500){ msg("説明は500文字までです。",false); return; }
    var un=Math.max(0, Math.floor(Number(($("linkUnit")?$("linkUnit").value:"0"))||0));
    var item={label:la, title:ti, desc:de, url:u, unit:un};
    if(linkEditIdx>=0){ LINKS[linkEditIdx]=item; }
    else { if(LINKS.length>=20){ msg("登録は20件までです。",false); return; } LINKS.push(item); }
    saveLinks();
  }
  function describeLink(){
    var u=($("linkUrl")?$("linkUrl").value:"").trim();
    if(u.indexOf("http")!==0){ msg("先にURLを入れてください。",false); return; }
    var btn=$("descBtn"); if(btn){ btn.disabled=true; btn.textContent="読み取り中…"; }
    if($("descBtnNote")) $("descBtnNote").textContent="ページを読んで要約しています…";
    api("POST","/api/account/link-describe",{account:ACC,url:u}).then(function(r){
      if(btn){ btn.disabled=false; btn.textContent="🪄 リンク先をAIに要約させる"; }
      if($("descBtnNote")) $("descBtnNote").textContent="";
      if(r.body&&r.body.ok){
        if($("linkDesc")){ $("linkDesc").value=r.body.desc||""; cnt("linkDesc"); }
        if($("linkTitle") && !$("linkTitle").value.trim() && r.body.title){ $("linkTitle").value=r.body.title; }
        msg("AIが要約しました。内容を確認・修正して『保存』してください。");
      } else {
        msg((r.body&&r.body.error)||"要約できませんでした。手入力してください。",false);
      }
    });
  }
  function delLink(i){ if(!confirm("この飛ばし先を削除しますか？")) return; LINKS.splice(i,1); closeLinkForm(); saveLinks(); }
  function saveLinks(){
    api("POST","/api/account/links",{account:ACC,links:LINKS}).then(function(r){
      if(r.body&&r.body.ok){ LINKS=r.body.links||[]; closeLinkForm(); msg("誘導先URLを保存しました。"); loadCV(); }
      else { msg((r.body&&r.body.error)||"保存に失敗しました。",false); }
    });
  }
  function clearKeys(){ ["xk1","xk2","xk3","xk4","ck"].forEach(function(id){ $(id).value=""; }); }
  function connectX(){
    var x = { apiKey:$("xk1").value.trim(), apiSecret:$("xk2").value.trim(), accessToken:$("xk3").value.trim(), accessSecret:$("xk4").value.trim() };
    if (!x.apiKey||!x.apiSecret||!x.accessToken||!x.accessSecret){ msg("4つの鍵をすべて入れてください。",false); return; }
    var ck = $("ck").value.trim();
    if (!ck){ msg("Claude APIキーを入れてください。",false); return; }
    // 既存メールを同送（未登録の既存会員が再連携でメール必須エラーに当たらないよう）。
    var body = { account:ACC, x:x, claudeKey:ck };
    var curEmail = ($("emailInput")?$("emailInput").value:"").trim();
    if (curEmail) body.email = curEmail;
    if ($("xXerr")) $("xXerr").textContent=""; if ($("xCerr")) $("xCerr").textContent="";
    msg("連携しています…（X・Claude の接続を確認中）");
    api("POST","/api/account/connect",body).then(function(r){
      var d=r.body||{};
      if (d.connected){ var ex = d.learned ? ("　過去の投稿 "+d.learned+"件を自動で学習しました。") : ""; msg("連携できました：@"+esc(d.handle)+"（フォロワー "+comma(d.followers)+"人）"+ex); clearKeys(); hello(); loadSettings(); return; }
      var parts=[];
      if (d.x_ok===false){ if($("xXerr")) $("xXerr").textContent="✗ "+(d.x_error||"X APIの接続に失敗しました"); parts.push("X API"); }
      if (d.claude_ok===false){ if($("xCerr")) $("xCerr").textContent="✗ "+(d.claude_error||"Claude APIキーが正しくありません"); parts.push("Claude API"); }
      if (!parts.length){ msg((d.error)||"うまくいきませんでした",false); }
      else { msg(parts.join("・")+" でエラーです。各欄の赤いメッセージを確認してください。",false); }
    });
  }

  showApp();
</script>
</body>
</html>`;
