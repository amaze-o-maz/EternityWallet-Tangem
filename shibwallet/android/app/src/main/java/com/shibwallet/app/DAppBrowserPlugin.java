package com.shibwallet.app;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DAppBrowser")
public class DAppBrowserPlugin extends Plugin {

    @PluginMethod()
    public void open(PluginCall call) {
        String url = call.getString("url", "https://shibaswap.com");
        String address = call.getString("address", "");
        String privateKey = call.getString("privateKey", "");
        int chainId = call.getInt("chainId", 109);
        String rpcUrl = call.getString("rpcUrl", "https://www.shibrpc.com");

        Intent intent = new Intent(getContext(), DAppBrowserActivity.class);
        intent.putExtra("url", url);
        intent.putExtra("address", address);
        intent.putExtra("privateKey", privateKey);
        intent.putExtra("chainId", chainId);
        intent.putExtra("rpcUrl", rpcUrl);

        getContext().startActivity(intent);
        call.resolve(new JSObject().put("success", true));
    }
}
