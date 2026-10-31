package com.iconnecto.call;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Lets the app ask Android whether incoming calls may use the full screen, and open the right Settings page. */
@CapacitorPlugin(name = "CallSetup")
public class CallSetupPlugin extends Plugin {
  @PluginMethod
  public void status(PluginCall call) {
    Context ctx = getContext();
    NotificationManager nm = ctx.getSystemService(NotificationManager.class);
    boolean notifications = nm != null && nm.areNotificationsEnabled();
    boolean fullScreen = true;
    if (Build.VERSION.SDK_INT >= 34 && nm != null) fullScreen = nm.canUseFullScreenIntent();
    JSObject r = new JSObject();
    r.put("notifications", notifications);
    r.put("fullScreenIntent", fullScreen);
    call.resolve(r);
  }

  @PluginMethod
  public void openFullScreenSettings(PluginCall call) {
    Context ctx = getContext();
    Intent i;
    if (Build.VERSION.SDK_INT >= 34) {
      i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + ctx.getPackageName()));
    } else {
      i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
    }
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    ctx.startActivity(i);
    call.resolve();
  }
}
