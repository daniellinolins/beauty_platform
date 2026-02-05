import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  plugins: {
    StatusBar: {
      overlaysWebView: false
    }
  },

  server: {
    androidScheme: "http"
  },
  appId: 'br.com.vohu.beautyplatform',
  appName: 'Beauty Platform',
  webDir: 'www'
};

export default config;
