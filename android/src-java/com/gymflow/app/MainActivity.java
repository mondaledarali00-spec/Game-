package com.gymflow.app;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.InputStream;

/**
 * GymFlow's native shell.
 *
 * This is the *readable* reference source for the three classes that are
 * actually compiled into the APK (see ../../smali/com/gymflow/app/*.smali).
 * The smali is hand-written because this build environment has no Android
 * SDK / Gradle; the two are kept in sync by hand.
 *
 * Job of this Activity: host the offline web app (assets/www) in a WebView.
 * No network is required — assets are served from the APK over a secure
 * virtual origin so localStorage behaves like a normal website.
 */
public class MainActivity extends Activity {

    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";
    private static final String APP_URL = APP_ORIGIN + "/assets/www/index.html";
    private static final String FALLBACK_URL = "file:///android_asset/www/index.html";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);

        webView.setVerticalScrollBarEnabled(false);
        webView.setBackgroundColor(0xFF070A08);

        webView.setWebViewClient(new GymClient(this));
        webView.addJavascriptInterface(new GymBridge(this), "GymFlowNative");

        webView.loadUrl(APP_URL);
        setContentView(webView);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /** Serves APK assets over the virtual origin and lets external URLs escape. */
    public static class GymClient extends WebViewClient {
        private static final String HOST = "appassets.androidplatform.net";

        private final Activity activity;

        GymClient(Activity activity) {
            this.activity = activity;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            try {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if (path == null) return null;
                String assetPath = path.substring(1); // strip leading "/"
                InputStream stream = view.getContext().getAssets().open(assetPath);
                return new WebResourceResponse(mime(path), "utf-8", stream);
            } catch (Exception e) {
                return null;
            }
        }

        private static String mime(String path) {
            if (path.endsWith(".html")) return "text/html";
            if (path.endsWith(".js")) return "text/javascript";
            if (path.endsWith(".css")) return "text/css";
            if (path.endsWith(".json")) return "application/json";
            if (path.endsWith(".webmanifest")) return "application/manifest+json";
            if (path.endsWith(".png")) return "image/png";
            if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
            if (path.endsWith(".svg")) return "image/svg+xml";
            return "application/octet-stream";
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (url.startsWith("file://") || url.contains(HOST)) return false;
            try {
                android.content.Intent intent = new android.content.Intent(
                        android.content.Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(intent);
            } catch (Exception ignored) {
                // no app can handle it — keep the user inside GymFlow
            }
            return true;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return shouldOverrideUrlLoading(view, request.getUrl().toString());
        }

        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            if (failingUrl != null && failingUrl.contains(HOST)) {
                view.loadUrl(FALLBACK_URL);
            }
        }
    }

    /** Exposed to JS as window.GymFlowNative */
    public static class GymBridge {
        private final Activity activity;

        GymBridge(Activity activity) {
            this.activity = activity;
        }

        @android.webkit.JavascriptInterface
        public void open(String url) {
            try {
                android.content.Intent intent = new android.content.Intent(
                        android.content.Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(intent);
            } catch (Exception ignored) {
            }
        }

        @android.webkit.JavascriptInterface
        public String info() {
            return "{\"platform\":\"android\",\"shell\":\"webview\",\"app\":\"GymFlow\",\"version\":\"1.0.0\",\"versionCode\":1}";
        }
    }
}
