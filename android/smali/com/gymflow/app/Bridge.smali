.class public Lcom/gymflow/app/Bridge;
.super Ljava/lang/Object;
.source "Bridge.java"

# window.GymFlowNative
#   .open(url)  -> open a URL in the system (browser / UPI app / dialer)
#   .info()     -> JSON string describing the native shell
# The web app degrades gracefully when this object is absent (plain browser).

.field private final activity:Landroid/app/Activity;


.method public constructor <init>(Landroid/app/Activity;)V
    .locals 0

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    iput-object p1, p0, Lcom/gymflow/app/Bridge;->activity:Landroid/app/Activity;

    return-void
.end method


.method public open(Ljava/lang/String;)V
    .locals 4
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    :try_start
    new-instance v0, Landroid/content/Intent;

    const-string v1, "android.intent.action.VIEW"

    invoke-static {p1}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;
    move-result-object v2

    invoke-direct {v0, v1, v2}, Landroid/content/Intent;-><init>(Ljava/lang/String;Landroid/net/Uri;)V

    const/high16 v1, 0x10000000
    invoke-virtual {v0, v1}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;

    iget-object v1, p0, Lcom/gymflow/app/Bridge;->activity:Landroid/app/Activity;
    invoke-virtual {v1, v0}, Landroid/app/Activity;->startActivity(Landroid/content/Intent;)V
    :try_end
    .catch Ljava/lang/Exception; {:try_start .. :try_end} :gf_ignore

    return-void

    :gf_ignore
    return-void
.end method


.method public info()Ljava/lang/String;
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    const-string v0, "{\"platform\":\"android\",\"shell\":\"webview\",\"app\":\"GymFlow\",\"version\":\"1.0.0\",\"versionCode\":1}"

    return-object v0
.end method
