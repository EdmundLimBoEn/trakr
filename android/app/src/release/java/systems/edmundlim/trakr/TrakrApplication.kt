package systems.edmundlim.trakr

import android.app.Application
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory

class TrakrApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        initializeFirebase(PlayIntegrityAppCheckProviderFactory.getInstance())
    }
}
