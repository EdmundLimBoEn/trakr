package systems.edmundlim.trakr

import android.app.Application
import com.google.firebase.FirebaseApp

fun Application.initializeFirebase(): Boolean = FirebaseApp.initializeApp(this) != null
