package com.iconnecto.call;

import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

/**
 * Draws the app edge to edge and tells the web page how much room to leave (CSS variables --sat / --sab).
 * Also hands an incoming-call tap (from the call notification) to the page, and may show over the lock screen
 * for that one call only.
 */
public class MainActivity extends BridgeActivity {
  /** True while iCell is on screen; the call notification stays quiet then because the app rings by itself. */
  static volatile boolean foreground = false;

  private final Handler handler = new Handler(Looper.getMainLooper());
  private String script = "";
  private String pendingCall = "";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(CallSetupPlugin.class); // must come before super.onCreate
    super.onCreate(savedInstanceState);

    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    getWindow().setStatusBarColor(Color.TRANSPARENT);
    getWindow().setNavigationBarColor(Color.TRANSPARENT);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      getWindow().getAttributes().layoutInDisplayCutoutMode =
          WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
    }

    boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
        == Configuration.UI_MODE_NIGHT_YES;
    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    controller.setAppearanceLightStatusBars(!night);
    controller.setAppearanceLightNavigationBars(!night);

    final View content = findViewById(android.R.id.content);
    final float density = getResources().getDisplayMetrics().density;
    ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (view, insets) -> {
      Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
      Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
      content.setPadding(0, 0, 0, ime.bottom);
      float top = bars.top / density;
      float bottom = ime.bottom > 0 ? 0 : bars.bottom / density;
      script = "document.documentElement.style.setProperty('--sat','" + top + "px');"
          + "document.documentElement.style.setProperty('--sab','" + bottom + "px');";
      inject();
      return insets;
    });
    ViewCompat.requestApplyInsets(getWindow().getDecorView());

    // The page loads after the first insets pass, so repeat the injection for a few seconds.
    int[] delays = {400, 1200, 2500, 5000, 8000};
    for (int d : delays) handler.postDelayed(this::inject, d);

    handleCallIntent(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleCallIntent(intent);
  }

  @Override
  public void onResume() {
    super.onResume();
    foreground = true;
    inject();
  }

  @Override
  public void onPause() {
    foreground = false;
    super.onPause();
  }

  @Override
  public void onStop() {
    allowOverLockScreen(false); // the app never stays visible over the lock screen once it is backgrounded
    super.onStop();
  }

  private void allowOverLockScreen(boolean on) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(on);
      setTurnScreenOn(on);
    } else {
      int flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
      if (on) getWindow().addFlags(flags);
      else getWindow().clearFlags(flags);
    }
  }

  /** A tap on the call notification (or its full-screen launch) arrives as extras; pass them to the page once. */
  private void handleCallIntent(Intent intent) {
    if (intent == null) return;
    String callId = intent.getStringExtra(CallMessagingService.EXTRA_CALL_ID);
    String action = intent.getStringExtra(CallMessagingService.EXTRA_ACTION);
    if (callId == null || action == null) return;
    intent.removeExtra(CallMessagingService.EXTRA_CALL_ID);
    intent.removeExtra(CallMessagingService.EXTRA_ACTION);

    CallMessagingService.cancel(this, callId); // silences the ringing notification
    if (!"decline".equals(action)) allowOverLockScreen(true);

    try {
      JSONObject o = new JSONObject();
      o.put("callId", callId);
      o.put("action", action);
      o.put("n", System.currentTimeMillis());
      pendingCall = "window.__icellPendingCall=" + o.toString() + ";window.dispatchEvent(new Event('icell-call'));";
    } catch (Exception e) {
      return;
    }
    int[] delays = {0, 400, 1200, 2500, 5000, 8000};
    for (int d : delays) handler.postDelayed(this::inject, d);
  }

  private void inject() {
    if (getBridge() == null) return;
    final String js = script + pendingCall;
    if (js.isEmpty()) return;
    WebView web = getBridge().getWebView();
    if (web != null) web.post(() -> web.evaluateJavascript(js, null));
  }
}
