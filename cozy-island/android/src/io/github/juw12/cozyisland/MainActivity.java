package io.github.juw12.cozyisland;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * CozyIsland for Android: one full-screen window around the live web app. The page keeps its own data
 * (the WebView's storage), works offline after the first visit (its service worker), and gets what
 * a plain WebView lacks from this class: sharing, saving files, picking files, location, and links
 * to other sites opening in the browser.
 */
public class MainActivity extends Activity {
    private static final String START_URL = "https://juw12.github.io/portfolio/cozy-island/";
    private static final String SCOPE = "juw12.github.io/portfolio/cozy-island";
    private static final String SHELL_VERSION = "1.0.0";
    private static final int REQUEST_LOCATION = 7;
    private static final int REQUEST_FILE = 8;

    // Runs in the page: Android's WebView has no navigator.share and cannot save blob: downloads.
    private static final String PAGE_SCRIPT = "(function(){"
        + "if(window.__androidShell){return;}window.__androidShell=true;"
        + "if(!navigator.share){"
        + "navigator.share=function(d){d=d||{};"
        + "if(d.files&&d.files.length){return Promise.reject(new DOMException('Files cannot be shared here','NotSupportedError'));}"
        + "AndroidShell.share(String(d.title||''),String(d.text||''),String(d.url||''));return Promise.resolve();};"
        + "navigator.canShare=function(d){return !(d&&d.files&&d.files.length);};}"
        + "function save(a){var href=String(a.href||'');"
        + "if(!a.hasAttribute('download')||(href.indexOf('blob:')!==0&&href.indexOf('data:')!==0)){return false;}"
        + "var name=a.getAttribute('download')||'download';"
        + "fetch(href).then(function(r){return r.blob();}).then(function(b){var reader=new FileReader();"
        + "reader.onload=function(){var s=String(reader.result);"
        + "AndroidShell.saveFile(name,b.type||'application/octet-stream',s.slice(s.indexOf(',')+1));};"
        + "reader.readAsDataURL(b);}).catch(function(){});return true;}"
        + "var click=HTMLAnchorElement.prototype.click;"
        + "HTMLAnchorElement.prototype.click=function(){if(!save(this)){click.call(this);}};"
        + "document.addEventListener('click',function(e){"
        + "var a=e.target&&e.target.closest?e.target.closest('a[download]'):null;"
        + "if(a&&e.isTrusted&&save(a)){e.preventDefault();}},true);"
        + "})();";

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private GeolocationPermissions.Callback locationCallback;
    private String locationOrigin;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(getResources().getColor(R.color.background));
        setContentView(web);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString() + " CozyIslandAndroid/" + SHELL_VERSION);
        web.addJavascriptInterface(new Bridge(), "AndroidShell");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme();
                if (scheme.equals("file") || scheme.equals("about") || scheme.equals("blob") || scheme.equals("data")) {
                    return false;
                }
                String place = (uri.getHost() == null ? "" : uri.getHost()) + (uri.getPath() == null ? "" : uri.getPath());
                if (scheme.equals("https") && (place.equals(SCOPE) || place.startsWith(SCOPE + "/"))) {
                    return false;
                }
                openOutside(uri);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                android.util.Log.i("CozyIslandShell", "page finished: " + url);
                view.evaluateJavascript(PAGE_SCRIPT, null);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    // Said in the phone's log, so "no connection" can be told from a page that would not load.
                    android.util.Log.w("CozyIslandShell", "the page did not load: " + error.getErrorCode() + " " + error.getDescription() + " " + request.getUrl());
                    view.loadUrl("file:///android_asset/offline.html");
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                boolean allowed = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                    || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
                if (allowed) {
                    callback.invoke(origin, true, false);
                    return;
                }
                locationOrigin = origin;
                locationCallback = callback;
                requestPermissions(new String[] {
                    Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION,
                }, REQUEST_LOCATION);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQUEST_FILE);
                } catch (Exception error) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                }
                return true;
            }
        });

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) {
            web.loadUrl(START_URL);
        }
    }

    private void openOutside(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception error) {
            Toast.makeText(this, "No app can open this link", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQUEST_LOCATION || locationCallback == null) {
            return;
        }
        boolean granted = false;
        for (int result : results) {
            granted = granted || result == PackageManager.PERMISSION_GRANTED;
        }
        locationCallback.invoke(locationOrigin, granted, false);
        locationCallback = null;
        locationOrigin = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        web.saveState(state);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    /** Called from the page (PAGE_SCRIPT). Methods arrive on a background thread. */
    public class Bridge {
        @JavascriptInterface
        public String version() {
            return SHELL_VERSION;
        }

        @JavascriptInterface
        public void share(final String title, final String text, final String url) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    String body = text.isEmpty() ? url : (url.isEmpty() ? text : text + "\n" + url);
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_TEXT, body);
                    if (!title.isEmpty()) {
                        send.putExtra(Intent.EXTRA_SUBJECT, title);
                    }
                    try {
                        startActivity(Intent.createChooser(send, title.isEmpty() ? null : title));
                    } catch (Exception error) {
                        Toast.makeText(MainActivity.this, "Nothing to share with", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void saveFile(String name, String mime, String base64) {
            String safeName = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            String message;
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri target = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    OutputStream stream = getContentResolver().openOutputStream(target);
                    stream.write(bytes);
                    stream.close();
                    message = "Saved to Downloads: " + safeName;
                } else {
                    File file = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), safeName);
                    FileOutputStream stream = new FileOutputStream(file);
                    stream.write(bytes);
                    stream.close();
                    message = "Saved: " + file.getAbsolutePath();
                }
            } catch (Exception error) {
                message = "Could not save " + safeName;
            }
            final String shown = message;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, shown, Toast.LENGTH_LONG).show();
                }
            });
        }
    }
}
