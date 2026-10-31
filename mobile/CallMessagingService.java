package com.iconnecto.call;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Receives the data-only push the server sends when someone calls, even if iCell is closed, and rings with a full-screen
 * "incoming call" notification (shows over the lock screen when Android allows it).
 * A second push, "call_cancel", removes the notification when the caller hangs up first.
 */
public class CallMessagingService extends FirebaseMessagingService {
  static final String CHANNEL_ID = "icell_calls_v1";
  static final String EXTRA_CALL_ID = "icell_call_id";
  static final String EXTRA_ACTION = "icell_action";

  @Override
  public void onMessageReceived(RemoteMessage message) {
    Map<String, String> data = message.getData();
    String type = data.get("type");
    String callId = data.get("callId");
    if (type == null || callId == null) return;
    if ("call_cancel".equals(type)) {
      cancel(this, callId);
      return;
    }
    if (!"call".equals(type)) return;
    // When iCell is open it rings by itself (realtime), so do not ring twice.
    if (MainActivity.foreground) return;
    show(this, callId, data.get("callerName"));
  }

  static int idFor(String callId) {
    return callId.hashCode();
  }

  static void cancel(Context ctx, String callId) {
    NotificationManager nm = ctx.getSystemService(NotificationManager.class);
    if (nm != null) nm.cancel(idFor(callId));
  }

  private static PendingIntent openApp(Context ctx, String callId, String action, int requestCode) {
    Intent i = new Intent(ctx, MainActivity.class);
    i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    i.putExtra(EXTRA_CALL_ID, callId);
    i.putExtra(EXTRA_ACTION, action);
    return PendingIntent.getActivity(ctx, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static void show(Context ctx, String callId, String callerName) {
    NotificationManager nm = ctx.getSystemService(NotificationManager.class);
    if (nm == null) return;
    Uri ring = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
      ch.setDescription("Rings when someone calls you on iCell");
      ch.setSound(ring, new AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIC)
          .build());
      ch.enableVibration(true);
      ch.setVibrationPattern(new long[] {0, 400, 300, 400, 300, 400});
      ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
      nm.createNotificationChannel(ch);
    }

    String who = (callerName == null || callerName.isEmpty()) ? "Someone" : callerName;
    int id = idFor(callId);
    // Tapping the notification or the full-screen launch shows the Answer / Decline sheet; the buttons act directly.
    PendingIntent ringPi = openApp(ctx, callId, "ring", id);
    PendingIntent answerPi = openApp(ctx, callId, "answer", id + 1);
    PendingIntent declinePi = openApp(ctx, callId, "decline", id + 2);

    NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.sym_action_call)
        .setContentTitle(who)
        .setContentText("Incoming iCell call")
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setAutoCancel(true)
        .setTimeoutAfter(45000)
        .setSound(ring)
        .setVibrate(new long[] {0, 400, 300, 400, 300, 400})
        .setContentIntent(ringPi)
        .setFullScreenIntent(ringPi, true)
        .addAction(0, "Decline", declinePi)
        .addAction(0, "Answer", answerPi);

    Notification n = b.build();
    n.flags |= Notification.FLAG_INSISTENT; // keep ringing until answered, declined or timed out
    nm.notify(id, n);
  }
}
