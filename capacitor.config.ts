import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "com.tareeqalnoor.app",
  appName: "طريق النور",
  webDir: "out",
  server: {
    androidScheme: "https",
    url: "https://www.tareeq-alnoor.online",
    cleartext: false,
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  ios: {
    scheme: "Tareeq Al-Noor",
    contentInset: "automatic",
    backgroundColor: "#ffffff",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: "#f59e0b",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#f59e0b",
    },
  },
}

export default config
