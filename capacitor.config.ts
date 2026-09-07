import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.payday.tracker',
  appName: 'Payday',
  // The Vite build is copied into the APK, so the app carries its own assets and
  // never needs a network or a host.
  webDir: 'dist',
  android: {
    backgroundColor: '#12141a',
  },
}

export default config
