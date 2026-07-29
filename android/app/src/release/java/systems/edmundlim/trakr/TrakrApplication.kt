package systems.edmundlim.trakr

import android.app.Application

class TrakrApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        initializeFirebase()
    }
}
