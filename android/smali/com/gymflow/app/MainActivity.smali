.class public Lcom/gymflow/app/MainActivity;
.super Landroid/app/Activity;
.source "MainActivity.java"

# GymFlow's native shell: one Activity whose whole job is to host the
# offline web app from assets/www inside a WebView with DOM storage enabled.
# The equivalent Java is kept in android/src-java for readability.

.field private webView:Landroid/webkit/WebView;


.method public constructor <init>()V
    .locals 0

    invoke-direct {p0}, Landroid/app/Activity;-><init>()V

    return-void
.end method


.method protected onCreate(Landroid/os/Bundle;)V
    .locals 4

    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    # WebView that will host assets/www/index.html
    new-instance v0, Landroid/webkit/WebView;
    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V

    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v1

    const/4 v2, 0x1
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowContentAccess(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setLoadWithOverviewMode(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setUseWideViewPort(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setJavaScriptCanOpenWindowsAutomatically(Z)V

    const/4 v3, 0x0
    invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setSupportZoom(Z)V
    invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setDisplayZoomControls(Z)V
    invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setBuiltInZoomControls(Z)V
    invoke-virtual {v0, v3}, Landroid/webkit/WebView;->setVerticalScrollBarEnabled(Z)V

    # dark background so there is no white flash before the CSS paints
    const v1, -0xf8f5f8
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->setBackgroundColor(I)V

    # route external links (UPI apps, browser) out of the WebView and serve
    # the packaged web app over a secure virtual origin
    new-instance v1, Lcom/gymflow/app/AppWebViewClient;
    invoke-direct {v1, p0}, Lcom/gymflow/app/AppWebViewClient;-><init>(Landroid/content/Context;)V
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    # window.GymFlowNative -> open(url), info()
    new-instance v1, Lcom/gymflow/app/Bridge;
    invoke-direct {v1, p0}, Lcom/gymflow/app/Bridge;-><init>(Landroid/app/Activity;)V
    const-string v2, "GymFlowNative"
    invoke-virtual {v0, v1, v2}, Landroid/webkit/WebView;->addJavascriptInterface(Ljava/lang/Object;Ljava/lang/String;)V

    # Assets are served by AppWebViewClient.shouldInterceptRequest() from
    # https://appassets.androidplatform.net/assets/www/. The WebViewClient
    # falls back to file:///android_asset/www/index.html if that fails.
    const-string v1, "https://appassets.androidplatform.net/assets/www/index.html"
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    iput-object v0, p0, Lcom/gymflow/app/MainActivity;->webView:Landroid/webkit/WebView;
    invoke-virtual {p0, v0}, Landroid/app/Activity;->setContentView(Landroid/view/View;)V

    return-void
.end method


.method public onBackPressed()V
    .locals 2

    iget-object v0, p0, Lcom/gymflow/app/MainActivity;->webView:Landroid/webkit/WebView;

    if-eqz v0, :gf_finish

    invoke-virtual {v0}, Landroid/webkit/WebView;->canGoBack()Z
    move-result v1

    if-eqz v1, :gf_finish

    invoke-virtual {v0}, Landroid/webkit/WebView;->goBack()V

    return-void

    :gf_finish
    invoke-super {p0}, Landroid/app/Activity;->onBackPressed()V

    return-void
.end method


.method protected onDestroy()V
    .locals 2

    iget-object v0, p0, Lcom/gymflow/app/MainActivity;->webView:Landroid/webkit/WebView;

    if-eqz v0, :gf_done

    invoke-virtual {v0}, Landroid/webkit/WebView;->destroy()V

    :gf_done
    invoke-super {p0}, Landroid/app/Activity;->onDestroy()V

    return-void
.end method
