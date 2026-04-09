package com.shibwallet.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DAppBrowserPlugin.class);
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#0D0D0D"));
        window.setNavigationBarColor(Color.parseColor("#0D0D0D"));

        View decorView = window.getDecorView();
        decorView.setSystemUiVisibility(
            decorView.getSystemUiVisibility() & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        );
    }
}
