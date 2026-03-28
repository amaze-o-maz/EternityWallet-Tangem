package com.shibwallet.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;

import org.json.JSONArray;
import org.json.JSONObject;

public class DAppBrowserActivity extends Activity {
    private WebView webView;
    private ProgressBar progressBar;
    private String walletAddress = "";
    private String privateKey = "";
    private int chainId = 109;
    private String rpcUrl = "https://www.shibrpc.com";

    private static final String INJECTED_PROVIDER_JS = buildProviderScript();

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(Color.parseColor("#0D0D0D"));
        getWindow().setNavigationBarColor(Color.parseColor("#0D0D0D"));

        Intent intent = getIntent();
        String url = intent.getStringExtra("url");
        walletAddress = intent.getStringExtra("address");
        privateKey = intent.getStringExtra("privateKey");
        chainId = intent.getIntExtra("chainId", 109);
        rpcUrl = intent.getStringExtra("rpcUrl");
        if (rpcUrl == null) rpcUrl = "https://www.shibrpc.com";
        if (url == null) url = "https://shibaswap.com";

        // Layout
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#0D0D0D"));
        root.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // Progress bar
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 4
        ));
        progressBar.setMax(100);
        progressBar.setProgress(0);
        progressBar.getProgressDrawable().setColorFilter(
            Color.parseColor("#FF6900"),
            android.graphics.PorterDuff.Mode.SRC_IN
        );
        root.addView(progressBar);

        // WebView
        webView = new WebView(this);
        webView.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1.0f
        ));
        webView.setBackgroundColor(Color.parseColor("#0D0D0D"));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " ShibWallet/1.0");
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);

        webView.addJavascriptInterface(new Web3Bridge(), "ShibWalletBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                progressBar.setVisibility(View.VISIBLE);
                // Inject the ethereum provider before anything else loads
                String script = INJECTED_PROVIDER_JS
                    .replace("__WALLET_ADDRESS__", walletAddress)
                    .replace("__CHAIN_ID__", String.valueOf(chainId))
                    .replace("__RPC_URL__", rpcUrl);
                view.evaluateJavascript(script, null);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                progressBar.setVisibility(View.GONE);
                // Re-inject to make sure it's set
                String script = INJECTED_PROVIDER_JS
                    .replace("__WALLET_ADDRESS__", walletAddress)
                    .replace("__CHAIN_ID__", String.valueOf(chainId))
                    .replace("__RPC_URL__", rpcUrl);
                view.evaluateJavascript(script, null);

                // Notify the parent about page info
                sendEvent("pageLoaded", url, view.getTitle());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String reqUrl = request.getUrl().toString();
                // Handle deep links or external URLs
                if (reqUrl.startsWith("http://") || reqUrl.startsWith("https://")) {
                    return false; // Let WebView handle it
                }
                // For other schemes (tel:, mailto:, etc.), open externally
                try {
                    Intent extIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(reqUrl));
                    startActivity(extIntent);
                } catch (Exception e) {
                    // Ignore
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
            }
        });

        root.addView(webView);
        setContentView(root);

        webView.loadUrl(url);
    }

    private void sendEvent(String type, String url, String title) {
        // Could send back to Capacitor via intent result
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            finish();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    /**
     * JavaScript Interface for Web3 communication.
     * dApps call window.ethereum methods, which route through
     * ShibWalletBridge to get wallet data.
     */
    class Web3Bridge {
        @JavascriptInterface
        public String getAddress() {
            return walletAddress;
        }

        @JavascriptInterface
        public int getChainId() {
            return chainId;
        }

        @JavascriptInterface
        public String getRpcUrl() {
            return rpcUrl;
        }

        @JavascriptInterface
        public void postMessage(String message) {
            // Handle RPC requests from the injected provider
            try {
                JSONObject msg = new JSONObject(message);
                String method = msg.getString("method");
                int id = msg.optInt("id", 0);

                switch (method) {
                    case "eth_requestAccounts":
                    case "eth_accounts":
                        respondToWeb(id, "[\"" + walletAddress + "\"]");
                        break;
                    case "eth_chainId":
                        respondToWeb(id, "\"0x" + Integer.toHexString(chainId) + "\"");
                        break;
                    case "net_version":
                        respondToWeb(id, "\"" + chainId + "\"");
                        break;
                    case "eth_sendTransaction":
                        // For now, forward to RPC after signing
                        handleSendTransaction(id, msg);
                        break;
                    case "personal_sign":
                    case "eth_sign":
                        handleSign(id, msg);
                        break;
                    default:
                        // Forward other calls to the RPC
                        forwardToRpc(id, message);
                        break;
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    private void respondToWeb(int id, String result) {
        final String js = "window._shibWalletProviderCallback(" + id + ", null, " + result + ");";
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    private void respondErrorToWeb(int id, int code, String message) {
        final String js = "window._shibWalletProviderCallback(" + id + ", {code:" + code + ",message:\"" + message.replace("\"", "\\\"") + "\"}, null);";
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    private void handleSendTransaction(int id, JSONObject msg) {
        // Forward to RPC - in production this would show a confirmation dialog
        forwardToRpc(id, msg.toString());
    }

    private void handleSign(int id, JSONObject msg) {
        // In production, show a signing confirmation dialog
        respondErrorToWeb(id, 4001, "User rejected the request");
    }

    private void forwardToRpc(int id, String payload) {
        // Forward the JSON-RPC request to the configured RPC URL
        new Thread(() -> {
            try {
                java.net.URL url = new java.net.URL(rpcUrl);
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.getOutputStream().write(payload.getBytes("UTF-8"));

                java.io.InputStream is = conn.getInputStream();
                byte[] data = new byte[8192];
                StringBuilder sb = new StringBuilder();
                int len;
                while ((len = is.read(data)) != -1) {
                    sb.append(new String(data, 0, len, "UTF-8"));
                }
                is.close();

                JSONObject response = new JSONObject(sb.toString());
                String result = response.has("result") ? response.get("result").toString() : "null";
                if (response.has("error")) {
                    JSONObject err = response.getJSONObject("error");
                    respondErrorToWeb(id, err.optInt("code", -1), err.optString("message", "RPC error"));
                } else {
                    // Wrap result properly
                    Object r = response.get("result");
                    if (r instanceof String) {
                        respondToWeb(id, "\"" + r + "\"");
                    } else {
                        respondToWeb(id, r.toString());
                    }
                }
            } catch (Exception e) {
                respondErrorToWeb(id, -32603, "RPC request failed: " + e.getMessage());
            }
        }).start();
    }

    private static String buildProviderScript() {
        return "(function() {" +
            "if (window.ethereum && window.ethereum.isShibWallet) return;" +
            "var _callbacks = {};" +
            "var _nextId = 1;" +
            "window._shibWalletProviderCallback = function(id, error, result) {" +
            "  var cb = _callbacks[id];" +
            "  if (cb) {" +
            "    if (error) cb.reject(error);" +
            "    else cb.resolve(result);" +
            "    delete _callbacks[id];" +
            "  }" +
            "};" +
            "var provider = {" +
            "  isShibWallet: true," +
            "  isMetaMask: true," +
            "  isConnected: function() { return true; }," +
            "  chainId: '0x' + parseInt('__CHAIN_ID__').toString(16)," +
            "  networkVersion: '__CHAIN_ID__'," +
            "  selectedAddress: '__WALLET_ADDRESS__'," +
            "  _events: {}," +
            "  on: function(event, fn) {" +
            "    if (!this._events[event]) this._events[event] = [];" +
            "    this._events[event].push(fn);" +
            "    return this;" +
            "  }," +
            "  removeListener: function(event, fn) {" +
            "    if (this._events[event]) {" +
            "      this._events[event] = this._events[event].filter(function(f) { return f !== fn; });" +
            "    }" +
            "    return this;" +
            "  }," +
            "  emit: function(event) {" +
            "    var args = Array.prototype.slice.call(arguments, 1);" +
            "    if (this._events[event]) {" +
            "      this._events[event].forEach(function(fn) { fn.apply(null, args); });" +
            "    }" +
            "  }," +
            "  request: function(args) {" +
            "    var id = _nextId++;" +
            "    var method = args.method;" +
            "    var params = args.params || [];" +
            "    return new Promise(function(resolve, reject) {" +
            "      _callbacks[id] = { resolve: resolve, reject: reject };" +
            "      var msg = JSON.stringify({ id: id, method: method, params: params, jsonrpc: '2.0' });" +
            "      try { ShibWalletBridge.postMessage(msg); }" +
            "      catch(e) { reject(e); delete _callbacks[id]; }" +
            "    });" +
            "  }," +
            "  send: function(method, params) {" +
            "    if (typeof method === 'object') return this.request(method);" +
            "    return this.request({ method: method, params: params || [] });" +
            "  }," +
            "  sendAsync: function(payload, callback) {" +
            "    this.request({ method: payload.method, params: payload.params })" +
            "      .then(function(r) { callback(null, { id: payload.id, jsonrpc: '2.0', result: r }); })" +
            "      .catch(function(e) { callback(e, null); });" +
            "  }," +
            "  enable: function() { return this.request({ method: 'eth_requestAccounts' }); }" +
            "};" +
            "window.ethereum = provider;" +
            "window.dispatchEvent(new Event('ethereum#initialized'));" +
            "})();";
    }
}
