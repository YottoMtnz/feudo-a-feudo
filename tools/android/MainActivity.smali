# Feudo a Feudo — código de la app de Android (subconjunto de smali que entiende tools/android/dex.py)
# Una sola pantalla: un WebView a pantalla completa con el juego de assets/www.

.class public Lcom/fraudy/feudo/MainActivity;
.super Landroid/app/Activity;

.field private web:Landroid/webkit/WebView;

.method public constructor <init>()V
    .locals 0
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V
    return-void
.end method

.method protected onCreate(Landroid/os/Bundle;)V
    .locals 4
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V
    # pantalla completa y pantalla siempre encendida (FLAG_FULLSCREEN | FLAG_KEEP_SCREEN_ON)
    invoke-virtual {p0}, Landroid/app/Activity;->getWindow()Landroid/view/Window;
    move-result-object v0
    const/16 v1, 0x480
    invoke-virtual {v0, v1}, Landroid/view/Window;->addFlags(I)V
    # Android 9 o posterior: dibujar también junto a la cámara frontal (si no, ese lado queda en negro)
    sget v1, Landroid/os/Build$VERSION;->SDK_INT:I
    const/16 v2, 0x1c
    if-lt v1, v2, :sin_recorte
    invoke-virtual {v0}, Landroid/view/Window;->getAttributes()Landroid/view/WindowManager$LayoutParams;
    move-result-object v1
    const/4 v2, 0x1
    iput v2, v1, Landroid/view/WindowManager$LayoutParams;->layoutInDisplayCutoutMode:I
    invoke-virtual {v0, v1}, Landroid/view/Window;->setAttributes(Landroid/view/WindowManager$LayoutParams;)V
    :sin_recorte
    new-instance v0, Landroid/webkit/WebView;
    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V
    iput-object v0, p0, Lcom/fraudy/feudo/MainActivity;->web:Landroid/webkit/WebView;
    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v1
    const/4 v2, 0x1
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V
    # la música puede empezar sin tocar antes la pantalla
    const/4 v3, 0x0
    invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V
    # el tamaño de letra del sistema no deforma la interfaz
    const/16 v3, 0x64
    invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setTextZoom(I)V
    new-instance v1, Lcom/fraudy/feudo/Cliente;
    invoke-direct {v1, p0}, Lcom/fraudy/feudo/Cliente;-><init>(Landroid/app/Activity;)V
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V
    const v1, 0xff0d0b0a
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->setBackgroundColor(I)V
    invoke-virtual {p0, v0}, Landroid/app/Activity;->setContentView(Landroid/view/View;)V
    invoke-direct {p0}, Lcom/fraudy/feudo/MainActivity;->inmersivo()V
    const-string v1, "file:///android_asset/www/index.html#android"
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V
    return-void
.end method

# oculta las barras del sistema (modo inmersivo: reaparecen al deslizar desde el borde)
.method private inmersivo()V
    .locals 2
    invoke-virtual {p0}, Landroid/app/Activity;->getWindow()Landroid/view/Window;
    move-result-object v0
    invoke-virtual {v0}, Landroid/view/Window;->getDecorView()Landroid/view/View;
    move-result-object v0
    const/16 v1, 0x1706
    invoke-virtual {v0, v1}, Landroid/view/View;->setSystemUiVisibility(I)V
    return-void
.end method

.method public onWindowFocusChanged(Z)V
    .locals 0
    invoke-super {p0, p1}, Landroid/app/Activity;->onWindowFocusChanged(Z)V
    if-eqz p1, :fin
    invoke-direct {p0}, Lcom/fraudy/feudo/MainActivity;->inmersivo()V
    :fin
    return-void
.end method

# botón Atrás: lo decide el juego (cierra ventanas, pausa, vuelve al menú o pregunta si salir)
.method public onBackPressed()V
    .locals 3
    iget-object v0, p0, Lcom/fraudy/feudo/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :salir
    const-string v1, "window.FF&&FF.App&&FF.App.onBack&&FF.App.onBack()"
    const/4 v2, 0x0
    invoke-virtual {v0, v1, v2}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V
    return-void
    :salir
    invoke-super {p0}, Landroid/app/Activity;->onBackPressed()V
    return-void
.end method

.method protected onPause()V
    .locals 1
    invoke-super {p0}, Landroid/app/Activity;->onPause()V
    iget-object v0, p0, Lcom/fraudy/feudo/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :fin
    invoke-virtual {v0}, Landroid/webkit/WebView;->onPause()V
    :fin
    return-void
.end method

.method protected onResume()V
    .locals 1
    invoke-super {p0}, Landroid/app/Activity;->onResume()V
    iget-object v0, p0, Lcom/fraudy/feudo/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :fin
    invoke-virtual {v0}, Landroid/webkit/WebView;->onResume()V
    :fin
    invoke-direct {p0}, Lcom/fraudy/feudo/MainActivity;->inmersivo()V
    return-void
.end method


# Navegación: «feudo:salir» cierra la app; los enlaces web se abren en el navegador del móvil.
.class public Lcom/fraudy/feudo/Cliente;
.super Landroid/webkit/WebViewClient;

.field private final act:Landroid/app/Activity;

.method public constructor <init>(Landroid/app/Activity;)V
    .locals 0
    invoke-direct {p0}, Landroid/webkit/WebViewClient;-><init>()V
    iput-object p1, p0, Lcom/fraudy/feudo/Cliente;->act:Landroid/app/Activity;
    return-void
.end method

.method public shouldOverrideUrlLoading(Landroid/webkit/WebView;Ljava/lang/String;)Z
    .locals 3
    const-string v0, "feudo:"
    invoke-virtual {p2, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :web
    iget-object v0, p0, Lcom/fraudy/feudo/Cliente;->act:Landroid/app/Activity;
    invoke-virtual {v0}, Landroid/app/Activity;->finish()V
    const/4 v0, 0x1
    return v0
    :web
    const-string v0, "http"
    invoke-virtual {p2, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :local
    :try_start
    new-instance v0, Landroid/content/Intent;
    const-string v1, "android.intent.action.VIEW"
    invoke-static {p2}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;
    move-result-object v2
    invoke-direct {v0, v1, v2}, Landroid/content/Intent;-><init>(Ljava/lang/String;Landroid/net/Uri;)V
    iget-object v1, p0, Lcom/fraudy/feudo/Cliente;->act:Landroid/app/Activity;
    invoke-virtual {v1, v0}, Landroid/app/Activity;->startActivity(Landroid/content/Intent;)V
    :try_end
    .catchall {:try_start .. :try_end} :hecho
    :hecho
    const/4 v0, 0x1
    return v0
    :local
    const/4 v0, 0x0
    return v0
.end method
