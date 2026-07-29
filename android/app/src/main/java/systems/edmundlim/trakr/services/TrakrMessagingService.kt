package systems.edmundlim.trakr.services

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import systems.edmundlim.trakr.MainActivity
import systems.edmundlim.trakr.R

class TrakrMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        getSharedPreferences("trakr-messaging", MODE_PRIVATE).edit().putString("latest-token", token).apply()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, getString(R.string.channel_name), NotificationManager.IMPORTANCE_DEFAULT),
        )
        val intent = Intent(this, MainActivity::class.java).putExtra("notificationType", message.data["type"])
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(message.notification?.title ?: "Trakr")
            .setContentText(message.notification?.body ?: "Equipment activity updated.")
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            manager.notify(message.messageId?.hashCode() ?: System.currentTimeMillis().toInt(), notification)
        }
    }

    companion object {
        private const val CHANNEL_ID = "equipment-updates"
    }
}
