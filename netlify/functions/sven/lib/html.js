function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHTML(title)}</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;color:#172126;background:#f7f8f8}
    main{max-width:980px;margin:0 auto;padding:32px 18px 56px}
    h1{margin:0 0 10px;font-size:32px}
    h2{margin-top:30px;font-size:20px}
    p{line-height:1.5}
    a.button,button{display:inline-block;margin-top:14px;padding:11px 15px;border:0;border-radius:8px;background:#145c52;color:white;font-weight:700;text-decoration:none;font-size:15px;cursor:pointer}
    button.secondary,a.secondary{background:#334155}
    label{display:block;font-weight:650;margin-top:16px}
    input,select{width:100%;box-sizing:border-box;padding:12px;border:1px solid #b9c2ca;border-radius:8px;font-size:16px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
    .card{background:white;border:1px solid #d8dfdd;border-radius:8px;padding:16px}
    .note{background:#eef7f4;border-left:4px solid #145c52;padding:12px;margin:16px 0}
    .error{background:#fff2f2;border-left:4px solid #a83232;padding:12px;margin:16px 0}
    table{width:100%;border-collapse:collapse;background:white;border:1px solid #d8dfdd}
    th,td{padding:9px;border-bottom:1px solid #e5e9e8;text-align:left;vertical-align:top}
    th{background:#eef2f1}
    pre{white-space:pre-wrap;background:white;border:1px solid #d8dfdd;padding:14px;border-radius:8px}
  </style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function htmlResponse(statusCode, title, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: layout(title, body)
  };
}

function messagePage(title, message, statusCode = 200) {
  return htmlResponse(statusCode, title, `<h1>${escapeHTML(title)}</h1><p>${escapeHTML(message)}</p>`);
}

module.exports = {
  escapeHTML,
  layout,
  htmlResponse,
  messagePage
};

