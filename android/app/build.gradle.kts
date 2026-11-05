plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "it.patentec.quiz"
    compileSdk = 34
    defaultConfig {
        applicationId = "it.patentec.quiz"
        minSdk = 29
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }
    // Clé fixe : chaque nouvel APK s'installe par-dessus l'ancien (sinon « paquet non valide »)
    signingConfigs {
        create("fixe") {
            storeFile = file("patente.jks")
            storePassword = "patente"
            keyAlias = "patente"
            keyPassword = "patente"
        }
    }
    buildTypes {
        getByName("debug") { signingConfig = signingConfigs.getByName("fixe") }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
