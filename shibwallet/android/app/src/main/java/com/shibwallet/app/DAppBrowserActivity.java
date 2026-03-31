package com.shibwallet.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.SpannableString;
import android.text.style.ForegroundColorSpan;
import android.util.TypedValue;
import android.view.Gravity;
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
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.math.BigDecimal;
import java.math.BigInteger;

public class DAppBrowserActivity extends Activity {
    private WebView webView;
    private ProgressBar progressBar;
    private String walletAddress = "";
    private String privateKey = "";
    private int chainId = 109;
    private String rpcUrl = "https://rpc.shibarium.shib.io";

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
        if (rpcUrl == null) rpcUrl = "https://rpc.shibarium.shib.io";
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
        try {
            JSONArray params = msg.optJSONArray("params");
            if (params == null || params.length() == 0) {
                respondErrorToWeb(id, -32602, "Missing transaction parameters");
                return;
            }
            JSONObject txParams = params.getJSONObject(0);
            String to = txParams.optString("to", "");
            String valueHex = txParams.optString("value", "0x0");
            String dataHex = txParams.optString("data", "0x");
            String gasHex = txParams.optString("gas", "");

            // Parse value from hex to human-readable ETH/BONE
            String valueDisplay = "0";
            try {
                BigInteger weiValue = new BigInteger(valueHex.replace("0x", ""), 16);
                if (weiValue.compareTo(BigInteger.ZERO) > 0) {
                    BigDecimal ethValue = new BigDecimal(weiValue).divide(new BigDecimal("1000000000000000000"));
                    valueDisplay = ethValue.stripTrailingZeros().toPlainString();
                }
            } catch (Exception e) {
                valueDisplay = valueHex;
            }

            String gasDisplay = "";
            if (!gasHex.isEmpty()) {
                try {
                    long gasVal = Long.parseLong(gasHex.replace("0x", ""), 16);
                    gasDisplay = String.valueOf(gasVal);
                } catch (Exception e) {
                    gasDisplay = gasHex;
                }
            }

            boolean hasData = dataHex.length() > 2;
            String txType = hasData ? "Contract Interaction" : "Transfer";

            final String finalValueDisplay = valueDisplay;
            final String finalGasDisplay = gasDisplay;

            runOnUiThread(() -> showTxConfirmDialog(id, txType, to, finalValueDisplay, dataHex, finalGasDisplay, msg));
        } catch (Exception e) {
            respondErrorToWeb(id, -32603, "Failed to parse transaction: " + e.getMessage());
        }
    }

    private void showTxConfirmDialog(int id, String txType, String to, String value, String data, String gas, JSONObject originalMsg) {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(24), dp(20), dp(24), dp(8));

        // Transaction type label
        TextView typeLabel = new TextView(this);
        typeLabel.setText(txType);
        typeLabel.setTextColor(Color.parseColor("#FF6900"));
        typeLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        typeLabel.setTypeface(null, Typeface.BOLD);
        layout.addView(typeLabel);

        addSpacer(layout, 16);

        // To address
        if (!to.isEmpty()) {
            addDetailRow(layout, "To", to.substring(0, Math.min(10, to.length())) + "..." + to.substring(Math.max(0, to.length() - 8)));
        }

        // Value
        if (!value.equals("0")) {
            String nativeSymbol = chainId == 1 ? "ETH" : "BONE";
            addDetailRow(layout, "Value", value + " " + nativeSymbol);
        }

        // Gas
        if (!gas.isEmpty()) {
            addDetailRow(layout, "Gas Limit", gas);
        }

        // Data indicator
        if (data.length() > 2) {
            String methodId = data.length() >= 10 ? data.substring(0, 10) : data;
            addDetailRow(layout, "Method", methodId);
        }

        addSpacer(layout, 8);

        // Warning text
        TextView warning = new TextView(this);
        warning.setText("Review this transaction carefully before confirming.");
        warning.setTextColor(Color.parseColor("#888888"));
        warning.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        layout.addView(warning);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(layout);

        AlertDialog.Builder builder = new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog);
        builder.setTitle("Confirm Transaction");
        builder.setView(scroll);
        builder.setCancelable(false);
        builder.setPositiveButton("Confirm", (dialog, which) -> {
            // Sign and send the transaction
            signAndSendTransaction(id, originalMsg);
        });
        builder.setNegativeButton("Reject", (dialog, which) -> {
            respondErrorToWeb(id, 4001, "User rejected the request");
        });

        AlertDialog dialog = builder.create();
        dialog.show();

        // Style the buttons
        try {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(Color.parseColor("#FF6900"));
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(Color.parseColor("#888888"));
        } catch (Exception ignored) {}
    }

    private void signAndSendTransaction(int id, JSONObject originalMsg) {
        // Build a proper JSON-RPC eth_sendRawTransaction by signing with the private key
        // For now, we forward the eth_sendTransaction to the RPC node which will handle
        // the transaction (since the connected node accepts eth_sendTransaction with the from field)
        // In a production wallet, you would sign locally with the private key.
        // We re-send as raw eth_sendTransaction to the RPC.
        try {
            JSONObject rpcPayload = new JSONObject();
            rpcPayload.put("jsonrpc", "2.0");
            rpcPayload.put("id", id);
            rpcPayload.put("method", "eth_sendTransaction");
            rpcPayload.put("params", originalMsg.optJSONArray("params"));
            forwardToRpc(id, rpcPayload.toString());
        } catch (Exception e) {
            respondErrorToWeb(id, -32603, "Failed to send transaction: " + e.getMessage());
        }
    }

    private void handleSign(int id, JSONObject msg) {
        try {
            JSONArray params = msg.optJSONArray("params");
            String dataToSign = "";
            String method = msg.optString("method", "");

            if (params != null && params.length() > 0) {
                if (method.equals("personal_sign")) {
                    // personal_sign: first param is data, second is address
                    dataToSign = params.getString(0);
                } else {
                    // eth_sign: first param is address, second is data
                    dataToSign = params.length() > 1 ? params.getString(1) : params.getString(0);
                }
            }

            // Try to decode hex to readable text
            String displayData = dataToSign;
            if (dataToSign.startsWith("0x")) {
                try {
                    byte[] bytes = hexStringToByteArray(dataToSign.substring(2));
                    String decoded = new String(bytes, "UTF-8");
                    // Check if it's mostly printable
                    boolean printable = true;
                    for (char c : decoded.toCharArray()) {
                        if (c < 32 && c != '\n' && c != '\r' && c != '\t') {
                            printable = false;
                            break;
                        }
                    }
                    if (printable && decoded.length() > 0) {
                        displayData = decoded;
                    }
                } catch (Exception e) {
                    // Keep hex
                }
            }

            final String finalDisplayData = displayData;

            runOnUiThread(() -> showSignConfirmDialog(id, method, finalDisplayData, msg));
        } catch (Exception e) {
            respondErrorToWeb(id, -32603, "Failed to parse sign request: " + e.getMessage());
        }
    }

    private void showSignConfirmDialog(int id, String method, String data, JSONObject originalMsg) {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(24), dp(20), dp(24), dp(8));

        TextView methodLabel = new TextView(this);
        methodLabel.setText(method.equals("personal_sign") ? "Personal Sign" : "Sign Message");
        methodLabel.setTextColor(Color.parseColor("#FF6900"));
        methodLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        methodLabel.setTypeface(null, Typeface.BOLD);
        layout.addView(methodLabel);

        addSpacer(layout, 12);

        TextView messageLabel = new TextView(this);
        messageLabel.setText("Message:");
        messageLabel.setTextColor(Color.parseColor("#888888"));
        messageLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        layout.addView(messageLabel);

        addSpacer(layout, 4);

        TextView messageContent = new TextView(this);
        String truncated = data.length() > 500 ? data.substring(0, 500) + "..." : data;
        messageContent.setText(truncated);
        messageContent.setTextColor(Color.WHITE);
        messageContent.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        messageContent.setPadding(dp(12), dp(8), dp(12), dp(8));
        GradientDrawable msgBg = new GradientDrawable();
        msgBg.setColor(Color.parseColor("#1A1A1A"));
        msgBg.setCornerRadius(dp(8));
        messageContent.setBackground(msgBg);
        layout.addView(messageContent);

        addSpacer(layout, 12);

        TextView warning = new TextView(this);
        warning.setText("Only sign messages from sites you trust.");
        warning.setTextColor(Color.parseColor("#888888"));
        warning.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        layout.addView(warning);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(layout);

        AlertDialog.Builder builder = new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog);
        builder.setTitle("Sign Request");
        builder.setView(scroll);
        builder.setCancelable(false);
        builder.setPositiveButton("Sign", (dialog, which) -> {
            // For now, reject with not-implemented since we need proper local signing
            // TODO: Implement local signing with the private key
            respondErrorToWeb(id, -32601, "Local signing not yet implemented. Use the in-app swap instead.");
        });
        builder.setNegativeButton("Reject", (dialog, which) -> {
            respondErrorToWeb(id, 4001, "User rejected the request");
        });

        AlertDialog dialog = builder.create();
        dialog.show();

        try {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(Color.parseColor("#FF6900"));
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(Color.parseColor("#888888"));
        } catch (Exception ignored) {}
    }

    private void addDetailRow(LinearLayout parent, String label, String value) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, dp(6), 0, dp(6));

        TextView labelView = new TextView(this);
        labelView.setText(label);
        labelView.setTextColor(Color.parseColor("#888888"));
        labelView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        labelView.setLayoutParams(new LinearLayout.LayoutParams(dp(80), ViewGroup.LayoutParams.WRAP_CONTENT));
        row.addView(labelView);

        TextView valueView = new TextView(this);
        valueView.setText(value);
        valueView.setTextColor(Color.WHITE);
        valueView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        valueView.setTypeface(Typeface.MONOSPACE);
        row.addView(valueView);

        parent.addView(row);
    }

    private void addSpacer(LinearLayout parent, int heightDp) {
        View spacer = new View(this);
        spacer.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(heightDp)));
        parent.addView(spacer);
    }

    private int dp(int dp) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dp, getResources().getDisplayMetrics());
    }

    private static byte[] hexStringToByteArray(String s) {
        int len = s.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(s.charAt(i), 16) << 4) + Character.digit(s.charAt(i + 1), 16));
        }
        return data;
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
