package systems.edmundlim.trakr

import android.app.Application
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory

class TrakrApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        initializeFirebase(DebugAppCheckProviderFactory.getInstance())
    }
}
