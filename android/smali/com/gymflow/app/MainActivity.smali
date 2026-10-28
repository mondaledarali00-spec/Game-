.class public Lcom/gymflow/app/MainActivity;
.super Landroid/app/Activity;
.source "MainActivity.java"

# GymFlow's native shell.
#
# Deliberately boring: create a WebView, enable JavaScript + DOM storage, let a
# WebViewClient hand external links (UPI apps, browser) to the system, expose a
# tiny JS bridge, then load the packaged web app from the APK.
#
# The whole body is wrapped in a Throwable guard: if anything at all goes wrong
# while the shell starts, the app shows the error on screen instead of dying
# with "keeps stopping".

.field private webView:Landroid/webkit/WebView;


.method public constructor <init>()V
    .locals 0

    invoke-direct {p0}, Landroid/app/Activity;-><init>()V

    return-void
.end method


.method protected onCreate(Landroid/os/Bundle;)V
    .locals 5

    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    :try_start
    # ---- the WebView that hosts assets/www --------------------------------
    new-instance v0, Landroid/webkit/WebView;
    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V

    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v1

    const/4 v2, 0x1
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowContentAccess(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setLoadWithOverviewMode(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setUseWideViewPort(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setJavaScriptCanOpenWindowsAutomatically(Z)V

    const/4 v2, 0x0
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setSupportZoom(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setBuiltInZoomControls(Z)V
    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->setVerticalScrollBarEnabled(Z)V

    # dark background: no white flash before the CSS paints
    const v3, -0xf8f5f8
    invoke-virtual {v0, v3}, Landroid/webkit/WebView;->setBackgroundColor(I)V

    # ---- external links leave the WebView ---------------------------------
    new-instance v1, Lcom/gymflow/app/AppWebViewClient;
    invoke-direct {v1, p0}, Lcom/gymflow/app/AppWebViewClient;-><init>(Landroid/content/Context;)V
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    # ---- window.GymFlowNative.open(url) ----------------------------------
    new-instance v1, Lcom/gymflow/app/Bridge;
    invoke-direct {v1, p0}, Lcom/gymflow/app/Bridge;-><init>(Landroid/app/Activity;)V
    const-string v2, "GymFlowNative"
    invoke-virtual {v0, v1, v2}, Landroid/webkit/WebView;->addJavascriptInterface(Ljava/lang/Object;Ljava/lang/String;)V

    iput-object v0, p0, Lcom/gymflow/app/MainActivity;->webView:Landroid/webkit/WebView;
    invoke-virtual {p0, v0}, Landroid/app/Activity;->setContentView(Landroid/view/View;)V

    # ---- load the offline app straight from the APK -----------------------
    const-string v1, "file:///android_asset/www/index.html"
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V
    :try_end
    .catch Ljava/lang/Throwable; {:try_start .. :try_end} :gf_fail

    return-void

    # ---- last-resort screen instead of a crash ---------------------------
    :gf_fail
    move-exception v4

    new-instance v0, Landroid/widget/TextView;
    invoke-direct {v0, p0}, Landroid/widget/TextView;-><init>(Landroid/content/Context;)V

    const-string v1, "\u26a0\ufe0f GymFlow could not start\n\n"
    invoke-virtual {v4}, Ljava/lang/Throwable;->toString()Ljava/lang/String;
    move-result-object v2
    invoke-virtual {v1, v2}, Ljava/lang/String;->concat(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v1

    invoke-virtual {v0, v1}, Landroid/widget/TextView;->setText(Ljava/lang/CharSequence;)V

    const/high16 v2, 0x41900000
    invoke-virtual {v0, v2}, Landroid/widget/TextView;->setTextSize(F)V

    const/16 v2, 0x30
    invoke-virtual {v0, v2, v2, v2, v2}, Landroid/widget/TextView;->setPadding(IIII)V

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

    const/4 v1, 0x0
    iput-object v1, p0, Lcom/gymflow/app/MainActivity;->webView:Landroid/webkit/WebView;

    :gf_done
    invoke-super {p0}, Landroid/app/Activity;->onDestroy()V

    return-void
.end method
