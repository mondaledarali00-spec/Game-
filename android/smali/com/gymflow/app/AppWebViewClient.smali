.class public Lcom/gymflow/app/AppWebViewClient;
.super Landroid/webkit/WebViewClient;
.source "AppWebViewClient.java"

# Three jobs:
#
#  1. serve assets/www/* from the APK over a virtual https origin
#     (https://appassets.androidplatform.net/assets/www/...) so the web app
#     gets a real, secure origin: localStorage, IndexedDB and fetch to the
#     GymFlow backend all behave exactly like they do in a browser.
#  2. if that ever fails, fall back to loading file:///android_asset/www.
#  3. push every other URL (upi://, https bank pages, tel:, mailto:) to the
#     system so the right app opens on top of GymFlow.

.field private static final APP_HOST:Ljava/lang/String; = "appassets.androidplatform.net"

.field private final context:Landroid/content/Context;


.method public constructor <init>(Landroid/content/Context;)V
    .locals 0

    invoke-direct {p0}, Landroid/webkit/WebViewClient;-><init>()V

    iput-object p1, p0, Lcom/gymflow/app/AppWebViewClient;->context:Landroid/content/Context;

    return-void
.end method


# ---------------------------------------------------------------- assets
.method public shouldInterceptRequest(Landroid/webkit/WebView;Landroid/webkit/WebResourceRequest;)Landroid/webkit/WebResourceResponse;
    .locals 7

    :try_start
    invoke-interface {p2}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;
    move-result-object v0

    invoke-virtual {v0}, Landroid/net/Uri;->getPath()Ljava/lang/String;
    move-result-object v1

    # "/assets/www/index.html" -> "assets/www/index.html"
    const/4 v2, 0x1
    invoke-virtual {v1, v2}, Ljava/lang/String;->substring(I)Ljava/lang/String;
    move-result-object v2

    invoke-virtual {p1}, Landroid/webkit/WebView;->getContext()Landroid/content/Context;
    move-result-object v3
    invoke-virtual {v3}, Landroid/content/Context;->getAssets()Landroid/content/res/AssetManager;
    move-result-object v3

    # AssetManager.ACCESS_STREAMING == 1
    invoke-virtual {v3, v2, v2}, Landroid/content/res/AssetManager;->open(Ljava/lang/String;I)Ljava/io/InputStream;
    move-result-object v3

    invoke-direct {p0, v1}, Lcom/gymflow/app/AppWebViewClient;->mimeFor(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v4

    const-string v5, "utf-8"

    new-instance v6, Landroid/webkit/WebResourceResponse;
    invoke-direct {v6, v4, v5, v3}, Landroid/webkit/WebResourceResponse;-><init>(Ljava/lang/String;Ljava/lang/String;Ljava/io/InputStream;)V
    :try_end
    .catch Ljava/lang/Exception; {:try_start .. :try_end} :gf_none

    return-object v6

    :gf_none
    const/4 v0, 0x0
    return-object v0
.end method


.method private mimeFor(Ljava/lang/String;)Ljava/lang/String;
    .locals 1

    const-string v0, ".html"
    invoke-virtual {p1, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-nez v0, :gf_m_js
    const-string v0, "text/html; charset=utf-8"
    return-object v0

    :gf_m_js
    const-string v0, ".js"
    invoke-virtual {p1, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-nez v0, :gf_m_css
    const-string v0, "text/javascript; charset=utf-8"
    return-object v0

    :gf_m_css
    const-string v0, ".css"
    invoke-virtual {p1, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-nez v0, :gf_m_json
    const-string v0, "text/css; charset=utf-8"
    return-object v0

    :gf_m_json
    const-string v0, ".json"
    invoke-virtual {p1, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-nez v0, :gf_m_man
    const-string v0, "application/json"
    return-object v0

    :gf_m_man
    const-string v0, ".webmanifest"
    invoke-virtual {p1, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-nez v0, :gf_m_png
    const-string v0, "application/manifest+json"
    return-object v0

    :gf_m_png
    const-string v0, ".png"
    invoke-virtual {p1, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-nez v0, :gf_m_jpg
    const-string v0, "image/png"
    return-object v0

    :gf_m_jpg
    const-string v0, ".jpg"
    invoke-virtual {p1, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-nez v0, :gf_m_svg
    const-string v0, "image/jpeg"
    return-object v0

    :gf_m_svg
    const-string v0, ".svg"
    invoke-virtual {p1, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-nez v0, :gf_m_default
    const-string v0, "image/svg+xml"
    return-object v0

    :gf_m_default
    const-string v0, "application/octet-stream"
    return-object v0
.end method


# ------------------------------------------------------------- navigation
.method public shouldOverrideUrlLoading(Landroid/webkit/WebView;Ljava/lang/String;)Z
    .locals 4

    # our own app origin and local files stay inside the WebView
    const-string v0, "file://"
    invoke-virtual {p2, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
    move-result v0
    if-nez v0, :gf_chk_asset

    const/4 v0, 0x0
    return v0

    :gf_chk_asset
    const-string v0, "appassets.androidplatform.net"
    invoke-virtual {p2, v0}, Ljava/lang/String;->contains(Ljava/lang/CharSequence;)Z
    move-result v0
    if-nez v0, :gf_external

    const/4 v0, 0x0
    return v0

    :gf_external
    :try_start
    new-instance v0, Landroid/content/Intent;

    const-string v1, "android.intent.action.VIEW"

    invoke-static {p2}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;
    move-result-object v2

    invoke-direct {v0, v1, v2}, Landroid/content/Intent;-><init>(Ljava/lang/String;Landroid/net/Uri;)V

    const/high16 v1, 0x10000000
    invoke-virtual {v0, v1}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;

    iget-object v1, p0, Lcom/gymflow/app/AppWebViewClient;->context:Landroid/content/Context;
    invoke-virtual {v1, v0}, Landroid/content/Context;->startActivity(Landroid/content/Intent;)V
    :try_end
    .catch Ljava/lang/Exception; {:try_start .. :try_end} :gf_catch

    :gf_catch
    const/4 v0, 0x1
    return v0
.end method


.method public shouldOverrideUrlLoading(Landroid/webkit/WebView;Landroid/webkit/WebResourceRequest;)Z
    .locals 2

    invoke-interface {p2}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;
    move-result-object v0

    invoke-virtual {v0}, Landroid/net/Uri;->toString()Ljava/lang/String;
    move-result-object v0

    invoke-virtual {p0, p1, v0}, Lcom/gymflow/app/AppWebViewClient;->shouldOverrideUrlLoading(Landroid/webkit/WebView;Ljava/lang/String;)Z
    move-result v0

    return v0
.end method


# --------------------------------------------------------------- fallback
.method public onReceivedError(Landroid/webkit/WebView;ILjava/lang/String;Ljava/lang/String;)V
    .locals 2

    # If the virtual-origin document itself failed, boot from the APK with
    # file:// so the app still opens (e.g. on very old WebView builds).
    const-string v0, "appassets.androidplatform.net"
    invoke-virtual {p4, v0}, Ljava/lang/String;->contains(Ljava/lang/CharSequence;)Z
    move-result v0
    if-eqz v0, :gf_done

    const-string v1, "file:///android_asset/www/index.html"
    invoke-virtual {p1, v1}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    :gf_done
    return-void
.end method
