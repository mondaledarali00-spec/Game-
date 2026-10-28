.class public Lcom/gymflow/app/AppWebViewClient;
.super Landroid/webkit/WebViewClient;
.source "AppWebViewClient.java"

# Keeps the packaged app (file:///android_asset/www) inside the WebView and hands
# every other URL to the system, so upi:// / https bank pages / tel: / mailto:
# open in the right app on top of GymFlow.
#
# Kept intentionally tiny: two overloads, no asset interception, one try/catch.

.field private final context:Landroid/content/Context;


.method public constructor <init>(Landroid/content/Context;)V
    .locals 0

    invoke-direct {p0}, Landroid/webkit/WebViewClient;-><init>()V

    iput-object p1, p0, Lcom/gymflow/app/AppWebViewClient;->context:Landroid/content/Context;

    return-void
.end method


.method public shouldOverrideUrlLoading(Landroid/webkit/WebView;Ljava/lang/String;)Z
    .locals 4

    # in-app pages stay in-app
    const-string v0, "file://"
    invoke-virtual {p2, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
    move-result v0

    if-eqz v0, :gf_external

    const/4 v0, 0x0
    return v0

    :gf_external
    :try_start
    new-instance v0, Landroid/content/Intent;
    const-string v1, "android.intent.action.VIEW"
    invoke-static {p2}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;
    move-result-object v2
    invoke-direct {v0, v1, v2}, Landroid/content/Intent;-><init>(Ljava/lang/String;Landroid/net/Uri;)V

    const/high16 v3, 0x10000000
    invoke-virtual {v0, v3}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;

    iget-object v1, p0, Lcom/gymflow/app/AppWebViewClient;->context:Landroid/content/Context;
    invoke-virtual {v1, v0}, Landroid/content/Context;->startActivity(Landroid/content/Intent;)V
    :try_end
    .catch Ljava/lang/Exception; {:try_start .. :try_end} :gf_caught

    :gf_caught
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
