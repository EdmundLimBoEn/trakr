package systems.edmundlim.trakr

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.AppCheckProviderFactory

fun Application.initializeFirebase(providerFactory: AppCheckProviderFactory): Boolean {
    val app = FirebaseApp.initializeApp(this) ?: return false
    FirebaseAppCheck.getInstance(app).installAppCheckProviderFactory(providerFactory)
    return true
}
