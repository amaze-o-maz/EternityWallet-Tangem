package com.shibwallet.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int STATUS_BAR_COLOR = Color.parseColor("#0D0D0D");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Set status bar color BEFORE super.onCreate so Capacitor doesn't override
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        window.setStatusBarColor(STATUS_BAR_COLOR);
        window.setNavigationBarColor(STATUS_BAR_COLOR);

        registerPlugin(DAppBrowserPlugin.class);
        super.onCreate(savedInstanceState);

        // Re-apply after Capacitor init in case it overrides
        window.setStatusBarColor(STATUS_BAR_COLOR);
        window.setNavigationBarColor(STATUS_BAR_COLOR);

        View decorView = window.getDecorView();
        int flags = decorView.getSystemUiVisibility();
        flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        decorView.setSystemUiVisibility(flags);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Ensure color persists after app resume
        Window window = getWindow();
        window.setStatusBarColor(STATUS_BAR_COLOR);
        window.setNavigationBarColor(STATUS_BAR_COLOR);
    }
}
