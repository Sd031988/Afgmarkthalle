# Baut index.html aus src/ (Stil, Inhalt, Skript) zu einer einzelnen Datei.
import pathlib
root = pathlib.Path(__file__).parent
style = (root / "src/style.css").read_text()
body = (root / "src/body.html").read_text()
app = (root / "src/app.js").read_text()
i18n = (root / "src/i18n.js").read_text()
html = f"""<!doctype html>
<html lang="fa-AF" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Markthalle</title>
<meta name="description" content="Markthalle – marketplace for home businesses in Afghanistan and abroad / بازار برای کسب‌وکارهای خانگی">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap">
<style>
{style}
</style>
</head>
<body>
{body}
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js"></script>
<script>
{i18n}
</script>
<script>
{app}
</script>
</body>
</html>
"""
(root / "index.html").write_text(html)
print("index.html", len(html))
